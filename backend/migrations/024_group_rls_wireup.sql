-- Phase 4 (group access wiring): every RLS policy that currently gates
-- access via is_org_member(org_id) also grants it via has_org_access(org_id)
-- (= is_org_member(org_id) OR is_group_admin_for_org(org_id), from
-- 015_group_functions.sql) -- so a group_admin whose group tree contains an
-- org gets the exact same CRUD parity a direct member has, per the
-- confirmed "standing delegated admin, not read-only" decision.
--
-- Every policy below is a straight DROP+CREATE reproducing the original
-- policy from 008_org_scoped_rls.sql (parent tables) / 009_fix_rls_recursion
-- .sql (child tables, via org_id_for_* helpers) verbatim except for that one
-- substitution -- same name, same command, same every-other-clause. Diff
-- each block against those two files to confirm nothing else changed.
--
-- organization_vendors has no committed CREATE POLICY anywhere (same
-- schema-drift gap as the table itself), so its policies can't be
-- reproduced by name here. Handled instead by a DO block at the end that
-- finds any live policy referencing is_org_member and substitutes
-- has_org_access in place, leaving every other clause (and any unrelated,
-- e.g. vendor-facing, policy) untouched.

-- ─── engagements ────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "engagements: internal users read own org" ON engagements;
CREATE POLICY "engagements: internal users read own org" ON engagements
  FOR SELECT USING (is_internal_user() AND has_org_access(org_id));

DROP POLICY IF EXISTS "engagements: internal users insert own org" ON engagements;
CREATE POLICY "engagements: internal users insert own org" ON engagements
  FOR INSERT WITH CHECK (is_internal_user() AND has_org_access(org_id) AND created_by = auth.uid());

DROP POLICY IF EXISTS "engagements: internal users update own org" ON engagements;
CREATE POLICY "engagements: internal users update own org" ON engagements
  FOR UPDATE USING (is_internal_user() AND has_org_access(org_id));

DROP POLICY IF EXISTS "engagements: internal users delete own org" ON engagements;
CREATE POLICY "engagements: internal users delete own org" ON engagements
  FOR DELETE USING (is_internal_user() AND has_org_access(org_id));

-- ─── engagement_vendors ─────────────────────────────────────────────────────
DROP POLICY IF EXISTS "ev: internal users read own org" ON engagement_vendors;
CREATE POLICY "ev: internal users read own org" ON engagement_vendors
  FOR SELECT USING (is_internal_user() AND has_org_access(org_id_for_engagement(engagement_id)));

DROP POLICY IF EXISTS "ev: internal users insert own org" ON engagement_vendors;
CREATE POLICY "ev: internal users insert own org" ON engagement_vendors
  FOR INSERT WITH CHECK (is_internal_user() AND has_org_access(org_id_for_engagement(engagement_id)));

DROP POLICY IF EXISTS "ev: internal users delete own org" ON engagement_vendors;
CREATE POLICY "ev: internal users delete own org" ON engagement_vendors
  FOR DELETE USING (is_internal_user() AND has_org_access(org_id_for_engagement(engagement_id)));

-- ─── engagement_line_items ──────────────────────────────────────────────────
DROP POLICY IF EXISTS "eli: internal users select own org" ON engagement_line_items;
CREATE POLICY "eli: internal users select own org" ON engagement_line_items
  FOR SELECT USING (is_internal_user() AND has_org_access(org_id_for_engagement(engagement_id)));

DROP POLICY IF EXISTS "eli: internal users insert own org" ON engagement_line_items;
CREATE POLICY "eli: internal users insert own org" ON engagement_line_items
  FOR INSERT WITH CHECK (is_internal_user() AND has_org_access(org_id_for_engagement(engagement_id)));

DROP POLICY IF EXISTS "eli: internal users update own org" ON engagement_line_items;
CREATE POLICY "eli: internal users update own org" ON engagement_line_items
  FOR UPDATE USING (is_internal_user() AND has_org_access(org_id_for_engagement(engagement_id)))
  WITH CHECK (is_internal_user() AND has_org_access(org_id_for_engagement(engagement_id)));

