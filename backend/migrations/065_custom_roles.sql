-- RBAC/Teams Redesign, Phase 7a: Custom tenant-created roles.
--
-- Deferred in the original spec pending a concrete need -- revisited now.
-- Every role today is is_system=true (Admin/Manager/Associate, plus the
-- deprecated Finance). This adds the other half: an Org or Vendor Admin can
-- create their OWN role (e.g. "Regional Finance Manager"), scoped to
-- exactly their own tenant, composed from the same permission catalog
-- system roles already draw from. Custom roles are never shared across
-- tenants and cannot modify/replace a system role.
--
-- roles.owner_org_id/owner_vendor_id are new -- NULL for every system role
-- (unowned, global), set to exactly one for a custom role depending on its
-- scope. The original 017_rbac_bundle_tables.sql UNIQUE(scope, name)
-- constraint would have blocked two different orgs from both naming a role
-- "Regional Finance Manager" -- replaced with three partial unique indexes:
-- one preserving system-role uniqueness, two scoping custom-role names to
-- their owning tenant.

ALTER TABLE roles ADD COLUMN IF NOT EXISTS owner_org_id uuid REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE roles ADD COLUMN IF NOT EXISTS owner_vendor_id uuid REFERENCES vendors(id) ON DELETE CASCADE;

ALTER TABLE roles ADD CONSTRAINT roles_ownership_consistency CHECK (
  (is_system = true  AND owner_org_id IS NULL AND owner_vendor_id IS NULL) OR
  (is_system = false AND scope = 'org'    AND owner_org_id    IS NOT NULL AND owner_vendor_id IS NULL) OR
  (is_system = false AND scope = 'vendor' AND owner_vendor_id IS NOT NULL AND owner_org_id    IS NULL)
);

-- Drop the old blanket constraint and replace with scope-appropriate partial
-- indexes. The auto-generated name isn't guaranteed, so look it up rather
-- than assuming it (same technique as 060_fix_dra_unique_constraint.sql).
DO $$
DECLARE
  v_conname text;
BEGIN
  SELECT conname INTO v_conname
  FROM pg_constraint
  WHERE conrelid = 'roles'::regclass AND contype = 'u';
  IF v_conname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE roles DROP CONSTRAINT %I', v_conname);
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_roles_system_scope_name ON roles(scope, name) WHERE is_system = true;
CREATE UNIQUE INDEX IF NOT EXISTS uq_roles_custom_org_name    ON roles(owner_org_id, name)    WHERE is_system = false AND scope = 'org';
CREATE UNIQUE INDEX IF NOT EXISTS uq_roles_custom_vendor_name ON roles(owner_vendor_id, name) WHERE is_system = false AND scope = 'vendor';

-- ─── Tenant-ownership checks on every assignment path ──────────────────────
-- The existing scope-consistency triggers (enforce_org_member_role_scope,
-- 019; enforce_vendor_user_role_scope, 019; enforce_team_member_role_scope,
-- enforce_dra_role_scope, 059) only ever checked that a role's SCOPE
-- matched (org vs vendor) -- none of them checked that a CUSTOM role
-- actually belongs to the tenant doing the assigning. Without this, Org A
-- could assign Org B's custom role to one of its own members. Replacing
-- each function to add that check for non-system roles; system roles are
-- global and unaffected.

CREATE OR REPLACE FUNCTION enforce_org_member_role_scope()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_role roles%ROWTYPE;
  v_org_id uuid;
BEGIN
  SELECT * INTO v_role FROM roles WHERE id = NEW.role_id;
  IF v_role.scope <> 'org' THEN
    RAISE EXCEPTION 'role % is not an org-scope role', NEW.role_id;
  END IF;
  IF v_role.is_system = false THEN
    SELECT org_id INTO v_org_id FROM organization_members WHERE id = NEW.org_member_id;
    IF v_role.owner_org_id IS DISTINCT FROM v_org_id THEN
      RAISE EXCEPTION 'custom role % does not belong to this organization', NEW.role_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION enforce_vendor_user_role_scope()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_role roles%ROWTYPE;
  v_vendor_id uuid;
BEGIN
  SELECT * INTO v_role FROM roles WHERE id = NEW.role_id;
  IF v_role.scope <> 'vendor' THEN
    RAISE EXCEPTION 'role % is not a vendor-scope role', NEW.role_id;
  END IF;
  IF v_role.is_system = false THEN
    SELECT vendor_id INTO v_vendor_id FROM vendor_users WHERE id = NEW.vendor_user_id;
    IF v_role.owner_vendor_id IS DISTINCT FROM v_vendor_id THEN
      RAISE EXCEPTION 'custom role % does not belong to this vendor', NEW.role_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION enforce_team_member_role_scope()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_team teams%ROWTYPE;
  v_role roles%ROWTYPE;
BEGIN
  SELECT * INTO v_team FROM teams WHERE id = NEW.team_id;
  SELECT * INTO v_role FROM roles WHERE id = NEW.role_id;
  IF v_role.scope <> v_team.scope THEN
    RAISE EXCEPTION 'role % does not match the scope of team %', NEW.role_id, NEW.team_id;
  END IF;
  IF v_role.is_system = false THEN
    IF v_team.scope = 'org' AND v_role.owner_org_id IS DISTINCT FROM v_team.org_id THEN
      RAISE EXCEPTION 'custom role % does not belong to this team''s organization', NEW.role_id;
    END IF;
    IF v_team.scope = 'vendor' AND v_role.owner_vendor_id IS DISTINCT FROM v_team.vendor_id THEN
      RAISE EXCEPTION 'custom role % does not belong to this team''s vendor', NEW.role_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION enforce_dra_role_scope()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_role roles%ROWTYPE;
BEGIN
  SELECT * INTO v_role FROM roles WHERE id = NEW.role_id;
  IF v_role.scope <> NEW.scope THEN
    RAISE EXCEPTION 'role % does not match assignment scope %', NEW.role_id, NEW.scope;
  END IF;
  IF v_role.is_system = false THEN
    IF NEW.scope = 'org' AND v_role.owner_org_id IS DISTINCT FROM NEW.org_id THEN
      RAISE EXCEPTION 'custom role % does not belong to this organization', NEW.role_id;
    END IF;
    IF NEW.scope = 'vendor' AND v_role.owner_vendor_id IS DISTINCT FROM NEW.vendor_id THEN
      RAISE EXCEPTION 'custom role % does not belong to this vendor', NEW.role_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
