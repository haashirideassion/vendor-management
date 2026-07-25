-- Organisation onboarding wizard, part 2: the wizard is for the org's own
-- admin, not every org member, so gate it behind a proper permission key
-- rather than a hardcoded role-name check -- per this codebase's established
-- pattern (has_permission_as / 017_rbac_bundle_tables.sql +
-- 018_rbac_seed.sql's bundle model). Added to the Admin bundle only
-- (cumulative bundles -- Manager/Associate do NOT get this: completing and
-- submitting an organisation's legal/registration profile is an Admin-tier
-- action, same tier as vendors.manage_status/users.manage).

INSERT INTO permissions (key, module, action, description) VALUES
  ('organization.onboarding_manage', 'organization', 'onboarding_manage', 'Complete and submit the organisation onboarding wizard')
ON CONFLICT (key) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.scope = 'org' AND r.name = 'Admin' AND p.key = 'organization.onboarding_manage'
ON CONFLICT DO NOTHING;