DROP POLICY IF EXISTS "eli: internal users delete own org" ON engagement_line_items;
CREATE POLICY "eli: internal users delete own org" ON engagement_line_items
  FOR DELETE USING (is_internal_user() AND has_org_access(org_id_for_engagement(engagement_id)));

-- ─── rfqs ───────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "rfqs: internal users read own org" ON rfqs;
CREATE POLICY "rfqs: internal users read own org" ON rfqs
  FOR SELECT USING (is_internal_user() AND has_org_access(org_id));

DROP POLICY IF EXISTS "rfqs: internal users insert own org" ON rfqs;
CREATE POLICY "rfqs: internal users insert own org" ON rfqs
  FOR INSERT WITH CHECK (is_internal_user() AND has_org_access(org_id));

DROP POLICY IF EXISTS "rfqs: internal users update own org" ON rfqs;
CREATE POLICY "rfqs: internal users update own org" ON rfqs
  FOR UPDATE USING (is_internal_user() AND has_org_access(org_id));

-- ─── quotations ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "quotations: internal users read own org" ON quotations;
CREATE POLICY "quotations: internal users read own org" ON quotations
  FOR SELECT USING (is_internal_user() AND has_org_access(org_id));

DROP POLICY IF EXISTS "quotations: internal users update own org" ON quotations;
CREATE POLICY "quotations: internal users update own org" ON quotations
  FOR UPDATE USING (is_internal_user() AND has_org_access(org_id));

-- ─── quotation_line_items ───────────────────────────────────────────────────
DROP POLICY IF EXISTS "qli: internal users read own org" ON quotation_line_items;
CREATE POLICY "qli: internal users read own org" ON quotation_line_items
  FOR SELECT USING (is_internal_user() AND has_org_access(org_id_for_quotation(quotation_id)));

DROP POLICY IF EXISTS "qli: internal users delete own org" ON quotation_line_items;
CREATE POLICY "qli: internal users delete own org" ON quotation_line_items
  FOR DELETE USING (is_internal_user() AND has_org_access(org_id_for_quotation(quotation_id)));

-- ─── purchase_orders ────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "po: internal users read own org" ON purchase_orders;
CREATE POLICY "po: internal users read own org" ON purchase_orders
  FOR SELECT USING (is_internal_user() AND has_org_access(org_id));

DROP POLICY IF EXISTS "po: procurement+ insert own org" ON purchase_orders;
CREATE POLICY "po: procurement+ insert own org" ON purchase_orders
  FOR INSERT WITH CHECK (is_internal_user() AND has_org_access(org_id) AND created_by = auth.uid());

DROP POLICY IF EXISTS "po: procurement+ update own org" ON purchase_orders;
CREATE POLICY "po: procurement+ update own org" ON purchase_orders
  FOR UPDATE USING (is_internal_user() AND has_org_access(org_id));

DROP POLICY IF EXISTS "purchase_orders: internal users delete own org" ON purchase_orders;
CREATE POLICY "purchase_orders: internal users delete own org" ON purchase_orders
  FOR DELETE USING (is_internal_user() AND has_org_access(org_id));

-- ─── po_line_items ──────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "po_line_items: internal users read own org" ON po_line_items;
CREATE POLICY "po_line_items: internal users read own org" ON po_line_items
  FOR SELECT USING (is_internal_user() AND has_org_access(org_id_for_purchase_order(po_id)));

DROP POLICY IF EXISTS "po_line_items: internal users insert own org" ON po_line_items;
CREATE POLICY "po_line_items: internal users insert own org" ON po_line_items
  FOR INSERT WITH CHECK (is_internal_user() AND has_org_access(org_id_for_purchase_order(po_id)));

DROP POLICY IF EXISTS "po_line_items: internal users update own org" ON po_line_items;
CREATE POLICY "po_line_items: internal users update own org" ON po_line_items
  FOR UPDATE USING (is_internal_user() AND has_org_access(org_id_for_purchase_order(po_id)));

