-- Org chart support: who each org member reports to. Nothing in the schema
-- previously modeled a reporting line at all -- OrgTeam.tsx has only ever
-- been a flat member list, and this is what's needed to render it as a
-- hierarchy instead (see OrgTeam.tsx's List/Org Chart toggle).
--
-- Self-referencing within organization_members -- a manager must be a
-- member of the same org (enforced app-side in orgMembers.ts's
-- /set-manager, alongside the no-self-reference and no-cycle checks a
-- simple FK/CHECK can't express). ON DELETE SET NULL so a departed
-- manager's reports fall back to "no manager" rather than blocking their
-- own row's deletion.
ALTER TABLE organization_members
  ADD COLUMN IF NOT EXISTS reports_to uuid REFERENCES organization_members(id) ON DELETE SET NULL;

ALTER TABLE organization_members
  ADD CONSTRAINT organization_members_reports_to_not_self CHECK (reports_to IS NULL OR reports_to <> id);

CREATE INDEX IF NOT EXISTS idx_organization_members_reports_to ON organization_members(reports_to);
