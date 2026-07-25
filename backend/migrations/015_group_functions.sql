-- Phase 2 (group hierarchy): access-check functions, RLS policies, and
-- enforcement triggers for the tables created in 014_group_hierarchy.sql.
--
-- All access-check functions follow the existing convention (see
-- is_org_member/is_org_admin/is_platform_admin, and org_id_for_* in
-- 009_fix_rls_recursion.sql): LANGUAGE sql STABLE SECURITY DEFINER, so they
-- bypass RLS on the tables they read internally and are recursion-safe when
-- called from a policy on those same tables.
--
-- Because the Express backend writes via the Supabase SERVICE ROLE KEY
-- (bypasses RLS entirely -- see 008_org_scoped_rls.sql's comment on this),
-- every invariant below that must hold regardless of caller (dated-row
-- immutability, primary-org consistency, dissolution safeguards) is enforced
-- as a DB trigger that RAISEs, not left to application-layer convention.

-- ─── is_group_admin_for_org_as / is_group_admin_for_org / has_org_access ────
-- Parameterized core, usable from Express under the service-role key (where
-- auth.uid() is NULL) by passing the caller's id explicitly via RPC.
CREATE OR REPLACE FUNCTION public.is_group_admin_for_org_as(p_user_id uuid, p_org_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$
  WITH RECURSIVE seed AS (
    -- groups directly containing the org right now
    SELECT go.group_id
    FROM group_organizations go
    WHERE go.organization_id = p_org_id
      AND go.effective_to IS NULL
      AND go.status = 'active'
  ),
  ancestors AS (
    -- walk UP parent_group_id to every ancestor of those groups
    SELECT group_id FROM seed
    UNION
    SELECT og.parent_group_id
    FROM organization_groups og
    JOIN ancestors a ON og.id = a.group_id
    WHERE og.parent_group_id IS NOT NULL
  )
  SELECT EXISTS (
    SELECT 1
    FROM group_members gm
    JOIN ancestors a ON a.group_id = gm.group_id
    WHERE gm.user_id = p_user_id
      AND gm.role = 'group_admin'
      AND gm.effective_to IS NULL
  );
$$;

-- RLS-facing wrapper (uses the caller's own identity via auth.uid()).
CREATE OR REPLACE FUNCTION public.is_group_admin_for_org(p_org_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT public.is_group_admin_for_org_as(auth.uid(), p_org_id);
$$;

-- Drop-in replacement for is_org_member(org_id) in every org-scoped RLS
-- policy (wired up in a later migration once the exact live policy names on
-- organization_vendors are confirmed). is_org_member() itself exists live
-- but, like organization_members, was never captured in a committed
-- migration -- this function assumes it exists in the target database.
CREATE OR REPLACE FUNCTION public.has_org_access(p_org_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT is_org_member(p_org_id) OR public.is_group_admin_for_org(p_org_id);
$$;

-- Wraps cross-table checks against group_members/group_organizations in a
-- SECURITY DEFINER function, the same reason org_id_for_engagement() etc.
-- exist in 009_fix_rls_recursion.sql: an RLS policy that queried those
-- tables directly via a bare subquery would be subject to THEIR own RLS
-- policies at evaluation time, which is unnecessary indirection at best and
-- a recursion risk at worst. Covers both "is a direct group_admin of this
-- group" and "has access to an org that's a member of this group" -- used
-- by the organization_groups and group_members read policies below.
CREATE OR REPLACE FUNCTION public.group_visible_to_caller(p_group_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM group_members gm
    WHERE gm.group_id = p_group_id
      AND gm.user_id = auth.uid()
      AND gm.effective_to IS NULL
  )
  OR EXISTS (
    SELECT 1 FROM group_organizations go
    WHERE go.group_id = p_group_id
      AND go.effective_to IS NULL
      AND go.status = 'active'
      AND has_org_access(go.organization_id)
  );
$$;

-- ─── org_ids_for_group_as_of: historical rollup helper ─────────────────────
-- Walks DOWN into descendant groups (the opposite direction from
-- is_group_admin_for_org_as, which walks up) and resolves membership as of a
-- point in time via group_organizations' effective_from/effective_to, so a
-- re-parented org's historical data stays attributed to whichever group
-- owned it at the time, not wherever it sits today.
CREATE OR REPLACE FUNCTION public.org_ids_for_group_as_of(p_group_id uuid, p_as_of timestamptz)
RETURNS TABLE(organization_id uuid) LANGUAGE sql STABLE SECURITY DEFINER AS $$
  WITH RECURSIVE subtree AS (
    SELECT id FROM organization_groups WHERE id = p_group_id
    UNION
    SELECT og.id
    FROM organization_groups og
    JOIN subtree s ON og.parent_group_id = s.id
  )
  SELECT DISTINCT go.organization_id
  FROM group_organizations go
  JOIN subtree s ON s.id = go.group_id
  WHERE go.effective_from <= p_as_of
    AND (go.effective_to IS NULL OR go.effective_to > p_as_of);
$$;

-- ─── groups_without_active_admin: superadmin monitoring view ───────────────
-- A group with zero active group_admin grants is the one state that doesn't
-- self-heal -- nothing can be approved or reassigned there until a
-- superadmin grants a new group_admin.
CREATE OR REPLACE VIEW groups_without_active_admin AS
SELECT g.id, g.name, g.parent_group_id
FROM organization_groups g
WHERE g.status = 'active'
  AND NOT EXISTS (
    SELECT 1 FROM group_members gm
    WHERE gm.group_id = g.id
      AND gm.role = 'group_admin'
      AND gm.effective_to IS NULL
  );

-- ─── RLS policies ───────────────────────────────────────────────────────────
-- Group structure (create/dissolve/reparent/grant-revoke group_admin) is a
-- superadmin-only management surface per the frontend spec (Phase 5's Groups
-- module lives under the superadmin nav, matching how platform_admins/
-- organizations lifecycle changes are already gated). Reads are broader: any
-- group_admin of the group itself, or anyone with access (direct or via
-- group) to an org inside it, per the policies below.

DROP POLICY IF EXISTS "organization_groups: platform admins manage" ON organization_groups;
CREATE POLICY "organization_groups: platform admins manage" ON organization_groups
  FOR ALL USING (is_platform_admin()) WITH CHECK (is_platform_admin());

DROP POLICY IF EXISTS "organization_groups: group admins and org members read" ON organization_groups;
CREATE POLICY "organization_groups: group admins and org members read" ON organization_groups
  FOR SELECT USING (is_platform_admin() OR group_visible_to_caller(organization_groups.id));

DROP POLICY IF EXISTS "group_organizations: platform admins manage" ON group_organizations;
CREATE POLICY "group_organizations: platform admins manage" ON group_organizations
  FOR ALL USING (is_platform_admin()) WITH CHECK (is_platform_admin());

DROP POLICY IF EXISTS "group_organizations: accessible org members read" ON group_organizations;
CREATE POLICY "group_organizations: accessible org members read" ON group_organizations
  FOR SELECT USING (is_platform_admin() OR has_org_access(organization_id));

DROP POLICY IF EXISTS "group_members: platform admins manage" ON group_members;
CREATE POLICY "group_members: platform admins manage" ON group_members
  FOR ALL USING (is_platform_admin()) WITH CHECK (is_platform_admin());

DROP POLICY IF EXISTS "group_members: self and org-accessible read" ON group_members;
CREATE POLICY "group_members: self and org-accessible read" ON group_members
  FOR SELECT USING (
    is_platform_admin()
    OR user_id = auth.uid()
    OR group_visible_to_caller(group_members.group_id)
  );

-- group_parent_history is written exclusively by the SECURITY DEFINER
-- trigger below, never by application code -- no write policy needed.
DROP POLICY IF EXISTS "group_parent_history: platform admins read" ON group_parent_history;
CREATE POLICY "group_parent_history: platform admins read" ON group_parent_history
  FOR SELECT USING (is_platform_admin());

-- ─── Enforcement triggers ───────────────────────────────────────────────────

-- Dated-row immutability: group_organizations rows are append-only. Once a
-- row is closed (effective_to set) it can never be touched again; while
-- open, only effective_to/status may transition (closing it) -- every other
-- core column is fixed at insert time. Also blocks ending the active
-- membership of a group's current primary_org_id until the primary is
-- reassigned or explicitly cleared first (nulling primary_org_id itself is
-- always allowed -- see enforce_group_primary_org below -- only removing the
-- org while it's still primary is blocked).
CREATE OR REPLACE FUNCTION enforce_group_organizations_update()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF OLD.effective_to IS NOT NULL THEN
    RAISE EXCEPTION 'group_organizations row % is already closed and cannot be modified', OLD.id;
  END IF;

  IF NEW.group_id           IS DISTINCT FROM OLD.group_id
     OR NEW.organization_id IS DISTINCT FROM OLD.organization_id
     OR NEW.relationship_type IS DISTINCT FROM OLD.relationship_type
     OR NEW.effective_from  IS DISTINCT FROM OLD.effective_from THEN
    RAISE EXCEPTION 'group_organizations rows are append-only; close this row (effective_to) and insert a new one instead of editing it in place';
  END IF;

  IF NEW.effective_to IS NOT NULL AND OLD.effective_to IS NULL THEN
    IF EXISTS (
      SELECT 1 FROM organization_groups
      WHERE id = OLD.group_id AND primary_org_id = OLD.organization_id
    ) THEN
      RAISE EXCEPTION 'cannot end org %''s membership in group %: it is the group''s current primary org -- reassign or clear primary_org_id first', OLD.organization_id, OLD.group_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS group_organizations_enforce_update ON group_organizations;
CREATE TRIGGER group_organizations_enforce_update
  BEFORE UPDATE ON group_organizations
  FOR EACH ROW EXECUTE FUNCTION enforce_group_organizations_update();

-- Same append-only pattern for group_members.
CREATE OR REPLACE FUNCTION enforce_group_members_update()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF OLD.effective_to IS NOT NULL THEN
    RAISE EXCEPTION 'group_members row % is already closed and cannot be modified', OLD.id;
  END IF;

  IF NEW.group_id  IS DISTINCT FROM OLD.group_id
     OR NEW.user_id IS DISTINCT FROM OLD.user_id
     OR NEW.role    IS DISTINCT FROM OLD.role
     OR NEW.effective_from IS DISTINCT FROM OLD.effective_from THEN
    RAISE EXCEPTION 'group_members rows are append-only; close this row (effective_to) and insert a new one instead of editing it in place';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS group_members_enforce_update ON group_members;
CREATE TRIGGER group_members_enforce_update
  BEFORE UPDATE ON group_members
  FOR EACH ROW EXECUTE FUNCTION enforce_group_members_update();

-- primary_org_id consistency: cannot be set at group-creation time (no
-- group_organizations row can reference a group that doesn't exist yet --
-- link the org first, then set primary_org_id in a follow-up update), and
-- once set, must always point at a currently-active member of that same
-- group. Clearing it (setting to NULL) is always allowed -- that's a valid,
-- supported state (resolves to the neutral group overview); the "must choose
-- a successor" requirement is enforced separately, on removing the org's
-- membership itself (see enforce_group_organizations_update above).
CREATE OR REPLACE FUNCTION enforce_group_primary_org()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.primary_org_id IS NOT NULL THEN
      RAISE EXCEPTION 'primary_org_id cannot be set on group creation; link the org via group_organizations first, then set primary_org_id in a follow-up update';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.primary_org_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM group_organizations
    WHERE group_id = NEW.id
      AND organization_id = NEW.primary_org_id
      AND effective_to IS NULL
      AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'primary_org_id % is not an active member of group %', NEW.primary_org_id, NEW.id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS organization_groups_enforce_primary_insert ON organization_groups;
CREATE TRIGGER organization_groups_enforce_primary_insert
  BEFORE INSERT ON organization_groups
  FOR EACH ROW EXECUTE FUNCTION enforce_group_primary_org();

DROP TRIGGER IF EXISTS organization_groups_enforce_primary_update ON organization_groups;
CREATE TRIGGER organization_groups_enforce_primary_update
  BEFORE UPDATE OF primary_org_id ON organization_groups
  FOR EACH ROW EXECUTE FUNCTION enforce_group_primary_org();

-- Dissolution guard: a group cannot be archived/merged/deleted while it
-- still has active member orgs or active sub-groups -- both must be
-- explicitly reassigned first (in-context admin action or superadmin
-- override, per the service layer added in Phase 4).
CREATE OR REPLACE FUNCTION enforce_group_dissolution()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_group_id uuid := COALESCE(OLD.id, NEW.id);
BEGIN
  IF TG_OP = 'DELETE' OR (NEW.status IN ('archived', 'merged') AND OLD.status = 'active') THEN
    IF EXISTS (
      SELECT 1 FROM group_organizations
      WHERE group_id = v_group_id AND effective_to IS NULL AND status = 'active'
    ) THEN
      RAISE EXCEPTION 'group % still has active member organizations; reassign them before dissolving', v_group_id;
    END IF;

    IF EXISTS (
      SELECT 1 FROM organization_groups
      WHERE parent_group_id = v_group_id AND status = 'active'
    ) THEN
      RAISE EXCEPTION 'group % still has active sub-groups; reparent them before dissolving', v_group_id;
    END IF;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS organization_groups_enforce_dissolution_update ON organization_groups;
CREATE TRIGGER organization_groups_enforce_dissolution_update
  BEFORE UPDATE OF status ON organization_groups
  FOR EACH ROW EXECUTE FUNCTION enforce_group_dissolution();

DROP TRIGGER IF EXISTS organization_groups_enforce_dissolution_delete ON organization_groups;
CREATE TRIGGER organization_groups_enforce_dissolution_delete
  BEFORE DELETE ON organization_groups
  FOR EACH ROW EXECUTE FUNCTION enforce_group_dissolution();

-- group_parent_history maintenance: mirrors parent_group_id whenever it
-- changes, so historical rollups can reconstruct the tree as of a past date
-- without dating the live column itself. SECURITY DEFINER so the insert
-- succeeds regardless of which role's statement fired the trigger (this
-- table has no INSERT policy of its own -- see RLS section above).
CREATE OR REPLACE FUNCTION log_group_parent_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO group_parent_history (group_id, parent_group_id, effective_from)
    VALUES (NEW.id, NEW.parent_group_id, now());
    RETURN NEW;
  END IF;

  IF NEW.parent_group_id IS DISTINCT FROM OLD.parent_group_id THEN
    UPDATE group_parent_history
    SET effective_to = now()
    WHERE group_id = NEW.id AND effective_to IS NULL;

    INSERT INTO group_parent_history (group_id, parent_group_id, effective_from)
    VALUES (NEW.id, NEW.parent_group_id, now());
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS organization_groups_log_parent_insert ON organization_groups;
CREATE TRIGGER organization_groups_log_parent_insert
  AFTER INSERT ON organization_groups
  FOR EACH ROW EXECUTE FUNCTION log_group_parent_change();

DROP TRIGGER IF EXISTS organization_groups_log_parent_update ON organization_groups;
CREATE TRIGGER organization_groups_log_parent_update
  AFTER UPDATE OF parent_group_id ON organization_groups
  FOR EACH ROW EXECUTE FUNCTION log_group_parent_change();

-- ─── Sanctioned write-path stored procedures ────────────────────────────────
-- The one documented way to do the close-and-insert dated-row pattern
-- atomically. Application code should call these rather than hand-writing
-- an UPDATE followed by an INSERT.

CREATE OR REPLACE FUNCTION rebind_group_organization(
  p_group_id          uuid,
  p_organization_id   uuid,
  p_relationship_type text DEFAULT 'member',
  p_status            text DEFAULT 'active'
) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE
  v_new_id uuid;
BEGIN
  UPDATE group_organizations
  SET effective_to = now(), status = 'ended'
  WHERE group_id = p_group_id
    AND organization_id = p_organization_id
    AND effective_to IS NULL;

  INSERT INTO group_organizations (group_id, organization_id, relationship_type, status, effective_from)
  VALUES (p_group_id, p_organization_id, p_relationship_type, p_status, now())
  RETURNING id INTO v_new_id;

  RETURN v_new_id;
END;
$$;

-- Pure removal (no replacement row) -- an org leaving a group entirely, e.g.
-- as part of the service-layer removeOrgFromGroup flow (Phase 4), which
-- reassigns/clears primary_org_id first if needed, then calls this.
CREATE OR REPLACE FUNCTION end_group_organization(
  p_group_id        uuid,
  p_organization_id uuid
) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  UPDATE group_organizations
  SET effective_to = now(), status = 'ended'
  WHERE group_id = p_group_id
    AND organization_id = p_organization_id
    AND effective_to IS NULL;
END;
$$;

CREATE OR REPLACE FUNCTION rebind_group_member(
  p_group_id uuid,
  p_user_id  uuid,
  p_role     text DEFAULT 'group_admin'
) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE
  v_new_id uuid;
BEGIN
  UPDATE group_members
  SET effective_to = now()
  WHERE group_id = p_group_id AND user_id = p_user_id AND role = p_role AND effective_to IS NULL;

  INSERT INTO group_members (group_id, user_id, role, effective_from)
  VALUES (p_group_id, p_user_id, p_role, now())
  RETURNING id INTO v_new_id;

  RETURN v_new_id;
END;
$$;

CREATE OR REPLACE FUNCTION end_group_member(
  p_group_id uuid,
  p_user_id  uuid,
  p_role     text DEFAULT 'group_admin'
) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  UPDATE group_members
  SET effective_to = now()
  WHERE group_id = p_group_id AND user_id = p_user_id AND role = p_role AND effective_to IS NULL;
END;
$$;
