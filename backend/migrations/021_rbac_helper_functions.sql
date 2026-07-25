-- Phase 3 (RBAC bundle model), step 5 of 5: permission-check helper
-- functions the application cutover (next, code-only) reads from, plus the
-- account_type consistency-check view for the superadmin dashboard.
--
-- Mirrors the _as/wrapper pattern established in 015_group_functions.sql:
-- a parameterized core usable from Express under the service-role key
-- (where auth.uid() is NULL), and a thin auth.uid()-based wrapper for RLS.

CREATE OR REPLACE FUNCTION public.has_permission_as(p_user_id uuid, p_org_id uuid, p_key text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1
    FROM organization_members om
    JOIN org_member_roles omr ON omr.org_member_id = om.id
    JOIN role_permissions rp ON rp.role_id = omr.role_id
    JOIN permissions p ON p.id = rp.permission_id
    WHERE om.org_id = p_org_id
      AND om.profile_id = p_user_id
      AND om.status = 'active'
      AND p.key = p_key
  );
$$;

CREATE OR REPLACE FUNCTION public.has_permission(p_org_id uuid, p_key text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT public.has_permission_as(auth.uid(), p_org_id, p_key);
$$;

CREATE OR REPLACE FUNCTION public.has_vendor_permission_as(p_user_id uuid, p_vendor_id uuid, p_key text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1
    FROM vendor_users vu
    JOIN vendor_user_roles vur ON vur.vendor_user_id = vu.id
    JOIN role_permissions rp ON rp.role_id = vur.role_id
    JOIN permissions p ON p.id = rp.permission_id
    WHERE vu.vendor_id = p_vendor_id
      AND vu.profile_id = p_user_id
      AND vu.status = 'active'
      AND p.key = p_key
  );
$$;

CREATE OR REPLACE FUNCTION public.has_vendor_permission(p_vendor_id uuid, p_key text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT public.has_vendor_permission_as(auth.uid(), p_vendor_id, p_key);
$$;

-- ─── account_type_mismatches: superadmin consistency-check surface ─────────
-- The mutual-exclusivity trigger (019) prevents a profile from ever holding
-- both an organization_members and a vendor_users row going forward, but
-- doesn't catch account_type itself disagreeing with which one a profile
-- actually holds (e.g. backfilled/edited incorrectly). Same
-- surface-to-superadmin pattern as groups_without_active_admin (015) --
-- polled by a superadmin endpoint, not pushed.
CREATE OR REPLACE VIEW account_type_mismatches AS
SELECT
  p.id AS profile_id,
  p.email,
  p.account_type,
  EXISTS (SELECT 1 FROM organization_members om WHERE om.profile_id = p.id) AS has_org_membership,
  EXISTS (SELECT 1 FROM vendor_users vu WHERE vu.profile_id = p.id) AS has_vendor_membership
FROM profiles p
WHERE (p.account_type = 'internal' AND EXISTS (SELECT 1 FROM vendor_users vu WHERE vu.profile_id = p.id))
   OR (p.account_type = 'vendor'   AND EXISTS (SELECT 1 FROM organization_members om WHERE om.profile_id = p.id));