DROP POLICY IF EXISTS "po_line_items: internal users delete own org" ON po_line_items;
CREATE POLICY "po_line_items: internal users delete own org" ON po_line_items
  FOR DELETE USING (is_internal_user() AND has_org_access(org_id_for_purchase_order(po_id)));

-- ─── grns ───────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "grns: internal users read own org" ON grns;
CREATE POLICY "grns: internal users read own org" ON grns
  FOR SELECT USING (is_internal_user() AND has_org_access(org_id));

DROP POLICY IF EXISTS "grns: internal users insert own org" ON grns;
CREATE POLICY "grns: internal users insert own org" ON grns
  FOR INSERT WITH CHECK (is_internal_user() AND has_org_access(org_id) AND created_by = auth.uid());

DROP POLICY IF EXISTS "grns: internal users update own org" ON grns;
CREATE POLICY "grns: internal users update own org" ON grns
  FOR UPDATE USING (is_internal_user() AND has_org_access(org_id));

DROP POLICY IF EXISTS "grns: internal users delete own org" ON grns;
CREATE POLICY "grns: internal users delete own org" ON grns
  FOR DELETE USING (is_internal_user() AND has_org_access(org_id));

-- ─── grn_line_items ─────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "grn_line_items: internal users read own org" ON grn_line_items;
CREATE POLICY "grn_line_items: internal users read own org" ON grn_line_items
  FOR SELECT USING (is_internal_user() AND has_org_access(org_id_for_grn(grn_id)));

DROP POLICY IF EXISTS "grn_line_items: internal users insert own org" ON grn_line_items;
CREATE POLICY "grn_line_items: internal users insert own org" ON grn_line_items
  FOR INSERT WITH CHECK (is_internal_user() AND has_org_access(org_id_for_grn(grn_id)));

DROP POLICY IF EXISTS "grn_line_items: internal users update own org" ON grn_line_items;
CREATE POLICY "grn_line_items: internal users update own org" ON grn_line_items
  FOR UPDATE USING (is_internal_user() AND has_org_access(org_id_for_grn(grn_id)));

DROP POLICY IF EXISTS "grn_line_items: internal users delete own org" ON grn_line_items;
CREATE POLICY "grn_line_items: internal users delete own org" ON grn_line_items
  FOR DELETE USING (is_internal_user() AND has_org_access(org_id_for_grn(grn_id)));

-- ─── invoices ───────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "invoices: internal users read own org" ON invoices;
CREATE POLICY "invoices: internal users read own org" ON invoices
  FOR SELECT USING (is_internal_user() AND has_org_access(org_id));

DROP POLICY IF EXISTS "invoices: internal users update own org" ON invoices;
CREATE POLICY "invoices: internal users update own org" ON invoices
  FOR UPDATE USING (is_internal_user() AND has_org_access(org_id));

DROP POLICY IF EXISTS "invoices: internal users delete own org" ON invoices;
CREATE POLICY "invoices: internal users delete own org" ON invoices
  FOR DELETE USING (is_internal_user() AND has_org_access(org_id));

-- ─── contracts ──────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "contracts: internal users read own org" ON contracts;
CREATE POLICY "contracts: internal users read own org" ON contracts
  FOR SELECT USING (is_internal_user() AND has_org_access(org_id));

DROP POLICY IF EXISTS "contracts: internal users insert own org" ON contracts;
CREATE POLICY "contracts: internal users insert own org" ON contracts
  FOR INSERT WITH CHECK (is_internal_user() AND has_org_access(org_id) AND created_by = auth.uid());

DROP POLICY IF EXISTS "contracts: internal users update own org" ON contracts;
CREATE POLICY "contracts: internal users update own org" ON contracts
  FOR UPDATE USING (is_internal_user() AND has_org_access(org_id));

DROP POLICY IF EXISTS "contracts: internal users delete own org" ON contracts;
CREATE POLICY "contracts: internal users delete own org" ON contracts
  FOR DELETE USING (is_internal_user() AND has_org_access(org_id));

