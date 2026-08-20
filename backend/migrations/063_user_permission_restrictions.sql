-- RBAC/Teams Redesign, Phase 4: User-level restriction overrides.
--
-- The ONLY deny-type mechanism in the system, per the confirmed design --
-- subtractive-only, set by an Org/Vendor Admin (Group Admin within their
-- group's orgs), narrowing a specific person below whatever their
-- Team+Role/direct-role baseline already grants. Can NEVER grant beyond
-- that baseline -- there is deliberately no corresponding "grant" table,
-- which is what makes multi-role conflicts deterministic: Role A says yes,
-- Role B says yes, a restriction says no -> the answer is always no, because
-- this is evaluated last and only ever subtracts.
--
-- Shaped consistently with direct_role_assignments/feature_entitlements
-- (scope/org_id/vendor_id/profile_id, partial unique indexes per scope) --
-- not a "membership_id" abstraction, since this codebase's org/vendor
-- membership concepts (organization_members/vendor_users) are already
-- reached via profile_id + org_id/vendor_id everywhere else in this
-- redesign.

CREATE TABLE IF NOT EXISTS user_permission_restrictions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope         text NOT NULL CHECK (scope IN ('org', 'vendor')),
  org_id        uuid REFERENCES organizations(id) ON DELETE CASCADE,
  vendor_id     uuid REFERENCES vendors(id) ON DELETE CASCADE,
  profile_id    uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  permission_id uuid NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  reason        text,
  set_by        uuid REFERENCES profiles(id),
  set_at        timestamptz DEFAULT now(),
  CONSTRAINT upr_scope_consistency CHECK (
    (scope = 'org'    AND org_id    IS NOT NULL AND vendor_id IS NULL) OR
    (scope = 'vendor' AND vendor_id IS NOT NULL AND org_id    IS NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_upr_org    ON user_permission_restrictions(org_id, profile_id, permission_id)    WHERE scope = 'org';
CREATE UNIQUE INDEX IF NOT EXISTS uq_upr_vendor ON user_permission_restrictions(vendor_id, profile_id, permission_id) WHERE scope = 'vendor';
CREATE INDEX IF NOT EXISTS idx_upr_profile ON user_permission_restrictions(profile_id);

-- ─── Wire the Phase 4 slot into resolve_permission_as (062) ────────────────
-- Exactly the one additional clause the 062 migration's comment said this
-- would need -- no signature change, no caller (requirePermission
-- middleware) changes required.
CREATE OR REPLACE FUNCTION resolve_permission_as(
  p_user_id   uuid,
  p_scope     text,
  p_org_id    uuid,
  p_vendor_id uuid,
  p_key       text
) RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
DECLARE
  v_module_code text;
  v_permission_id uuid;
  v_has_role_permission boolean;
BEGIN
  SELECT id, module_code INTO v_permission_id, v_module_code FROM permissions WHERE key = p_key;

  IF v_module_code IS NOT NULL THEN
    IF NOT is_feature_entitled(p_scope, p_org_id, p_vendor_id, v_module_code) THEN
      RETURN false;
    END IF;
  END IF;

  IF p_scope = 'org' THEN
    v_has_role_permission := has_permission_as(p_user_id, p_org_id, p_key);
  ELSIF p_scope = 'vendor' THEN
    v_has_role_permission := has_vendor_permission_as(p_user_id, p_vendor_id, p_key);
  ELSE
    RAISE EXCEPTION 'resolve_permission_as: scope must be org or vendor, got %', p_scope;
  END IF;

  IF NOT v_has_role_permission THEN
    RETURN false;
  END IF;

  -- Subtractive-only User Restriction -- evaluated last, always wins if
  -- present. This is what makes the "Role A yes, Role B yes, restriction
  -- no -> no" precedence deterministic rather than ambiguous.
  IF EXISTS (
    SELECT 1 FROM user_permission_restrictions upr
    WHERE upr.permission_id = v_permission_id
      AND upr.profile_id = p_user_id
      AND upr.scope = p_scope
      AND ((p_scope = 'org' AND upr.org_id = p_org_id) OR (p_scope = 'vendor' AND upr.vendor_id = p_vendor_id))
  ) THEN
    RETURN false;
  END IF;

  RETURN true;
END;
$$;

-- ─── RLS ────────────────────────────────────────────────────────────────────
-- Platform-admin-only baseline, matching Teams/Feature-Entitlement's
-- convention -- real "which Org/Vendor Admin can set a restriction within
-- their own tenant" enforcement is route-layer work (the Express backend
-- bypasses RLS via the service-role key), not this migration.
ALTER TABLE user_permission_restrictions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_permission_restrictions: platform admins manage" ON user_permission_restrictions
  FOR ALL USING (is_platform_admin()) WITH CHECK (is_platform_admin());

CREATE POLICY "user_permission_restrictions: self read" ON user_permission_restrictions
  FOR SELECT USING (is_platform_admin() OR profile_id = auth.uid());
