-- Phase D: rework a vendor's group-based org reach (vendors.onboarded_via_
-- group_id) from a point-in-time SNAPSHOT into something that stays LIVE as
-- group_organizations membership changes -- confirmed design (gap-analysis
-- contradiction #1): an org joining the group later automatically grants
-- the vendor access to it; an org leaving the group (or a Local Admin
-- explicitly revoking) removes the vendor's access to just that one org,
-- without touching the vendor's overall group relationship
-- (vendors.onboarded_via_group_id itself is never cleared by this).
--
-- organization_vendors has no "which group granted this row" column of its
-- own -- reach is still resolved via vendors.onboarded_via_group_id (one
-- value per vendor, set at original onboarding time by admin-onboard). A
-- row this vendor holds at an org NOT currently in that group (e.g. a
-- separately/directly-onboarded relationship) is never touched by any of
-- this -- only rows at orgs that are/were members of the vendor's own
-- onboarding group.
--
-- group_organizations is append-only (015_group_functions.sql): joining is
-- always a fresh INSERT (status='active', effective_to NULL); leaving is
-- always an UPDATE that sets effective_to (via end_group_organization() or
-- rebind_group_organization()'s close step). The two triggers below hook
-- exactly those two sanctioned transitions.

ALTER TABLE organization_vendors
  ADD COLUMN IF NOT EXISTS group_reach_revoked_at timestamptz;

-- ─── grant_group_vendor_reach: an org joins the group ──────────────────────
-- Every vendor onboarded via this group gains (or regains) a pending_review
-- relationship with the newly-joined org, same as if they'd been onboarded
-- via the group at that org from the start -- the joining org's own Local
-- Admin still has to review it, matching admin-onboard's existing behavior.
CREATE OR REPLACE FUNCTION public.grant_group_vendor_reach(p_group_id uuid, p_org_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  -- Re-grant orgs that previously had this vendor revoked (org had left,
  -- now rejoining) -- reset to pending_review rather than leaving it
  -- suspended.
  UPDATE organization_vendors ov
  SET status = 'pending_review', group_reach_revoked_at = NULL
  FROM vendors v
  WHERE v.id = ov.vendor_id
    AND v.onboarded_via_group_id = p_group_id
    AND ov.org_id = p_org_id
    AND ov.group_reach_revoked_at IS NOT NULL;

  -- Brand-new grants for vendors who never had a relationship with this org.
  INSERT INTO organization_vendors (org_id, vendor_id, status)
  SELECT p_org_id, v.id, 'pending_review'
  FROM vendors v
  WHERE v.onboarded_via_group_id = p_group_id
    AND NOT EXISTS (
      SELECT 1 FROM organization_vendors ov
      WHERE ov.org_id = p_org_id AND ov.vendor_id = v.id
    );
END;
$$;

-- ─── revoke_group_vendor_reach: an org leaves the group ────────────────────
-- Suspends (does not delete) this vendor's relationship with that one org --
-- reversible if the org rejoins later (grant_group_vendor_reach re-grants
-- exactly the rows this leaves group_reach_revoked_at stamped on). Does NOT
-- touch vendors.onboarded_via_group_id or this vendor's rows at any other
-- org in the group.
CREATE OR REPLACE FUNCTION public.revoke_group_vendor_reach(p_group_id uuid, p_org_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE organization_vendors ov
  SET status = 'suspended', group_reach_revoked_at = now()
  FROM vendors v
  WHERE v.id = ov.vendor_id
    AND v.onboarded_via_group_id = p_group_id
    AND ov.org_id = p_org_id
    AND ov.group_reach_revoked_at IS NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_group_vendor_reach_on_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NEW.status = 'active' AND NEW.effective_to IS NULL THEN
    PERFORM public.grant_group_vendor_reach(NEW.group_id, NEW.organization_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS group_organizations_sync_vendor_reach_insert ON group_organizations;
CREATE TRIGGER group_organizations_sync_vendor_reach_insert
  AFTER INSERT ON group_organizations
  FOR EACH ROW EXECUTE FUNCTION public.sync_group_vendor_reach_on_insert();

CREATE OR REPLACE FUNCTION public.sync_group_vendor_reach_on_update()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF OLD.effective_to IS NULL AND NEW.effective_to IS NOT NULL THEN
    PERFORM public.revoke_group_vendor_reach(OLD.group_id, OLD.organization_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS group_organizations_sync_vendor_reach_update ON group_organizations;
CREATE TRIGGER group_organizations_sync_vendor_reach_update
  AFTER UPDATE ON group_organizations
  FOR EACH ROW EXECUTE FUNCTION public.sync_group_vendor_reach_on_update();
