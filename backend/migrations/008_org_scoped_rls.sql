-- Phase 3 (multi-org migration): make RLS policies actually org-aware.
--
-- Today every "internal users" policy on business tables only checks
-- is_internal_user() (a single global "not a vendor" check) with zero
-- reference to org_id, even though is_org_member(org_id)/is_org_admin(org_id)
-- already exist as helpers. That means any internal user can read/write
-- every org's engagements/POs/GRNs/invoices/contracts/quotations today via
-- direct Supabase access. This migration tightens those policies to also
-- require is_org_member(org_id).
--
-- NOTE: the Express backend uses the service-role key and bypasses RLS
-- entirely, so this migration alone does NOT fix API-level cross-org access
-- -- that's Phase 4 (adding req.orgId + query filters to every route).

-- ─── One-time safe backfill: only one org exists today, so any NULL org_id ──
-- on audit_log/notifications can be unambiguously backfilled to it.
UPDATE audit_log SET org_id = '00000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;
UPDATE notifications SET org_id = '00000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;

-- ─── engagements ──────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "engagements: internal users read all" ON engagements;
CREATE POLICY "engagements: internal users read own org" ON engagements
  FOR SELECT USING (is_internal_user() AND is_org_member(org_id));

DROP POLICY IF EXISTS "engagements: internal users insert" ON engagements;
CREATE POLICY "engagements: internal users insert own org" ON engagements
  FOR INSERT WITH CHECK (is_internal_user() AND is_org_member(org_id) AND created_by = auth.uid());

DROP POLICY IF EXISTS "engagements: internal users update" ON engagements;
CREATE POLICY "engagements: internal users update own org" ON engagements
  FOR UPDATE USING (is_internal_user() AND is_org_member(org_id));

DROP POLICY IF EXISTS "engagements: internal users delete" ON engagements;
CREATE POLICY "engagements: internal users delete own org" ON engagements
  FOR DELETE USING (is_internal_user() AND is_org_member(org_id));

-- ─── engagement_vendors (child of engagements, no own org_id) ────────────
DROP POLICY IF EXISTS "ev: internal users read all" ON engagement_vendors;
CREATE POLICY "ev: internal users read own org" ON engagement_vendors
  FOR SELECT USING (
    is_internal_user() AND EXISTS (
      SELECT 1 FROM engagements e WHERE e.id = engagement_vendors.engagement_id AND is_org_member(e.org_id)
    )
  );

DROP POLICY IF EXISTS "ev: internal users insert" ON engagement_vendors;
CREATE POLICY "ev: internal users insert own org" ON engagement_vendors
  FOR INSERT WITH CHECK (
    is_internal_user() AND EXISTS (
      SELECT 1 FROM engagements e WHERE e.id = engagement_vendors.engagement_id AND is_org_member(e.org_id)
    )
  );

DROP POLICY IF EXISTS "ev: internal users delete" ON engagement_vendors;
CREATE POLICY "ev: internal users delete own org" ON engagement_vendors
  FOR DELETE USING (
    is_internal_user() AND EXISTS (
      SELECT 1 FROM engagements e WHERE e.id = engagement_vendors.engagement_id AND is_org_member(e.org_id)
    )
  );

-- ─── engagement_line_items (child of engagements, no own org_id) ─────────
DROP POLICY IF EXISTS "eli: internal users select" ON engagement_line_items;
CREATE POLICY "eli: internal users select own org" ON engagement_line_items
  FOR SELECT USING (
    is_internal_user() AND EXISTS (
      SELECT 1 FROM engagements e WHERE e.id = engagement_line_items.engagement_id AND is_org_member(e.org_id)
    )
  );

DROP POLICY IF EXISTS "eli: internal users insert" ON engagement_line_items;
CREATE POLICY "eli: internal users insert own org" ON engagement_line_items
  FOR INSERT WITH CHECK (
    is_internal_user() AND EXISTS (
      SELECT 1 FROM engagements e WHERE e.id = engagement_line_items.engagement_id AND is_org_member(e.org_id)
    )
  );

