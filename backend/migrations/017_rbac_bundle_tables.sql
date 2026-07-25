-- Phase 3 (RBAC bundle model), step 1 of 5: the catalog tables. Additive
-- only -- nothing reads these yet. Replaces the fixed org_role/profiles.role
-- string enum with a permission-bundle model: permissions (individual
-- capabilities) grouped into roles (Admin/Manager/Associate, both org- and
-- vendor-scoped) via role_permissions.
--
-- Sequencing (see plan): 017 tables -> 018 seed -> 019 assignment tables ->
-- 020 backfill -> 021 helper functions -> application cutover (code only) ->
-- 022 RLS cutover -> 023 drop legacy. Each step is additive until 022/023,
-- which only run after the prior step is verified working end-to-end.

CREATE TABLE IF NOT EXISTS permissions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key         text NOT NULL UNIQUE,
  module      text NOT NULL,
  action      text NOT NULL,
  description text,
  CONSTRAINT permissions_module_action_unique UNIQUE (module, action)
);

CREATE TABLE IF NOT EXISTS roles (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  scope       text NOT NULL,
  is_system   boolean NOT NULL DEFAULT true,
  description text,
  CONSTRAINT roles_scope_check CHECK (scope IN ('org', 'vendor')),
  CONSTRAINT roles_scope_name_unique UNIQUE (scope, name)
);

CREATE TABLE IF NOT EXISTS role_permissions (
  role_id       uuid NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_id uuid NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_id)
);

ALTER TABLE permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE role_permissions ENABLE ROW LEVEL SECURITY;

-- Catalog tables: readable by any authenticated user (both internal and
-- vendor -- vendor invite/role UIs need the vendor-scope roles too), no
-- sensitive data in a role/permission name catalog. Writable only by
-- platform admins -- these bundles are a platform-wide definition, not
-- per-org.
DROP POLICY IF EXISTS "permissions: authenticated users read" ON permissions;
CREATE POLICY "permissions: authenticated users read" ON permissions
  FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "permissions: platform admins manage" ON permissions;
CREATE POLICY "permissions: platform admins manage" ON permissions
  FOR ALL USING (is_platform_admin()) WITH CHECK (is_platform_admin());

DROP POLICY IF EXISTS "roles: authenticated users read" ON roles;
CREATE POLICY "roles: authenticated users read" ON roles
  FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "roles: platform admins manage" ON roles;
CREATE POLICY "roles: platform admins manage" ON roles
  FOR ALL USING (is_platform_admin()) WITH CHECK (is_platform_admin());

DROP POLICY IF EXISTS "role_permissions: authenticated users read" ON role_permissions;
CREATE POLICY "role_permissions: authenticated users read" ON role_permissions
  FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "role_permissions: platform admins manage" ON role_permissions;
CREATE POLICY "role_permissions: platform admins manage" ON role_permissions
  FOR ALL USING (is_platform_admin()) WITH CHECK (is_platform_admin());
