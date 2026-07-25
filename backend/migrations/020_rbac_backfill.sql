-- Phase 3 (RBAC bundle model), step 4 of 5: data-only backfill of every
-- existing organization_members/vendors/profiles row onto the new model.
-- No application code reads any of this yet -- old org_role/profiles.role
-- based checks keep working exactly as before until the application cutover
-- (code, no migration) and 022_rbac_rls_cutover.sql land.
--
-- Confirmed legacy -> bundle mapping (org scope):
--   org_admin, admin, super_admin   -> Admin
--   manager, finance_ap, procurement_admin -> Manager
--   hr_user                        -> Associate
-- This collapses manager's old 1L, procurement_admin's old 5L, and
-- finance_ap's own invoice threshold down to the single configurable
-- organizations.approval_threshold added in 019 (default 100000). Verified
-- via a live-data check before this mapping was finalized: zero current
-- organization_members/profiles rows use procurement_admin or finance_ap, so
-- this is a forward-looking mapping, not a migration of real user data.

INSERT INTO org_member_roles (org_member_id, role_id)
SELECT om.id, r.id
FROM organization_members om
JOIN roles r ON r.scope = 'org' AND r.name = (
  CASE om.org_role
    WHEN 'org_admin'   THEN 'Admin'
    WHEN 'admin'       THEN 'Admin'
    WHEN 'super_admin' THEN 'Admin'
    WHEN 'manager'           THEN 'Manager'
    WHEN 'finance_ap'        THEN 'Manager'
    WHEN 'procurement_admin' THEN 'Manager'
    WHEN 'hr_user'     THEN 'Associate'
  END
)
ON CONFLICT DO NOTHING;

-- ─── vendor_users + vendor_user_roles: seed from the existing 1:1 relationship ─
INSERT INTO vendor_users (vendor_id, profile_id, status, is_primary)
SELECT v.id, v.profile_id, 'active', true
FROM vendors v
WHERE v.profile_id IS NOT NULL
ON CONFLICT (vendor_id, profile_id) DO NOTHING;

INSERT INTO vendor_user_roles (vendor_user_id, role_id)
SELECT vu.id, r.id
FROM vendor_users vu
JOIN roles r ON r.scope = 'vendor' AND r.name = 'Admin'
WHERE vu.is_primary = true
ON CONFLICT DO NOTHING;

-- ─── profiles.account_type: backfill then tighten to NOT NULL ──────────────
UPDATE profiles SET account_type = CASE WHEN role = 'vendor' THEN 'vendor' ELSE 'internal' END
WHERE account_type IS NULL;

-- handle_new_user() (supabase/migrations/003_triggers.sql) auto-creates a
-- profiles row on every signup but only ever set (id, email, role,
-- full_name) -- it doesn't know about account_type. Left unfixed, the
-- NOT NULL constraint added just below would start rejecting every new
-- signup the moment this migration lands. Mirrors the same role ->
-- account_type mapping as the backfill above, applied going forward.
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, role, account_type, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'role', 'vendor'),
    CASE WHEN COALESCE(NEW.raw_user_meta_data->>'role', 'vendor') = 'vendor' THEN 'vendor' ELSE 'internal' END,
    NEW.raw_user_meta_data->>'full_name'
  );
  RETURN NEW;
END;
$$;

ALTER TABLE profiles ALTER COLUMN account_type SET NOT NULL;

-- organizations.role_mode is left at its 'tiered' default for every existing
-- org -- role_mode cannot be auto-detected from existing data. If any
-- current org should retroactively be solo, flip it manually:
--   UPDATE organizations SET role_mode = 'solo' WHERE id = '<org-id>';
