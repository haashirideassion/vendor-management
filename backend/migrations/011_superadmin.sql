-- Phase 6: platform-level superadmin, distinct from org-scoped admin roles.
--
-- Per the migration plan: superadmin gets standing access to (a) organizations
-- (create/suspend/archive), (b) vendors' GLOBAL verification_status only
-- (never org-specific organization_vendors.status, never bank/compliance
-- documents), and (c) a break-glass path for everything else (engagements,
-- POs, invoices, contracts) that requires a reason and writes an audit_log
-- entry. It must NOT be implemented as membership rows in every org, and
-- must NOT get a blanket SELECT policy on business tables.

-- ─── platform_admins ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS platform_admins (
  profile_id uuid PRIMARY KEY REFERENCES profiles(id),
  granted_by uuid REFERENCES profiles(id),
  granted_at timestamptz DEFAULT now()
);

ALTER TABLE platform_admins ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_platform_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (SELECT 1 FROM platform_admins WHERE profile_id = auth.uid());
$$;

CREATE POLICY "platform_admins: platform admins read" ON platform_admins
  FOR SELECT USING (is_platform_admin());

CREATE POLICY "platform_admins: platform admins manage" ON platform_admins
  FOR ALL USING (is_platform_admin()) WITH CHECK (is_platform_admin());

-- Bootstrap: the one existing admin becomes the first platform admin so
-- there's no lockout. Adjust/add more via the platform_admins table directly.
INSERT INTO platform_admins (profile_id)
SELECT id FROM profiles WHERE role = 'admin'
ON CONFLICT DO NOTHING;

-- ─── organizations: status + platform-admin-only lifecycle management ──────
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active';
ALTER TABLE organizations ADD CONSTRAINT organizations_status_check
  CHECK (status IN ('active', 'suspended', 'archived'));

DROP POLICY IF EXISTS "organizations: admins insert" ON organizations;
CREATE POLICY "organizations: platform admins insert" ON organizations
  FOR INSERT WITH CHECK (is_platform_admin());

DROP POLICY IF EXISTS "organizations: admins delete" ON organizations;
CREATE POLICY "organizations: platform admins delete" ON organizations
  FOR DELETE USING (is_platform_admin());

-- Org admins can still update their own org's name/logo; status changes are
-- only ever made through the superadmin backend route (service-role key),
-- not exposed through this policy at all.
DROP POLICY IF EXISTS "organizations: org admins update" ON organizations;
CREATE POLICY "organizations: org admins or platform admins update" ON organizations
  FOR UPDATE USING (is_org_admin(id) OR is_platform_admin());

-- ─── vendors: global verification_status (platform-level, separate from ───
-- organization_vendors.status which stays per-org) ──────────────────────────
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS verification_status text NOT NULL DEFAULT 'pending';
ALTER TABLE vendors ADD CONSTRAINT vendors_verification_status_check
  CHECK (verification_status IN ('pending', 'verified', 'rejected'));

-- ─── Break-glass access for business tables superadmin has no standing ─────
-- access to. Requires a reason, writes an audit_log entry naming the admin,
-- org, entity, and reason. The Express route calls this to log, then does
-- the actual read via the service-role key (RLS still denies superadmin
-- direct SELECT access to these tables -- no blanket policy is added here).
CREATE OR REPLACE FUNCTION public.support_view_entity(
  p_entity_type text,
  p_entity_id   uuid,
  p_reason      text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_org_id uuid;
BEGIN
  IF NOT is_platform_admin() THEN
    RAISE EXCEPTION 'Not a platform admin';
  END IF;
  IF p_reason IS NULL OR length(trim(p_reason)) = 0 THEN
    RAISE EXCEPTION 'A reason is required for break-glass access';
  END IF;
  IF p_entity_type NOT IN ('engagement', 'purchase_order', 'grn', 'invoice', 'contract', 'quotation') THEN
    RAISE EXCEPTION 'Unsupported entity_type for break-glass access: %', p_entity_type;
  END IF;

  EXECUTE format('SELECT org_id FROM %I WHERE id = $1', p_entity_type || 's')
    INTO v_org_id USING p_entity_id;

  INSERT INTO audit_log (entity_type, entity_id, action, new_value, performed_by, org_id)
  VALUES (
    p_entity_type,
    p_entity_id,
    'superadmin_break_glass_view',
    jsonb_build_object('reason', p_reason),
    auth.uid(),
    v_org_id
  );
END;
$$;