-- ─── contract_amendments ────────────────────────────────────────────────────
DROP POLICY IF EXISTS "amendments: internal users read own org" ON contract_amendments;
CREATE POLICY "amendments: internal users read own org" ON contract_amendments
  FOR SELECT USING (is_internal_user() AND has_org_access(org_id_for_contract(contract_id)));

DROP POLICY IF EXISTS "amendments: internal users insert own org" ON contract_amendments;
CREATE POLICY "amendments: internal users insert own org" ON contract_amendments
  FOR INSERT WITH CHECK (is_internal_user() AND created_by = auth.uid() AND has_org_access(org_id_for_contract(contract_id)));

DROP POLICY IF EXISTS "amendments: internal users update own org" ON contract_amendments;
CREATE POLICY "amendments: internal users update own org" ON contract_amendments
  FOR UPDATE USING (is_internal_user() AND has_org_access(org_id_for_contract(contract_id)));

DROP POLICY IF EXISTS "contract_amendments: internal users delete own org" ON contract_amendments;
CREATE POLICY "contract_amendments: internal users delete own org" ON contract_amendments
  FOR DELETE USING (is_internal_user() AND has_org_access(org_id_for_contract(contract_id)));

-- ─── approval_requests ──────────────────────────────────────────────────────
DROP POLICY IF EXISTS "approval_requests: internal users read own org, requester reads own" ON approval_requests;
CREATE POLICY "approval_requests: internal users read own org, requester reads own" ON approval_requests
  FOR SELECT USING ((is_internal_user() AND has_org_access(org_id)) OR requested_by = auth.uid());

DROP POLICY IF EXISTS "approval_requests: authenticated users insert own org" ON approval_requests;
CREATE POLICY "approval_requests: authenticated users insert own org" ON approval_requests
  FOR INSERT WITH CHECK (requested_by = auth.uid() AND has_org_access(org_id));

DROP POLICY IF EXISTS "approval_requests: internal users update own org" ON approval_requests;
CREATE POLICY "approval_requests: internal users update own org" ON approval_requests
  FOR UPDATE USING (is_internal_user() AND has_org_access(org_id));

DROP POLICY IF EXISTS "approval_requests: internal users delete own org" ON approval_requests;
CREATE POLICY "approval_requests: internal users delete own org" ON approval_requests
  FOR DELETE USING (is_internal_user() AND has_org_access(org_id));

-- ─── audit_log ──────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "audit_log: internal users read own org" ON audit_log;
CREATE POLICY "audit_log: internal users read own org" ON audit_log
  FOR SELECT USING (is_internal_user() AND has_org_access(org_id));

-- ─── organization_vendors ───────────────────────────────────────────────────
-- No committed CREATE POLICY exists for this table anywhere in the repo, so
-- names/shapes can't be reproduced above. Instead: find any live policy
-- whose USING/WITH CHECK expression references is_org_member and rewrite
-- just that function name to has_org_access, leaving every other clause (and
-- any policy that doesn't mention is_org_member at all -- e.g. a
-- vendor-facing one, if it exists) completely untouched.
DO $$
DECLARE
  pol record;
BEGIN
  FOR pol IN
    SELECT policyname, qual, with_check
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'organization_vendors'
      AND (qual LIKE '%is_org_member%' OR with_check LIKE '%is_org_member%')
  LOOP
    IF pol.qual IS NOT NULL AND pol.qual LIKE '%is_org_member%' THEN
      EXECUTE format('ALTER POLICY %I ON organization_vendors USING (%s)',
        pol.policyname, replace(pol.qual, 'is_org_member', 'has_org_access'));
    END IF;
    IF pol.with_check IS NOT NULL AND pol.with_check LIKE '%is_org_member%' THEN
      EXECUTE format('ALTER POLICY %I ON organization_vendors WITH CHECK (%s)',
        pol.policyname, replace(pol.with_check, 'is_org_member', 'has_org_access'));
    END IF;
    RAISE NOTICE 'organization_vendors: rewrote policy % to use has_org_access', pol.policyname;
  END LOOP;
END $$;
