-- Phase H (part 1): vendor-Manager approval gate for RFQ quotations, per the
-- confirmed flow-doc requirement: "when Associate provides quotation it is
-- sent to Manager for approval, only then is it submitted to organisation;
-- until then it is in pending status." Verified in §2.8 of the gap-analysis
-- doc that this did not exist -- quotations went straight from draft to
-- submitted with no vendor-internal gate at all.
--
-- New lifecycle: draft -> pending_manager_review -> submitted -> accepted/rejected
--   draft                  : Associate is drafting (quotations.draft_line_items)
--   pending_manager_review : Associate has finished and sent it up; not yet
--                            visible to the org as "submitted"
--   submitted              : vendor Manager/Admin approved it; this is the
--                            moment the org actually sees it (matches
--                            existing "vendor reads own" / org notify logic)
--   accepted/rejected      : org's final decision (unchanged, gated by
--                            quotations.compare_select -- see route patch)
--
-- A Manager/Admin can also reject back to 'draft' with remarks instead of
-- approving -- per the app's existing general rule that rejections return
-- to the creator, editable, with remarks attached (not archived).

ALTER TABLE quotations DROP CONSTRAINT IF EXISTS quotations_status_check;
ALTER TABLE quotations ADD CONSTRAINT quotations_status_check
  CHECK (status IN ('draft', 'pending_manager_review', 'submitted', 'accepted', 'rejected'));

ALTER TABLE quotations
  ADD COLUMN IF NOT EXISTS manager_review_notes text,
  ADD COLUMN IF NOT EXISTS reviewed_by           uuid REFERENCES profiles(id),
  ADD COLUMN IF NOT EXISTS reviewed_at           timestamptz;

-- ─── Vendor Admin cumulative-permissions fix (required for this gate) ──────
-- 018_rbac_seed.sql seeded vendor-scope bundles as three separate functional
-- buckets (Admin: profile/bank/docs/user-mgmt only; Manager: quotations/PO/
-- invoices; Associate: deliveries/line-items) -- explicitly NOT cumulative,
-- per that migration's own comment, which flagged this as a design choice
-- to revisit if Admin should also do what Manager/Associate do. The flow
-- doc's confirmed rule (Q11: "Admin has everything the other three roles
-- have, plus, uniquely, the ability to invite staff") requires Admin to
-- hold quotations.submit and quotations.draft_line_items too -- otherwise
-- the "Manager/Admin can approve if Associate isn't available" half of this
-- gate has no one to fall back to. Grant vendor Admin the full Manager +
-- Associate bundle now, cumulative, matching org-side Admin's design.
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.scope = 'vendor' AND r.name = 'Admin'
  AND p.key IN (
    'quotations.submit', 'quotations.negotiate', 'purchase_orders.fulfill', 'invoices.submit',
    'deliveries.confirm', 'quotations.draft_line_items'
  )
ON CONFLICT DO NOTHING;

-- ─── RLS: keep policies consistent with the new state (defense-in-depth; ──
-- Express still writes via the service-role key and does the real
-- enforcement in the route, per 008_org_scoped_rls.sql's established
-- pattern) ────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "quotations: vendor updates own draft" ON quotations;
CREATE POLICY "quotations: vendor updates own draft" ON quotations
  FOR UPDATE
  USING (
    vendor_id IN (SELECT id FROM vendors WHERE profile_id = auth.uid())
    AND status IN ('draft', 'pending_manager_review', 'submitted')
  )
  WITH CHECK (vendor_id IN (SELECT id FROM vendors WHERE profile_id = auth.uid()));

-- Line items are only editable while still in 'draft' -- once sent for
-- Manager review they're locked for the Associate (previously the policy
-- also allowed inserts while 'submitted', which was inconsistent with
-- everything else in this table being locked post-submission).
DROP POLICY IF EXISTS "qli: vendor inserts own" ON quotation_line_items;
CREATE POLICY "qli: vendor inserts own" ON quotation_line_items
  FOR INSERT
  TO authenticated
  WITH CHECK (
    quotation_id IN (
      SELECT id FROM quotations
      WHERE vendor_id IN (SELECT id FROM vendors WHERE profile_id = auth.uid())
        AND status = 'draft'
    )
  );
