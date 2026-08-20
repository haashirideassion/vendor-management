-- RBAC/Teams Redesign, Phase 7b: Delegation / time-boxed access.
--
-- Deferred in the original spec pending a concrete need. Modeled as an
-- expiry window on a normal role assignment, NOT a separate "delegation"
-- table -- a time-boxed grant is just a role assignment with a
-- valid_from/valid_until, reusing 100% of the existing assignment
-- infrastructure (resolve_permission_as, the Team+Role picker, audit) rather
-- than building a parallel system.
--
-- Added to org_member_roles/vendor_user_roles specifically because those
-- are the tables has_permission_as/has_vendor_permission_as actually read
-- (021_rbac_helper_functions.sql) -- Phase 1's dual-write means these
-- legacy tables are still what drives real enforcement, so expiry has to
-- live here to have any effect. Also added to team_members/
-- direct_role_assignments for schema consistency with the newer model, but
-- note that expiry there is NOT YET enforced anywhere -- if/when a future
-- phase cuts permission resolution over to reading exclusively from the new
-- tables, that cutover needs to carry this same expiry filter forward.
--
-- No cleanup job for expired rows -- an expired assignment simply stops
-- being effective (excluded by the WHERE clause below); the row stays as
-- history for audit, same as every other assignment.

ALTER TABLE org_member_roles ADD COLUMN IF NOT EXISTS valid_from timestamptz;
ALTER TABLE org_member_roles ADD COLUMN IF NOT EXISTS valid_until timestamptz;
ALTER TABLE vendor_user_roles ADD COLUMN IF NOT EXISTS valid_from timestamptz;
ALTER TABLE vendor_user_roles ADD COLUMN IF NOT EXISTS valid_until timestamptz;
ALTER TABLE team_members ADD COLUMN IF NOT EXISTS valid_from timestamptz;
ALTER TABLE team_members ADD COLUMN IF NOT EXISTS valid_until timestamptz;
ALTER TABLE direct_role_assignments ADD COLUMN IF NOT EXISTS valid_from timestamptz;
ALTER TABLE direct_role_assignments ADD COLUMN IF NOT EXISTS valid_until timestamptz;

CREATE OR REPLACE FUNCTION has_permission_as(p_user_id uuid, p_org_id uuid, p_key text)
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
      AND (omr.valid_from IS NULL OR omr.valid_from <= now())
      AND (omr.valid_until IS NULL OR omr.valid_until > now())
  );
$$;

CREATE OR REPLACE FUNCTION has_vendor_permission_as(p_user_id uuid, p_vendor_id uuid, p_key text)
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
      AND (vur.valid_from IS NULL OR vur.valid_from <= now())
      AND (vur.valid_until IS NULL OR vur.valid_until > now())
  );
$$;
