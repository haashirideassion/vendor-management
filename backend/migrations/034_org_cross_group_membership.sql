-- Phase C: allow one profile to hold a SECOND organization_members row at a
-- different org, but only when that org shares a Group with an org the
-- profile is already an active member of -- confirmed design (gap-analysis
-- contradiction #2, Q4 answer): priya@xyz.com can be a Manager at Org X and
-- an Associate at Org Y on the same email only when X and Y belong to the
-- same Group; otherwise it's one org per email, full stop.
--
-- Structural check first, per the gap-analysis doc's own instruction:
-- organization_members has no UNIQUE(profile_id)-alone constraint blocking
-- a second row today -- 019_rbac_assignment_tables.sql's
-- enforce_profile_not_both_vendor_and_org_member trigger only blocks
-- vendor-vs-org, not org-vs-org -- so nothing needs relaxing structurally.
-- This migration only ADDS the missing enforcement (today nothing stops a
-- second row for a completely unrelated, non-grouped org either, which is
-- equally wrong).

-- ─── orgs_share_active_group: true if org_a and org_b are both currently ───
-- active members of at least one common group.
CREATE OR REPLACE FUNCTION public.orgs_share_active_group(p_org_a uuid, p_org_b uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1
    FROM group_organizations ga
    JOIN group_organizations gb
      ON gb.group_id = ga.group_id
     AND gb.organization_id = p_org_b
    WHERE ga.organization_id = p_org_a
      AND ga.status = 'active' AND ga.effective_to IS NULL
      AND gb.status = 'active' AND gb.effective_to IS NULL
  );
$$;

-- ─── can_add_org_membership_as: the invite-time check ──────────────────────
-- True if the profile has no OTHER active/invited organization_members row
-- at all (the common, single-org case), or every other org they're already
-- attached to shares a Group with p_target_org_id.
CREATE OR REPLACE FUNCTION public.can_add_org_membership_as(p_profile_id uuid, p_target_org_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT NOT EXISTS (
    SELECT 1
    FROM organization_members om
    JOIN organizations o ON o.id = om.org_id
    WHERE om.profile_id = p_profile_id
      AND om.org_id <> p_target_org_id
      AND om.status IN ('invited', 'active')
      AND o.status = 'active'
      AND NOT public.orgs_share_active_group(om.org_id, p_target_org_id)
  );
$$;

-- ─── Enforcement trigger (defense-in-depth; Express does the primary check
-- in orgMembers.ts's /invite route, mirroring 008_org_scoped_rls.sql's
-- established pattern of Express enforcing + DB triggers/RLS backing it up)
CREATE OR REPLACE FUNCTION public.enforce_org_member_cross_group()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NOT public.can_add_org_membership_as(NEW.profile_id, NEW.org_id) THEN
    RAISE EXCEPTION 'profile % is already an active member of another organization outside this org''s Group', NEW.profile_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS organization_members_enforce_cross_group ON organization_members;
CREATE TRIGGER organization_members_enforce_cross_group
  BEFORE INSERT ON organization_members
  FOR EACH ROW EXECUTE FUNCTION public.enforce_org_member_cross_group();
