-- Phase 2 (group hierarchy): adds organization_groups, group_organizations,
-- group_members, and group_parent_history on top of the existing multi-org
-- foundation (organizations, organization_members). This migration is schema
-- only (tables, constraints, indexes, RLS enabled) -- the access-check
-- functions, RLS policies, and enforcement triggers that depend on them live
-- in 015_group_functions.sql, since several policies/triggers need functions
-- (e.g. has_org_access, which walks parent_group_id) that don't exist until
-- that migration runs.
--
-- Key design points (see plan for full rationale):
--  - group_organizations is the ONLY place org<->group membership lives, and
--    is dated (effective_from/effective_to) so an org can be simultaneously
--    active in more than one group (joint-venture case) while still being
--    unique-per-group at any point in time.
--  - group_members grants STANDING delegated group_admin access, not
--    break-glass -- effective_to NULL means the grant is currently active.
--  - organization_groups.primary_org_id is a GROUP-level "flagship org"
--    concept, unrelated to the existing organization_members.is_primary
--    (a user's personal default-org flag) -- deliberately different name to
--    avoid confusion between the two.
--  - group_parent_history mirrors organization_groups.parent_group_id
--    whenever it changes (via trigger in 015), so historical rollups can
--    answer "what was this group's tree as of date D" without dating the
--    live parent_group_id column itself.

-- ─── organization_groups ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS organization_groups (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text NOT NULL,
  parent_group_id uuid REFERENCES organization_groups(id),
  primary_org_id  uuid REFERENCES organizations(id),
  status          text NOT NULL DEFAULT 'active',
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT organization_groups_status_check CHECK (status IN ('active', 'archived', 'merged')),
  CONSTRAINT organization_groups_no_self_parent CHECK (parent_group_id <> id)
);

CREATE INDEX IF NOT EXISTS idx_organization_groups_parent ON organization_groups(parent_group_id);

ALTER TABLE organization_groups ENABLE ROW LEVEL SECURITY;

-- ─── group_organizations: dated org<->group membership (sole source) ───────
CREATE TABLE IF NOT EXISTS group_organizations (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id          uuid NOT NULL REFERENCES organization_groups(id),
  organization_id   uuid NOT NULL REFERENCES organizations(id),
  relationship_type text NOT NULL DEFAULT 'member',
  effective_from    timestamptz NOT NULL DEFAULT now(),
  effective_to      timestamptz,
  status            text NOT NULL DEFAULT 'active',
  created_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT group_organizations_relationship_type_check
    CHECK (relationship_type IN ('member', 'associate', 'joint_venture', 'divested')),
  CONSTRAINT group_organizations_status_check CHECK (status IN ('active', 'ended')),
  CONSTRAINT group_organizations_effective_range_check
    CHECK (effective_to IS NULL OR effective_to >= effective_from)
);

-- At most one ACTIVE row per (group, org) -- but an org can hold active rows
-- in more than one DIFFERENT group at once (joint-venture case).
CREATE UNIQUE INDEX IF NOT EXISTS uq_group_organizations_active
  ON group_organizations(group_id, organization_id) WHERE effective_to IS NULL;

CREATE INDEX IF NOT EXISTS idx_group_organizations_org_active
  ON group_organizations(organization_id, group_id) WHERE effective_to IS NULL AND status = 'active';

CREATE INDEX IF NOT EXISTS idx_group_organizations_group_active
  ON group_organizations(group_id) WHERE effective_to IS NULL;

ALTER TABLE group_organizations ENABLE ROW LEVEL SECURITY;

-- ─── group_members: standing delegated group_admin access ──────────────────
CREATE TABLE IF NOT EXISTS group_members (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id       uuid NOT NULL REFERENCES organization_groups(id),
  user_id        uuid NOT NULL REFERENCES profiles(id),
  role           text NOT NULL DEFAULT 'group_admin',
  effective_from timestamptz NOT NULL DEFAULT now(),
  effective_to   timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT group_members_role_check CHECK (role IN ('group_admin')),
  CONSTRAINT group_members_effective_range_check
    CHECK (effective_to IS NULL OR effective_to >= effective_from)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_group_members_active
  ON group_members(group_id, user_id, role) WHERE effective_to IS NULL;

-- Partial index for the RLS anchor lookup: "which groups is this user an
-- active group_admin of", keyed on auth.uid() -- the hot path for every
-- has_org_access() call added in 015/016.
CREATE INDEX IF NOT EXISTS idx_group_members_user_active
  ON group_members(user_id) WHERE effective_to IS NULL AND role = 'group_admin';

CREATE INDEX IF NOT EXISTS idx_group_members_group ON group_members(group_id);

ALTER TABLE group_members ENABLE ROW LEVEL SECURITY;

-- ─── group_parent_history: derived, trigger-maintained audit of re-parenting ─
-- Never written to directly by application code -- populated exclusively by
-- the trigger added in 015 whenever organization_groups.parent_group_id
-- changes. Read by historical rollup queries only; never consulted by the
-- live access-check functions (those always use the current parent_group_id).
CREATE TABLE IF NOT EXISTS group_parent_history (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id        uuid NOT NULL REFERENCES organization_groups(id),
  parent_group_id uuid REFERENCES organization_groups(id),
  effective_from  timestamptz NOT NULL DEFAULT now(),
  effective_to    timestamptz
);

CREATE INDEX IF NOT EXISTS idx_group_parent_history_group ON group_parent_history(group_id);

ALTER TABLE group_parent_history ENABLE ROW LEVEL SECURITY;
