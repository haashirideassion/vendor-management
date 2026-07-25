-- Phase 2 (Debugs.pdf items 8/15/26/29): a dedicated, immutable "code" for
-- referencing an organisation or group -- distinct from `slug` (which is a
-- human-readable identifier chosen at creation) and from the freeform
-- `vendors.org_group_code` text field (032_vendor_solo_and_group_code.sql),
-- which stays as-is for backward-compat display of whatever a vendor typed,
-- but is no longer what resolves the actual org/group relationship.
--
-- org_code is generated server-side (backend/src/utils/codeGenerator.ts):
--  - at creation time for superadmin-created orgs (create / create-with-admin)
--  - at APPROVAL time for self-registered orgs (onboarding-review), since the
--    code is meant to only exist once an org is a real, vetted org
-- group.code is generated at group creation time (groups have no separate
-- approval step).
--
-- Existing rows are backfilled here with a deterministic, good-enough code
-- (uppercased slug prefix + a uniqueness-guaranteeing id fragment) so the
-- lookup feature works immediately for orgs/groups that already exist.

ALTER TABLE organizations ADD COLUMN IF NOT EXISTS org_code text;
CREATE UNIQUE INDEX IF NOT EXISTS idx_organizations_org_code ON organizations(org_code) WHERE org_code IS NOT NULL;

ALTER TABLE organization_groups ADD COLUMN IF NOT EXISTS code text;
CREATE UNIQUE INDEX IF NOT EXISTS idx_organization_groups_code ON organization_groups(code) WHERE code IS NOT NULL;

-- The vendor onboarding wizard's entered-but-not-yet-approved group code,
-- pending superadmin approval of the org's onboarding submission (mirrors
-- how org_code itself isn't written until approval).
ALTER TABLE org_onboarding_drafts ADD COLUMN IF NOT EXISTS group_code text;

UPDATE organizations
SET org_code = upper(regexp_replace(coalesce(slug, 'ORG'), '[^a-zA-Z0-9]', '', 'g'))::text
  || '-' || upper(substring(id::text from 1 for 4))
WHERE org_code IS NULL;

UPDATE organization_groups
SET code = upper(left(regexp_replace(coalesce(name, 'GRP'), '[^a-zA-Z0-9]', '', 'g') || 'GRP', 6))
  || '-' || upper(substring(id::text from 1 for 4))
WHERE code IS NULL;
