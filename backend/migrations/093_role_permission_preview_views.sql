-- Read-only preview of the EFFECTIVE system-role permission bundles, i.e. the
-- result of 018_rbac_seed + 031 + 040 + 079 (renames) + anything later --
-- computed from the live tables, so it never drifts from what is deployed.
-- Creates views only; no data is changed. Safe to re-run.
--
--   SELECT * FROM v_system_role_matrix;        -- one row per permission, one column per role
--   SELECT * FROM v_system_role_permissions;   -- one row per (role, permission) grant
--   SELECT * FROM v_system_role_summary;       -- grant count per role
--
-- security_invoker = the caller's own RLS applies (roles/permissions/
-- role_permissions are readable by any authenticated user per 017).

CREATE OR REPLACE VIEW v_system_role_permissions
WITH (security_invoker = true) AS
SELECT
  r.scope,
  r.name        AS role_name,
  p.module,
  p.key         AS permission_key,
  p.description
FROM role_permissions rp
JOIN roles       r ON r.id = rp.role_id AND r.is_system = true
JOIN permissions p ON p.id = rp.permission_id;

-- Permissions down the side, system roles across the top ('✓' = granted).
-- Permissions granted to NO system role still appear (all blank), which is
-- how you spot dead or orphaned permissions.
CREATE OR REPLACE VIEW v_system_role_matrix
WITH (security_invoker = true) AS
SELECT
  p.module,
  p.key AS permission_key,
  CASE WHEN bool_or(r.scope = 'org'    AND r.name = 'Admin')     THEN '✓' ELSE '' END AS org_admin,
  CASE WHEN bool_or(r.scope = 'org'    AND r.name = 'Manager')   THEN '✓' ELSE '' END AS org_manager,
  CASE WHEN bool_or(r.scope = 'org'    AND r.name = 'Associate') THEN '✓' ELSE '' END AS org_associate,
  CASE WHEN bool_or(r.scope = 'org'    AND r.name = 'Finance')   THEN '✓' ELSE '' END AS org_finance,
  CASE WHEN bool_or(r.scope = 'vendor' AND r.name = 'Admin')     THEN '✓' ELSE '' END AS vendor_admin,
  CASE WHEN bool_or(r.scope = 'vendor' AND r.name = 'Manager')   THEN '✓' ELSE '' END AS vendor_manager,
  CASE WHEN bool_or(r.scope = 'vendor' AND r.name = 'Associate') THEN '✓' ELSE '' END AS vendor_associate,
  CASE WHEN bool_or(r.scope = 'vendor' AND r.name = 'Finance')   THEN '✓' ELSE '' END AS vendor_finance
FROM permissions p
LEFT JOIN role_permissions rp ON rp.permission_id = p.id
LEFT JOIN roles r ON r.id = rp.role_id AND r.is_system = true
GROUP BY p.module, p.key
ORDER BY p.module, p.key;

CREATE OR REPLACE VIEW v_system_role_summary
WITH (security_invoker = true) AS
SELECT
  r.scope,
  r.name AS role_name,
  count(rp.permission_id) AS permission_count
FROM roles r
LEFT JOIN role_permissions rp ON rp.role_id = r.id
WHERE r.is_system = true
GROUP BY r.scope, r.name
ORDER BY r.scope, r.name;

-- Expected counts after 018 + 031 + 040 (adjust if later migrations changed bundles):
--   org    Admin 20 | Manager 10 | Associate 3 | Finance 2
--   vendor Admin 10 (4 own + 6 from 031, incl. invoices.submit) | Manager 3 | Associate 2 | Finance 1
