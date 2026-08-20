-- RBAC/Teams Redesign, Phase 1: Teams data model.
--
-- Team = organizational grouping ("where you work"), Role = responsibility
-- level ("what you're allowed"), kept strictly separate per the confirmed
-- design -- a team never grants permissions by itself.
--
-- CONFIRMED: role assignment is per-team, not global to the person -- someone
-- can be Finance->Manager and Reconciliation->Associate at the same time.
-- That's why role_id lives on team_members (the join row), not on a
-- profile-level assignment. direct_role_assignments is the separate,
-- no-team path for the small-business case (skip teams entirely, one role).
--
-- CONFIRMED: the standalone "Finance" system role (040_finance_role.sql) is
-- retired now that Team=Finance + Role=Manager/Associate covers the same
-- ground -- roles collapse to Admin/Manager/Associate everywhere. "Retired"
-- means marked `deprecated` (stop offering it for NEW assignment) --
-- existing role_permissions/org_member_roles/vendor_user_roles rows that
-- reference it are left alone. Deciding what Team+Role each existing Finance
-- role holder should become is a per-person business call, exactly like the
-- blocked profiles.role legacy mapping (Section 9 of the RBAC spec) -- not
-- guessed here.
--
-- This follows the SAME convention as the existing RBAC assignment tables
-- (org_member_roles/vendor_user_roles, 019_rbac_assignment_tables.sql): RLS
-- here is a defense-in-depth baseline (platform-admin manage-all + self-read)
-- -- the Express backend runs under the service-role key and bypasses RLS,
-- so the real "can this Org Admin manage their org's teams" enforcement is
-- route-layer work (Phase 3's centralized authorization resolver), not this
-- migration. org_member_roles/vendor_user_roles are NOT touched or dropped
-- here -- existing assignments keep working exactly as today; they're
-- backfilled as history into the new tables below, same non-destructive
-- pattern used throughout the vendor-onboarding migrations.

-- ─── roles: deprecate Finance, don't delete it ─────────────────────────────
ALTER TABLE roles ADD COLUMN IF NOT EXISTS deprecated boolean NOT NULL DEFAULT false;
UPDATE roles SET deprecated = true WHERE name = 'Finance' AND scope IN ('org', 'vendor');

-- ─── teams ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS teams (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope       text NOT NULL CHECK (scope IN ('org', 'vendor')),
  org_id      uuid REFERENCES organizations(id) ON DELETE CASCADE,
  vendor_id   uuid REFERENCES vendors(id) ON DELETE CASCADE,
  name        text NOT NULL,
  description text,
  active      boolean NOT NULL DEFAULT true,
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now(),
  CONSTRAINT teams_scope_consistency CHECK (
    (scope = 'org'    AND org_id    IS NOT NULL AND vendor_id IS NULL) OR
    (scope = 'vendor' AND vendor_id IS NOT NULL AND org_id    IS NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_teams_org_name    ON teams(org_id, name)    WHERE scope = 'org';
CREATE UNIQUE INDEX IF NOT EXISTS uq_teams_vendor_name ON teams(vendor_id, name) WHERE scope = 'vendor';

DROP TRIGGER IF EXISTS teams_set_updated_at ON teams;
CREATE TRIGGER teams_set_updated_at
  BEFORE UPDATE ON teams
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─── team_members: role lives on THIS row, not on the person globally ─────
CREATE TABLE IF NOT EXISTS team_members (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id    uuid NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role_id    uuid NOT NULL REFERENCES roles(id),
  status     text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (team_id, profile_id)
);

CREATE INDEX IF NOT EXISTS idx_team_members_profile ON team_members(profile_id);

DROP TRIGGER IF EXISTS team_members_set_updated_at ON team_members;
CREATE TRIGGER team_members_set_updated_at
  BEFORE UPDATE ON team_members
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- A team's role must match the team's own scope (an org-scope team can't
-- assign a vendor-scope role) -- same pattern as
-- enforce_org_member_role_scope in 019_rbac_assignment_tables.sql.
CREATE OR REPLACE FUNCTION enforce_team_member_role_scope()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM teams t JOIN roles r ON r.id = NEW.role_id
    WHERE t.id = NEW.team_id AND r.scope = t.scope
  ) THEN
    RAISE EXCEPTION 'role % does not match the scope of team %', NEW.role_id, NEW.team_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS team_members_enforce_role_scope ON team_members;
CREATE TRIGGER team_members_enforce_role_scope
  BEFORE INSERT OR UPDATE ON team_members
  FOR EACH ROW EXECUTE FUNCTION enforce_team_member_role_scope();

-- ─── direct_role_assignments: the no-team path (small-business default) ───
CREATE TABLE IF NOT EXISTS direct_role_assignments (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope      text NOT NULL CHECK (scope IN ('org', 'vendor')),
  org_id     uuid REFERENCES organizations(id) ON DELETE CASCADE,
  vendor_id  uuid REFERENCES vendors(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role_id    uuid NOT NULL REFERENCES roles(id),
  status     text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT dra_scope_consistency CHECK (
    (scope = 'org'    AND org_id    IS NOT NULL AND vendor_id IS NULL) OR
    (scope = 'vendor' AND vendor_id IS NOT NULL AND org_id    IS NULL)
  ),
  UNIQUE (scope, org_id, vendor_id, profile_id, role_id)
);

CREATE INDEX IF NOT EXISTS idx_dra_profile ON direct_role_assignments(profile_id);

DROP TRIGGER IF EXISTS dra_set_updated_at ON direct_role_assignments;
CREATE TRIGGER dra_set_updated_at
  BEFORE UPDATE ON direct_role_assignments
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE OR REPLACE FUNCTION enforce_dra_role_scope()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM roles WHERE id = NEW.role_id AND scope = NEW.scope) THEN
    RAISE EXCEPTION 'role % does not match assignment scope %', NEW.role_id, NEW.scope;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS dra_enforce_role_scope ON direct_role_assignments;
CREATE TRIGGER dra_enforce_role_scope
  BEFORE INSERT OR UPDATE ON direct_role_assignments
  FOR EACH ROW EXECUTE FUNCTION enforce_dra_role_scope();

-- ─── Backfill: today's flat assignments become direct_role_assignments ────
-- Nobody has a team yet (Teams didn't exist before this migration), so
-- every current org_member_roles/vendor_user_roles row is, by definition,
-- today's "no team, direct role" case. Preserves exact current effective
-- permissions under the new model without guessing anyone into a team.
INSERT INTO direct_role_assignments (scope, org_id, profile_id, role_id)
SELECT 'org', om.org_id, om.profile_id, omr.role_id
FROM org_member_roles omr
JOIN organization_members om ON om.id = omr.org_member_id
ON CONFLICT (scope, org_id, vendor_id, profile_id, role_id) DO NOTHING;

INSERT INTO direct_role_assignments (scope, vendor_id, profile_id, role_id)
SELECT 'vendor', vu.vendor_id, vu.profile_id, vur.role_id
FROM vendor_user_roles vur
JOIN vendor_users vu ON vu.id = vur.vendor_user_id
ON CONFLICT (scope, org_id, vendor_id, profile_id, role_id) DO NOTHING;

-- ─── RLS ────────────────────────────────────────────────────────────────────
-- Same baseline as 019: platform-admin manage-all + self-read. Broader reads
-- (an Org Admin listing their org's teams) go through the Express backend,
-- which bypasses RLS -- fine-grained enforcement there is Phase 3's job.
ALTER TABLE teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE direct_role_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "teams: platform admins manage" ON teams
  FOR ALL USING (is_platform_admin()) WITH CHECK (is_platform_admin());

CREATE POLICY "teams: member reads own team" ON teams
  FOR SELECT USING (
    is_platform_admin() OR EXISTS (
      SELECT 1 FROM team_members tm WHERE tm.team_id = teams.id AND tm.profile_id = auth.uid()
    )
  );

CREATE POLICY "team_members: platform admins manage" ON team_members
  FOR ALL USING (is_platform_admin()) WITH CHECK (is_platform_admin());

CREATE POLICY "team_members: self read" ON team_members
  FOR SELECT USING (is_platform_admin() OR profile_id = auth.uid());

CREATE POLICY "direct_role_assignments: platform admins manage" ON direct_role_assignments
  FOR ALL USING (is_platform_admin()) WITH CHECK (is_platform_admin());

CREATE POLICY "direct_role_assignments: self read" ON direct_role_assignments
  FOR SELECT USING (is_platform_admin() OR profile_id = auth.uid());
