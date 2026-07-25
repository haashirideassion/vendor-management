-- Phase 3 (RBAC bundle model), step 3 of 5: assignment tables that connect
-- profiles to the roles seeded in 018, plus the supporting org/vendor
-- columns those assignments need (role_mode, approval_threshold,
-- account_type) and the vendor multi-user structural change (dropping the
-- vendors.profile_id 1:1 constraint).
--
-- org_member_roles is many-to-many (not a single role_id column) so a
-- solo-mode org's one user can hold all three org-side roles at once
-- (their permissions union together), and a tiered org could later grant
-- someone more than one bundle without a schema change.

CREATE TABLE IF NOT EXISTS org_member_roles (
  org_member_id uuid NOT NULL REFERENCES organization_members(id) ON DELETE CASCADE,
  role_id       uuid NOT NULL REFERENCES roles(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (org_member_id, role_id)
);

-- ─── vendor_users: the vendor multi-user structural change ─────────────────
-- One vendor company can now have more than one staff login. The existing
-- vendors.profile_id stays as a legacy pointer through the transition (not
-- dropped until 023, after the application cutover is verified) but its
-- UNIQUE constraint is lifted here since it would otherwise block a second
-- vendor_users row for the same vendor.
CREATE TABLE IF NOT EXISTS vendor_users (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id  uuid NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES profiles(id),
  status     text NOT NULL DEFAULT 'active',
  is_primary boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT vendor_users_status_check CHECK (status IN ('invited', 'active', 'suspended')),
  CONSTRAINT vendor_users_vendor_profile_unique UNIQUE (vendor_id, profile_id)
);

CREATE INDEX IF NOT EXISTS idx_vendor_users_profile ON vendor_users(profile_id);
CREATE INDEX IF NOT EXISTS idx_vendor_users_vendor ON vendor_users(vendor_id);

ALTER TABLE vendors DROP CONSTRAINT IF EXISTS vendors_profile_id_key;

CREATE TABLE IF NOT EXISTS vendor_user_roles (
  vendor_user_id uuid NOT NULL REFERENCES vendor_users(id) ON DELETE CASCADE,
  role_id        uuid NOT NULL REFERENCES roles(id),
  created_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (vendor_user_id, role_id)
);

-- ─── vendor_user_assignments: additive client-org allow-list ───────────────
-- Precedence (enforced in application code, not here): if ANY assignment
-- rows exist for a (vendor, user) pair, that user is restricted to exactly
-- those orgs regardless of role; otherwise falls back to the role default
-- (Admin/Manager see all the vendor's client orgs, Associate sees none).
-- Keyed generically by (vendor_id, user_id, organization_id) rather than
-- baked into the role, so a Manager could be restricted later without a
-- schema change.
CREATE TABLE IF NOT EXISTS vendor_user_assignments (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id       uuid NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES profiles(id),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT vendor_user_assignments_unique UNIQUE (vendor_id, user_id, organization_id)
);

CREATE INDEX IF NOT EXISTS idx_vendor_user_assignments_vendor_user ON vendor_user_assignments(vendor_id, user_id);

-- ─── organizations: role_mode + approval_threshold ─────────────────────────
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS role_mode text NOT NULL DEFAULT 'tiered';
ALTER TABLE organizations ADD CONSTRAINT organizations_role_mode_check
  CHECK (role_mode IN ('tiered', 'solo'));

-- Explicit, deliberate default (matches the old Manager threshold; confirmed
-- via live-data check that zero current rows use procurement_admin/
-- finance_ap, so this is a forward-looking default, not a data migration).
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS approval_threshold numeric NOT NULL DEFAULT 100000;

-- ─── profiles: account_type (vendor/internal discriminator) ────────────────
-- Nullable for now -- 020_rbac_backfill.sql populates every existing row
-- from profiles.role and then tightens this to NOT NULL. profiles.role
-- itself is untouched (still read by any code not yet cut over).
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS account_type text;
ALTER TABLE profiles ADD CONSTRAINT profiles_account_type_check
  CHECK (account_type IS NULL OR account_type IN ('internal', 'vendor'));

-- ─── Scope-consistency triggers ─────────────────────────────────────────────
-- org_member_roles may only reference org-scope roles; vendor_user_roles
-- only vendor-scope roles. A bare FK to roles(id) can't express this on its
-- own.
CREATE OR REPLACE FUNCTION enforce_org_member_role_scope()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM roles WHERE id = NEW.role_id AND scope = 'org') THEN
    RAISE EXCEPTION 'role % is not an org-scope role', NEW.role_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS org_member_roles_enforce_scope ON org_member_roles;
CREATE TRIGGER org_member_roles_enforce_scope
  BEFORE INSERT OR UPDATE ON org_member_roles
  FOR EACH ROW EXECUTE FUNCTION enforce_org_member_role_scope();

CREATE OR REPLACE FUNCTION enforce_vendor_user_role_scope()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM roles WHERE id = NEW.role_id AND scope = 'vendor') THEN
    RAISE EXCEPTION 'role % is not a vendor-scope role', NEW.role_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS vendor_user_roles_enforce_scope ON vendor_user_roles;