DROP POLICY IF EXISTS "eli: internal users update" ON engagement_line_items;
CREATE POLICY "eli: internal users update own org" ON engagement_line_items
  FOR UPDATE USING (
    is_internal_user() AND EXISTS (
      SELECT 1 FROM engagements e WHERE e.id = engagement_line_items.engagement_id AND is_org_member(e.org_id)
    )
  ) WITH CHECK (
    is_internal_user() AND EXISTS (
      SELECT 1 FROM engagements e WHERE e.id = engagement_line_items.engagement_id AND is_org_member(e.org_id)
    )
  );

DROP POLICY IF EXISTS "eli: internal users delete" ON engagement_line_items;
CREATE POLICY "eli: internal users delete own org" ON engagement_line_items
  FOR DELETE USING (
    is_internal_user() AND EXISTS (
      SELECT 1 FROM engagements e WHERE e.id = engagement_line_items.engagement_id AND is_org_member(e.org_id)
    )
  );

-- ─── rfqs ──────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "rfqs: internal users read all" ON rfqs;
CREATE POLICY "rfqs: internal users read own org" ON rfqs
  FOR SELECT USING (is_internal_user() AND is_org_member(org_id));

DROP POLICY IF EXISTS "rfqs: internal users insert" ON rfqs;
CREATE POLICY "rfqs: internal users insert own org" ON rfqs
  FOR INSERT WITH CHECK (is_internal_user() AND is_org_member(org_id));

DROP POLICY IF EXISTS "rfqs: internal users update" ON rfqs;
CREATE POLICY "rfqs: internal users update own org" ON rfqs
  FOR UPDATE USING (is_internal_user() AND is_org_member(org_id));

-- ─── quotations ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "quotations: internal users read all" ON quotations;
CREATE POLICY "quotations: internal users read own org" ON quotations
  FOR SELECT USING (is_internal_user() AND is_org_member(org_id));

DROP POLICY IF EXISTS "quotations: internal users update" ON quotations;
CREATE POLICY "quotations: internal users update own org" ON quotations
  FOR UPDATE USING (is_internal_user() AND is_org_member(org_id));

-- ─── quotation_line_items (child of quotations, no own org_id) ───────────
DROP POLICY IF EXISTS "qli: internal users read all" ON quotation_line_items;
CREATE POLICY "qli: internal users read own org" ON quotation_line_items
  FOR SELECT USING (
    is_internal_user() AND EXISTS (
      SELECT 1 FROM quotations q WHERE q.id = quotation_line_items.quotation_id AND is_org_member(q.org_id)
    )
  );

DROP POLICY IF EXISTS "qli: internal users delete" ON quotation_line_items;
CREATE POLICY "qli: internal users delete own org" ON quotation_line_items
  FOR DELETE USING (
    is_internal_user() AND EXISTS (
      SELECT 1 FROM quotations q WHERE q.id = quotation_line_items.quotation_id AND is_org_member(q.org_id)
    )
  );

-- ─── purchase_orders ────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "po: internal users read all" ON purchase_orders;
CREATE POLICY "po: internal users read own org" ON purchase_orders
  FOR SELECT USING (is_internal_user() AND is_org_member(org_id));

DROP POLICY IF EXISTS "po: procurement+ insert" ON purchase_orders;
CREATE POLICY "po: procurement+ insert own org" ON purchase_orders
  FOR INSERT WITH CHECK (is_internal_user() AND is_org_member(org_id) AND created_by = auth.uid());

DROP POLICY IF EXISTS "po: procurement+ update" ON purchase_orders;
CREATE POLICY "po: procurement+ update own org" ON purchase_orders
  FOR UPDATE USING (is_internal_user() AND is_org_member(org_id));

DROP POLICY IF EXISTS "purchase_orders: internal users delete" ON purchase_orders;
CREATE POLICY "purchase_orders: internal users delete own org" ON purchase_orders
  FOR DELETE USING (is_internal_user() AND is_org_member(org_id));

-- ─── po_line_items (child of purchase_orders, no own org_id) ─────────────
DROP POLICY IF EXISTS "po_line_items: internal users read all" ON po_line_items;
CREATE POLICY "po_line_items: internal users read own org" ON po_line_items
  FOR SELECT USING (
    is_internal_user() AND EXISTS (
      SELECT 1 FROM purchase_orders po WHERE po.id = po_line_items.po_id AND is_org_member(po.org_id)
    )
  );

