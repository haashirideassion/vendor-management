-- Fixes "infinite recursion detected in policy for relation ..." (42P17)
-- introduced by migration 008.
--
-- Root cause: the new child-table policies (engagement_vendors,
-- engagement_line_items, po_line_items, grn_line_items,
-- quotation_line_items, contract_amendments) query their parent table
-- directly, e.g. `EXISTS (SELECT 1 FROM engagements e WHERE ...)`. But the
-- pre-existing "vendor reads own" policy on engagements queries BACK into
-- engagement_vendors -- a cycle. is_org_member()/is_internal_user() avoid
-- this because they're SECURITY DEFINER functions owned by a superuser role,
-- so the tables they touch internally bypass RLS entirely (no policy
-- re-evaluation, hence no recursion). Plain EXISTS subqueries against a
-- policy-protected table don't get that protection.
--
-- Fix: add small SECURITY DEFINER helper functions that look up a child
-- row's parent org_id, then use those in the child policies instead of a
-- raw subquery against the (RLS-protected) parent table.

CREATE OR REPLACE FUNCTION org_id_for_engagement(p_engagement_id uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT org_id FROM engagements WHERE id = p_engagement_id;
$$;

CREATE OR REPLACE FUNCTION org_id_for_purchase_order(p_po_id uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT org_id FROM purchase_orders WHERE id = p_po_id;
$$;

CREATE OR REPLACE FUNCTION org_id_for_grn(p_grn_id uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT org_id FROM grns WHERE id = p_grn_id;
$$;

CREATE OR REPLACE FUNCTION org_id_for_quotation(p_quotation_id uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT org_id FROM quotations WHERE id = p_quotation_id;
$$;

CREATE OR REPLACE FUNCTION org_id_for_contract(p_contract_id uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT org_id FROM contracts WHERE id = p_contract_id;
$$;

-- ─── engagement_vendors ─────────────────────────────────────────────────────
DROP POLICY IF EXISTS "ev: internal users read own org" ON engagement_vendors;
CREATE POLICY "ev: internal users read own org" ON engagement_vendors
  FOR SELECT USING (is_internal_user() AND is_org_member(org_id_for_engagement(engagement_id)));

DROP POLICY IF EXISTS "ev: internal users insert own org" ON engagement_vendors;
CREATE POLICY "ev: internal users insert own org" ON engagement_vendors
  FOR INSERT WITH CHECK (is_internal_user() AND is_org_member(org_id_for_engagement(engagement_id)));

DROP POLICY IF EXISTS "ev: internal users delete own org" ON engagement_vendors;
CREATE POLICY "ev: internal users delete own org" ON engagement_vendors
  FOR DELETE USING (is_internal_user() AND is_org_member(org_id_for_engagement(engagement_id)));

-- ─── engagement_line_items ──────────────────────────────────────────────────
DROP POLICY IF EXISTS "eli: internal users select own org" ON engagement_line_items;
CREATE POLICY "eli: internal users select own org" ON engagement_line_items
  FOR SELECT USING (is_internal_user() AND is_org_member(org_id_for_engagement(engagement_id)));

DROP POLICY IF EXISTS "eli: internal users insert own org" ON engagement_line_items;
CREATE POLICY "eli: internal users insert own org" ON engagement_line_items
  FOR INSERT WITH CHECK (is_internal_user() AND is_org_member(org_id_for_engagement(engagement_id)));

DROP POLICY IF EXISTS "eli: internal users update own org" ON engagement_line_items;
CREATE POLICY "eli: internal users update own org" ON engagement_line_items
  FOR UPDATE USING (is_internal_user() AND is_org_member(org_id_for_engagement(engagement_id)))
  WITH CHECK (is_internal_user() AND is_org_member(org_id_for_engagement(engagement_id)));

DROP POLICY IF EXISTS "eli: internal users delete own org" ON engagement_line_items;
CREATE POLICY "eli: internal users delete own org" ON engagement_line_items
  FOR DELETE USING (is_internal_user() AND is_org_member(org_id_for_engagement(engagement_id)));

-- ─── po_line_items ──────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "po_line_items: internal users read own org" ON po_line_items;
CREATE POLICY "po_line_items: internal users read own org" ON po_line_items
  FOR SELECT USING (is_internal_user() AND is_org_member(org_id_for_purchase_order(po_id)));

DROP POLICY IF EXISTS "po_line_items: internal users insert own org" ON po_line_items;
CREATE POLICY "po_line_items: internal users insert own org" ON po_line_items
  FOR INSERT WITH CHECK (is_internal_user() AND is_org_member(org_id_for_purchase_order(po_id)));

DROP POLICY IF EXISTS "po_line_items: internal users update own org" ON po_line_items;
CREATE POLICY "po_line_items: internal users update own org" ON po_line_items
  FOR UPDATE USING (is_internal_user() AND is_org_member(org_id_for_purchase_order(po_id)));

DROP POLICY IF EXISTS "po_line_items: internal users delete own org" ON po_line_items;
CREATE POLICY "po_line_items: internal users delete own org" ON po_line_items
  FOR DELETE USING (is_internal_user() AND is_org_member(org_id_for_purchase_order(po_id)));

-- ─── grn_line_items ─────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "grn_line_items: internal users read own org" ON grn_line_items;
CREATE POLICY "grn_line_items: internal users read own org" ON grn_line_items
  FOR SELECT USING (is_internal_user() AND is_org_member(org_id_for_grn(grn_id)));

DROP POLICY IF EXISTS "grn_line_items: internal users insert own org" ON grn_line_items;
CREATE POLICY "grn_line_items: internal users insert own org" ON grn_line_items
  FOR INSERT WITH CHECK (is_internal_user() AND is_org_member(org_id_for_grn(grn_id)));

DROP POLICY IF EXISTS "grn_line_items: internal users update own org" ON grn_line_items;
CREATE POLICY "grn_line_items: internal users update own org" ON grn_line_items
  FOR UPDATE USING (is_internal_user() AND is_org_member(org_id_for_grn(grn_id)));

DROP POLICY IF EXISTS "grn_line_items: internal users delete own org" ON grn_line_items;
CREATE POLICY "grn_line_items: internal users delete own org" ON grn_line_items
  FOR DELETE USING (is_internal_user() AND is_org_member(org_id_for_grn(grn_id)));

-- ─── quotation_line_items ───────────────────────────────────────────────────
DROP POLICY IF EXISTS "qli: internal users read own org" ON quotation_line_items;
CREATE POLICY "qli: internal users read own org" ON quotation_line_items
  FOR SELECT USING (is_internal_user() AND is_org_member(org_id_for_quotation(quotation_id)));

DROP POLICY IF EXISTS "qli: internal users delete own org" ON quotation_line_items;
CREATE POLICY "qli: internal users delete own org" ON quotation_line_items
  FOR DELETE USING (is_internal_user() AND is_org_member(org_id_for_quotation(quotation_id)));

-- ─── contract_amendments ────────────────────────────────────────────────────
DROP POLICY IF EXISTS "amendments: internal users read own org" ON contract_amendments;
CREATE POLICY "amendments: internal users read own org" ON contract_amendments
  FOR SELECT USING (is_internal_user() AND is_org_member(org_id_for_contract(contract_id)));

DROP POLICY IF EXISTS "amendments: internal users insert own org" ON contract_amendments;
CREATE POLICY "amendments: internal users insert own org" ON contract_amendments
  FOR INSERT WITH CHECK (is_internal_user() AND created_by = auth.uid() AND is_org_member(org_id_for_contract(contract_id)));

DROP POLICY IF EXISTS "amendments: internal users update own org" ON contract_amendments;
CREATE POLICY "amendments: internal users update own org" ON contract_amendments
  FOR UPDATE USING (is_internal_user() AND is_org_member(org_id_for_contract(contract_id)));

DROP POLICY IF EXISTS "contract_amendments: internal users delete own org" ON contract_amendments;
CREATE POLICY "contract_amendments: internal users delete own org" ON contract_amendments
  FOR DELETE USING (is_internal_user() AND is_org_member(org_id_for_contract(contract_id)));
