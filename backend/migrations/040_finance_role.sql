-- Phase 1 (Debugs.pdf item 30): new "Finance" role on both scopes, and
-- tighten vendor Manager -- invoices.submit moves to Admin/Finance only.
--
-- org Finance: can approve invoices (both thresholds), nothing else --
-- read-only everywhere else via the app's own permission checks.
-- vendor Finance: can submit invoices, nothing else -- read-only everywhere
-- else, same as org Finance's shape.

INSERT INTO roles (name, scope, description) VALUES
  ('Finance', 'org',    'Invoice approval only -- read-only everywhere else'),
  ('Finance', 'vendor', 'Invoice submission only -- read-only everywhere else')
ON CONFLICT (scope, name) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.scope = 'org' AND r.name = 'Finance'
  AND p.key IN ('invoices.approve', 'invoices.approve_unlimited')
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.scope = 'vendor' AND r.name = 'Finance'
  AND p.key IN ('invoices.submit')
ON CONFLICT DO NOTHING;

-- vendor Manager no longer submits invoices -- Admin and the new Finance
-- role are the only vendor-scope roles that can, going forward.
DELETE FROM role_permissions
WHERE role_id = (SELECT id FROM roles WHERE scope = 'vendor' AND name = 'Manager')
  AND permission_id = (SELECT id FROM permissions WHERE key = 'invoices.submit');

-- Backs the new personal "My Profile" section (name + mobile, editable only
-- by that staff member) -- profiles has never had a phone/mobile column.
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS mobile text;
