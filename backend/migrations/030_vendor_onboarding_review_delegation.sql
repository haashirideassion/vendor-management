-- Phase E (approval delegation): one-off reassignment of a single pending
-- vendor-onboarding review, per the confirmed design (contradiction #5 in
-- the gap-analysis doc):
--   - This is a ONE-OFF reassignment of one pending organization_vendors
--     row, not a standing "out of office" rule -- that's what
--     group_members already covers for group-admin delegation, and is
--     deliberately NOT reused here.
--   - Reassigning does not remove the org's regular admins from being able
--     to act -- it just adds an additional reviewer who can also approve/
--     reject this one pending link, matching "Local Admin can, in absence,
--     assign any admin or manager in the group" (the assignee is not
--     restricted to being another Local Admin).
--   - The assignment is cleared automatically the moment the row is
--     resolved (approved/rejected), since a one-off delegation shouldn't
--     silently persist onto the org_vendor row's next lifecycle event.

ALTER TABLE organization_vendors
  ADD COLUMN IF NOT EXISTS assigned_reviewer_id uuid REFERENCES profiles(id),
  ADD COLUMN IF NOT EXISTS assigned_by         uuid REFERENCES profiles(id),
  ADD COLUMN IF NOT EXISTS assigned_at         timestamptz;

CREATE INDEX IF NOT EXISTS idx_org_vendors_assigned_reviewer
  ON organization_vendors(assigned_reviewer_id)
  WHERE assigned_reviewer_id IS NOT NULL;

-- ─── can_review_vendor_onboarding_as ────────────────────────────────────────
-- True if the caller is a regular admin/manager of the org (has
-- vendors.manage_status via the RBAC bundle) OR is the specific person this
-- one pending review was reassigned to. Mirrors the has_permission_as /
-- has_vendor_permission_as _as-wrapper pattern (021_rbac_helper_functions.sql)
-- so it's callable from Express under the service-role key.
CREATE OR REPLACE FUNCTION public.can_review_vendor_onboarding_as(
  p_user_id           uuid,
  p_organization_vendor_id uuid
) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT
    public.has_permission_as(
      p_user_id,
      (SELECT org_id FROM organization_vendors WHERE id = p_organization_vendor_id),
      'vendors.manage_status'
    )
    OR EXISTS (
      SELECT 1 FROM organization_vendors
      WHERE id = p_organization_vendor_id
        AND assigned_reviewer_id = p_user_id
    );
$$;

-- ─── clear_vendor_onboarding_assignment ─────────────────────────────────────
-- Called by the /vendors/update-status route right after a status change
-- resolves a pending review, so the one-off delegation doesn't linger.
CREATE OR REPLACE FUNCTION public.clear_vendor_onboarding_assignment(
  p_organization_vendor_id uuid
) RETURNS void LANGUAGE sql SECURITY DEFINER AS $$
  UPDATE organization_vendors
  SET assigned_reviewer_id = NULL, assigned_by = NULL, assigned_at = NULL
  WHERE id = p_organization_vendor_id;
$$;

-- RLS: no new policy needed for read/write of these columns specifically --
-- organization_vendors' existing has_org_access()-gated policies already
-- cover them, and all writes go through the Express service-role key per
-- the project's established pattern (008_org_scoped_rls.sql).
