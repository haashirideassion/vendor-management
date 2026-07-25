-- Phase 4 (org/group frontend confirmation): a group_admin on a PARENT group
-- had full standing access to a nested sub-group's member orgs' business
-- data (via is_group_admin_for_org_as walking up the ancestor chain), but
-- could not open that sub-group's own overview/primary/membership screens --
-- backend/src/routes/groups.ts's requireDirectGroupAdmin only checked for a
-- group_members row on the exact group_id requested, not any ancestor.
-- GroupOverview.tsx renders sub-groups as clickable links regardless, so a
-- parent-group admin clicking through hit a 403 dead end.
--
-- This mirrors is_group_admin_for_org_as's ancestor walk, but starting from a
-- group instead of an org (no "seed" step needed -- we already have the
-- group_id to walk up from).

CREATE OR REPLACE FUNCTION public.is_group_admin_for_group_as(p_user_id uuid, p_group_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$
  WITH RECURSIVE ancestors AS (
    SELECT id, parent_group_id FROM organization_groups WHERE id = p_group_id
    UNION
    SELECT og.id, og.parent_group_id
    FROM organization_groups og
    JOIN ancestors a ON og.id = a.parent_group_id
  )
  SELECT EXISTS (
    SELECT 1
    FROM group_members gm
    JOIN ancestors a ON a.id = gm.group_id
    WHERE gm.user_id = p_user_id
      AND gm.role = 'group_admin'
      AND gm.effective_to IS NULL
  );
$$;