DROP POLICY IF EXISTS "po_line_items: internal users insert" ON po_line_items;
CREATE POLICY "po_line_items: internal users insert own org" ON po_line_items
  FOR INSERT WITH CHECK (
    is_internal_user() AND EXISTS (
      SELECT 1 FROM purchase_orders po WHERE po.id = po_line_items.po_id AND is_org_member(po.org_id)
    )
  );

DROP POLICY IF EXISTS "po_line_items: internal users update" ON po_line_items;
CREATE POLICY "po_line_items: internal users update own org" ON po_line_items
  FOR UPDATE USING (
    is_internal_user() AND EXISTS (
      SELECT 1 FROM purchase_orders po WHERE po.id = po_line_items.po_id AND is_org_member(po.org_id)
    )
  );

DROP POLICY IF EXISTS "po_line_items: internal users delete" ON po_line_items;
CREATE POLICY "po_line_items: internal users delete own org" ON po_line_items
  FOR DELETE USING (
    is_internal_user() AND EXISTS (
      SELECT 1 FROM purchase_orders po WHERE po.id = po_line_items.po_id AND is_org_member(po.org_id)
    )
  );

-- ─── grns ───────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "grns: internal users read all" ON grns;
CREATE POLICY "grns: internal users read own org" ON grns
  FOR SELECT USING (is_internal_user() AND is_org_member(org_id));

DROP POLICY IF EXISTS "grns: internal users insert" ON grns;
CREATE POLICY "grns: internal users insert own org" ON grns
  FOR INSERT WITH CHECK (is_internal_user() AND is_org_member(org_id) AND created_by = auth.uid());

DROP POLICY IF EXISTS "grns: internal users update" ON grns;
CREATE POLICY "grns: internal users update own org" ON grns
  FOR UPDATE USING (is_internal_user() AND is_org_member(org_id));

DROP POLICY IF EXISTS "grns: internal users delete" ON grns;
CREATE POLICY "grns: internal users delete own org" ON grns
  FOR DELETE USING (is_internal_user() AND is_org_member(org_id));

-- ─── grn_line_items (child of grns, no own org_id) ───────────────────────
DROP POLICY IF EXISTS "grn_line_items: internal users read all" ON grn_line_items;
CREATE POLICY "grn_line_items: internal users read own org" ON grn_line_items
  FOR SELECT USING (
    is_internal_user() AND EXISTS (
      SELECT 1 FROM grns g WHERE g.id = grn_line_items.grn_id AND is_org_member(g.org_id)
    )
  );

DROP POLICY IF EXISTS "grn_line_items: internal users insert" ON grn_line_items;
CREATE POLICY "grn_line_items: internal users insert own org" ON grn_line_items
  FOR INSERT WITH CHECK (
    is_internal_user() AND EXISTS (
      SELECT 1 FROM grns g WHERE g.id = grn_line_items.grn_id AND is_org_member(g.org_id)
    )
  );

DROP POLICY IF EXISTS "grn_line_items: internal users update" ON grn_line_items;
CREATE POLICY "grn_line_items: internal users update own org" ON grn_line_items
  FOR UPDATE USING (
    is_internal_user() AND EXISTS (
      SELECT 1 FROM grns g WHERE g.id = grn_line_items.grn_id AND is_org_member(g.org_id)
    )
  );

DROP POLICY IF EXISTS "grn_line_items: internal users delete" ON grn_line_items;
CREATE POLICY "grn_line_items: internal users delete own org" ON grn_line_items
  FOR DELETE USING (
    is_internal_user() AND EXISTS (
      SELECT 1 FROM grns g WHERE g.id = grn_line_items.grn_id AND is_org_member(g.org_id)
    )
  );

-- ─── invoices ───────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "invoices: internal users read all" ON invoices;
CREATE POLICY "invoices: internal users read own org" ON invoices
  FOR SELECT USING (is_internal_user() AND is_org_member(org_id));

DROP POLICY IF EXISTS "invoices: internal users update" ON invoices;
CREATE POLICY "invoices: internal users update own org" ON invoices
  FOR UPDATE USING (is_internal_user() AND is_org_member(org_id));

