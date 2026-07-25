-- Phase 5 prep: organization_members.org_role should hold the caller's real
-- business role (manager, procurement_admin, admin, super_admin, ...) so
-- usePermissions can recompute per-org from org_role instead of the global
-- profiles.role. Migration 007 mapped admin/super_admin -> 'org_admin' on
-- backfill, which loses that distinction and would break admin permission
-- checks the moment usePermissions switches its source of truth.
--
-- Fix: restore the real role for admin/super_admin members, and widen
-- is_org_admin() to also recognize admin/super_admin as org admins (so
-- membership-management capability isn't lost).

ALTER TABLE organization_members DROP CONSTRAINT organization_members_org_role_check;
ALTER TABLE organization_members ADD CONSTRAINT organization_members_org_role_check
  CHECK (org_role = ANY (ARRAY['org_admin', 'hr_user', 'manager', 'procurement_admin', 'finance_ap', 'admin', 'super_admin']));

UPDATE organization_members om
SET org_role = p.role
FROM profiles p
WHERE om.profile_id = p.id
  AND om.org_role = 'org_admin'
  AND p.role IN ('admin', 'super_admin');

CREATE OR REPLACE FUNCTION public.is_org_admin(p_org_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM organization_members
    WHERE org_id = p_org_id
      AND profile_id = auth.uid()
      AND org_role IN ('org_admin', 'admin', 'super_admin')
  );
$$;