CREATE TRIGGER vendor_user_roles_enforce_scope
  BEFORE INSERT OR UPDATE ON vendor_user_roles
  FOR EACH ROW EXECUTE FUNCTION enforce_vendor_user_role_scope();

-- ─── Mutual-exclusivity: a profile is never both a vendor and an org member ─
CREATE OR REPLACE FUNCTION enforce_profile_not_both_vendor_and_org_member()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_profile_id uuid := NEW.profile_id;
BEGIN
  IF TG_TABLE_NAME = 'vendor_users' THEN
    IF EXISTS (SELECT 1 FROM organization_members WHERE profile_id = v_profile_id) THEN
      RAISE EXCEPTION 'profile % already has an organization_members row; a profile cannot be both a vendor user and an org member', v_profile_id;
    END IF;
  ELSIF TG_TABLE_NAME = 'organization_members' THEN
    IF EXISTS (SELECT 1 FROM vendor_users WHERE profile_id = v_profile_id) THEN
      RAISE EXCEPTION 'profile % already has a vendor_users row; a profile cannot be both an org member and a vendor user', v_profile_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS vendor_users_enforce_not_org_member ON vendor_users;
CREATE TRIGGER vendor_users_enforce_not_org_member
  BEFORE INSERT ON vendor_users
  FOR EACH ROW EXECUTE FUNCTION enforce_profile_not_both_vendor_and_org_member();

DROP TRIGGER IF EXISTS organization_members_enforce_not_vendor_user ON organization_members;
CREATE TRIGGER organization_members_enforce_not_vendor_user
  BEFORE INSERT ON organization_members
  FOR EACH ROW EXECUTE FUNCTION enforce_profile_not_both_vendor_and_org_member();

-- ─── RLS ────────────────────────────────────────────────────────────────────
ALTER TABLE org_member_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendor_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendor_user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendor_user_assignments ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION profile_owns_org_member(p_org_member_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (SELECT 1 FROM organization_members WHERE id = p_org_member_id AND profile_id = auth.uid());
$$;

CREATE OR REPLACE FUNCTION profile_owns_vendor_user(p_vendor_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (SELECT 1 FROM vendor_users WHERE id = p_vendor_user_id AND profile_id = auth.uid());
$$;

DROP POLICY IF EXISTS "org_member_roles: platform admins manage" ON org_member_roles;
CREATE POLICY "org_member_roles: platform admins manage" ON org_member_roles
  FOR ALL USING (is_platform_admin()) WITH CHECK (is_platform_admin());

DROP POLICY IF EXISTS "org_member_roles: self read" ON org_member_roles;
CREATE POLICY "org_member_roles: self read" ON org_member_roles
  FOR SELECT USING (is_platform_admin() OR profile_owns_org_member(org_member_id));

DROP POLICY IF EXISTS "vendor_users: platform admins manage" ON vendor_users;
CREATE POLICY "vendor_users: platform admins manage" ON vendor_users
  FOR ALL USING (is_platform_admin()) WITH CHECK (is_platform_admin());

DROP POLICY IF EXISTS "vendor_users: self read" ON vendor_users;
CREATE POLICY "vendor_users: self read" ON vendor_users
  FOR SELECT USING (is_platform_admin() OR profile_id = auth.uid());

DROP POLICY IF EXISTS "vendor_user_roles: platform admins manage" ON vendor_user_roles;
CREATE POLICY "vendor_user_roles: platform admins manage" ON vendor_user_roles
  FOR ALL USING (is_platform_admin()) WITH CHECK (is_platform_admin());

DROP POLICY IF EXISTS "vendor_user_roles: self read" ON vendor_user_roles;
CREATE POLICY "vendor_user_roles: self read" ON vendor_user_roles
  FOR SELECT USING (is_platform_admin() OR profile_owns_vendor_user(vendor_user_id));

DROP POLICY IF EXISTS "vendor_user_assignments: platform admins manage" ON vendor_user_assignments;
CREATE POLICY "vendor_user_assignments: platform admins manage" ON vendor_user_assignments
  FOR ALL USING (is_platform_admin()) WITH CHECK (is_platform_admin());

DROP POLICY IF EXISTS "vendor_user_assignments: self read" ON vendor_user_assignments;
CREATE POLICY "vendor_user_assignments: self read" ON vendor_user_assignments
  FOR SELECT USING (is_platform_admin() OR user_id = auth.uid());

-- Note: these RLS policies are a defense-in-depth baseline (platform-admin
-- manage-all + self-read), not full peer-visibility rules -- today's only
-- consumer is the Express backend via the service-role key, which bypasses
-- RLS entirely. Broader read policies (e.g. a vendor Admin seeing all their
-- company's vendor_users rows) can be added when a screen needs direct
-- client reads; none does yet.