DROP POLICY IF EXISTS "invoices: internal users delete" ON invoices;
CREATE POLICY "invoices: internal users delete own org" ON invoices
  FOR DELETE USING (is_internal_user() AND is_org_member(org_id));

-- ─── contracts ──────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "contracts: internal users read all" ON contracts;
CREATE POLICY "contracts: internal users read own org" ON contracts
  FOR SELECT USING (is_internal_user() AND is_org_member(org_id));

DROP POLICY IF EXISTS "contracts: internal users insert" ON contracts;
CREATE POLICY "contracts: internal users insert own org" ON contracts
  FOR INSERT WITH CHECK (is_internal_user() AND is_org_member(org_id) AND created_by = auth.uid());

DROP POLICY IF EXISTS "contracts: internal users update" ON contracts;
CREATE POLICY "contracts: internal users update own org" ON contracts
  FOR UPDATE USING (is_internal_user() AND is_org_member(org_id));

DROP POLICY IF EXISTS "contracts: internal users delete" ON contracts;
CREATE POLICY "contracts: internal users delete own org" ON contracts
  FOR DELETE USING (is_internal_user() AND is_org_member(org_id));

-- ─── contract_amendments (child of contracts, no own org_id) ─────────────
DROP POLICY IF EXISTS "amendments: internal users read all" ON contract_amendments;
CREATE POLICY "amendments: internal users read own org" ON contract_amendments
  FOR SELECT USING (
    is_internal_user() AND EXISTS (
      SELECT 1 FROM contracts c WHERE c.id = contract_amendments.contract_id AND is_org_member(c.org_id)
    )
  );

DROP POLICY IF EXISTS "amendments: internal users insert" ON contract_amendments;
CREATE POLICY "amendments: internal users insert own org" ON contract_amendments
  FOR INSERT WITH CHECK (
    is_internal_user() AND created_by = auth.uid() AND EXISTS (
      SELECT 1 FROM contracts c WHERE c.id = contract_amendments.contract_id AND is_org_member(c.org_id)
    )
  );

DROP POLICY IF EXISTS "amendments: internal users update" ON contract_amendments;
CREATE POLICY "amendments: internal users update own org" ON contract_amendments
  FOR UPDATE USING (
    is_internal_user() AND EXISTS (
      SELECT 1 FROM contracts c WHERE c.id = contract_amendments.contract_id AND is_org_member(c.org_id)
    )
  );

DROP POLICY IF EXISTS "contract_amendments: internal users delete" ON contract_amendments;
CREATE POLICY "contract_amendments: internal users delete own org" ON contract_amendments
  FOR DELETE USING (
    is_internal_user() AND EXISTS (
      SELECT 1 FROM contracts c WHERE c.id = contract_amendments.contract_id AND is_org_member(c.org_id)
    )
  );

-- ─── approval_requests ──────────────────────────────────────────────────────
DROP POLICY IF EXISTS "approval_requests: internal users read all, requester reads own" ON approval_requests;
CREATE POLICY "approval_requests: internal users read own org, requester reads own" ON approval_requests
  FOR SELECT USING ((is_internal_user() AND is_org_member(org_id)) OR requested_by = auth.uid());

DROP POLICY IF EXISTS "approval_requests: authenticated users insert" ON approval_requests;
CREATE POLICY "approval_requests: authenticated users insert own org" ON approval_requests
  FOR INSERT WITH CHECK (requested_by = auth.uid() AND is_org_member(org_id));

DROP POLICY IF EXISTS "approval_requests: internal users update" ON approval_requests;
CREATE POLICY "approval_requests: internal users update own org" ON approval_requests
  FOR UPDATE USING (is_internal_user() AND is_org_member(org_id));

DROP POLICY IF EXISTS "approval_requests: internal users delete" ON approval_requests;
CREATE POLICY "approval_requests: internal users delete own org" ON approval_requests
  FOR DELETE USING (is_internal_user() AND is_org_member(org_id));

-- ─── audit_log ──────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "audit_log: internal users read all" ON audit_log;
CREATE POLICY "audit_log: internal users read own org" ON audit_log
  FOR SELECT USING (is_internal_user() AND is_org_member(org_id));
