-- Full structural rename: Engagement -> Purchase Request.
--
-- "Engagement" was the pre-PO planning/approval entity (RFQs, Quotations,
-- and POs are all created against one). Renamed end-to-end -- tables,
-- columns, functions, triggers, RLS policies, entity_type/notification-type
-- literals, and the RBAC permission catalog -- not just a display label,
-- per the confirmed decision to do the full structural rename rather than a
-- frontend-only cosmetic pass.
--
-- Ordered so nothing references a name before it exists:
--   1-2. per table (approval_requests, attachments, notifications): DROP
--      the old CHECK constraint, THEN run the data UPDATE(s), THEN ADD the
--      new constraint -- NOT update-then-swap as two separate global
--      phases. The old constraint is still active until it's dropped, and
--      it only permits the OLD literal ('engagement'), so an UPDATE that
--      writes the NEW literal ('purchase_request') while that constraint is
--      still in place fails immediately (confirmed live: this exact ordering
--      mistake threw "violates check constraint approval_requests_entity_
--      type_check" on the first statement). Dropping first removes any
--      constraint on the value during the UPDATE; adding back afterward
--      validates against rows that already hold the new value, so both
--      succeed. audit_log has no CHECK constraint at all, so its UPDATE is
--      order-independent.
--   3. table renames, then FK column renames
--   4. index renames
--   5. trigger renames
--   6. function body rewrites + renames (PL/pgSQL and SQL function bodies
--      are opaque text -- NOT auto-rewritten by table/column renames, unlike
--      views/RLS policies, which are stored as OID-bound expression trees)
--   7. RLS policy recreation under new names (drop-and-recreate rather than
--      bare ALTER POLICY RENAME, since several bodies subquery the renamed
--      junction tables directly)
--   8. permissions catalog rows (module_code was already set as data by
--      062_authorization_resolver.sql's one-time UPDATE and needs no
--      change -- resolve_permission_as() itself doesn't hardcode the module
--      name anywhere, just reads whatever's in permissions.module_code) and
--      role description prose
--   9. the break-glass RPC's (011_superadmin.sql) hardcoded entity_type
--      allowlist

-- ─── 1-2. Per-table: drop old constraint, migrate data, add new constraint ─
ALTER TABLE approval_requests DROP CONSTRAINT IF EXISTS approval_requests_entity_type_check;
UPDATE approval_requests SET entity_type = 'purchase_request' WHERE entity_type = 'engagement';
ALTER TABLE approval_requests ADD CONSTRAINT approval_requests_entity_type_check
  CHECK (entity_type IN ('purchase_request', 'purchase_order', 'invoice', 'grn', 'contract', 'category', 'service_confirmation'));

ALTER TABLE attachments DROP CONSTRAINT IF EXISTS chk_entity_type;
UPDATE attachments SET entity_type = 'purchase_request' WHERE entity_type = 'engagement';
ALTER TABLE attachments ADD CONSTRAINT chk_entity_type
  CHECK (entity_type IN ('purchase_request', 'purchase_order', 'grn', 'contract', 'invoice'));

ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
UPDATE notifications SET type = 'purchase_request_pending_approval' WHERE type = 'engagement_pending_approval';
UPDATE notifications SET type = 'purchase_request_decision'         WHERE type = 'engagement_decision';
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN (
    'new_vendor', 'new_invoice', 'new_quotation',
    'grn_pending_approval', 'purchase_request_pending_approval', 'contract_pending_approval', 'category_pending_approval',
    'grn_decision', 'purchase_request_decision', 'contract_decision', 'category_decision',
    'invoice_status_update'
  ));

-- audit_log has no CHECK constraint on entity_type -- plain UPDATE, order-independent.
UPDATE audit_log SET entity_type = 'purchase_request' WHERE entity_type = 'engagement';

-- ─── 3. Table renames, then FK column renames ───────────────────────────────
ALTER TABLE engagements RENAME TO purchase_requests;
ALTER TABLE engagement_line_items RENAME TO purchase_request_line_items;
ALTER TABLE engagement_vendors RENAME TO purchase_request_vendors;

ALTER TABLE purchase_request_line_items RENAME COLUMN engagement_id TO purchase_request_id;
ALTER TABLE purchase_request_vendors    RENAME COLUMN engagement_id TO purchase_request_id;
ALTER TABLE purchase_orders             RENAME COLUMN engagement_id TO purchase_request_id;
ALTER TABLE rfqs                        RENAME COLUMN engagement_id TO purchase_request_id;
ALTER TABLE quotations                  RENAME COLUMN engagement_id TO purchase_request_id;
ALTER TABLE invoices                    RENAME COLUMN engagement_id TO purchase_request_id;

-- ─── 4. Index renames ────────────────────────────────────────────────────────
ALTER INDEX IF EXISTS idx_engagements_vendor     RENAME TO idx_purchase_requests_vendor;
ALTER INDEX IF EXISTS idx_engagements_status     RENAME TO idx_purchase_requests_status;
ALTER INDEX IF EXISTS idx_engagements_created_by RENAME TO idx_purchase_requests_created_by;
ALTER INDEX IF EXISTS idx_eli_engagement         RENAME TO idx_prli_purchase_request;
ALTER INDEX IF EXISTS idx_ev_engagement          RENAME TO idx_prv_purchase_request;
ALTER INDEX IF EXISTS idx_ev_vendor              RENAME TO idx_prv_vendor;
ALTER INDEX IF EXISTS idx_po_engagement          RENAME TO idx_po_purchase_request;
ALTER INDEX IF EXISTS idx_rfq_engagement         RENAME TO idx_rfq_purchase_request;
ALTER INDEX IF EXISTS idx_quot_engagement        RENAME TO idx_quot_purchase_request;
ALTER INDEX IF EXISTS idx_invoices_engagement    RENAME TO idx_invoices_purchase_request;

-- ─── 5. Trigger renames ──────────────────────────────────────────────────────
-- Only the updated_at bookkeeping trigger survives -- engagement_audit (and
-- its log_engagement_status_change() function) was permanently dropped by
-- backend/migrations/026_remove_legacy_status_triggers.sql (its
-- performed_by was always NULL under Express's service-role key; audit
-- writes moved to the shared writeAudit() helper called explicitly from
-- the route instead). Neither exists in the live DB, so there is nothing
-- to rename or recreate for it here.
ALTER TRIGGER engagements_set_updated_at ON purchase_requests RENAME TO purchase_requests_set_updated_at;

-- ─── 6. Function body rewrites + renames ────────────────────────────────────
CREATE OR REPLACE FUNCTION org_id_for_engagement(p_engagement_id uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT org_id FROM purchase_requests WHERE id = p_engagement_id;
$$;
ALTER FUNCTION org_id_for_engagement(uuid) RENAME TO org_id_for_purchase_request;

CREATE OR REPLACE FUNCTION create_engagement_full(
  p_title           text,
  p_description     text,
  p_category_id     uuid,
  p_estimated_value numeric,
  p_currency        text,
  p_start_date      date,
  p_end_date        date,
  p_notes           text,
  p_created_by      uuid,
  p_vendor_ids      jsonb,
  p_line_items      jsonb,
  p_org_id          uuid,
  p_response_deadline timestamptz DEFAULT NULL,
  p_exchange_rate_to_base numeric DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE
  v_pr_id uuid;
BEGIN
  INSERT INTO purchase_requests (
    title, description, category_id, estimated_value,
    currency, start_date, end_date, notes, created_by, status, org_id,
    exchange_rate_to_base
  ) VALUES (
    p_title, p_description, p_category_id, p_estimated_value,
    p_currency, p_start_date, p_end_date, p_notes, p_created_by, 'draft', p_org_id,
    p_exchange_rate_to_base
  )
  RETURNING id INTO v_pr_id;

  IF p_line_items IS NOT NULL AND jsonb_array_length(p_line_items) > 0 THEN
    INSERT INTO purchase_request_line_items (purchase_request_id, description, quantity, unit_price)
    SELECT
      v_pr_id,
      (item->>'description')::text,
      (item->>'quantity')::numeric,
      (item->>'unit_price')::numeric
    FROM jsonb_array_elements(p_line_items) AS item;
  END IF;

  IF p_vendor_ids IS NOT NULL AND jsonb_array_length(p_vendor_ids) > 0 THEN
    INSERT INTO purchase_request_vendors (purchase_request_id, vendor_id)
    SELECT v_pr_id, (elem::text)::uuid
    FROM jsonb_array_elements_text(p_vendor_ids) AS elem;

    INSERT INTO rfqs (purchase_request_id, vendor_id, status, org_id, response_deadline)
    SELECT v_pr_id, (elem::text)::uuid, 'pending', p_org_id, p_response_deadline
    FROM jsonb_array_elements_text(p_vendor_ids) AS elem
    ON CONFLICT (purchase_request_id, vendor_id) DO UPDATE SET status = 'pending', response_deadline = p_response_deadline;
  END IF;

  RETURN v_pr_id;
END;
$$;
ALTER FUNCTION create_engagement_full(
  text, text, uuid, numeric, text, date, date, text, uuid, jsonb, jsonb, uuid, timestamptz, numeric
) RENAME TO create_purchase_request_full;

-- ─── 7. RLS policy recreation under new names ───────────────────────────────
-- purchase_requests (formerly engagements)
DROP POLICY IF EXISTS "engagements: internal users read own org" ON purchase_requests;
CREATE POLICY "purchase_requests: internal users read own org" ON purchase_requests
  FOR SELECT USING (is_internal_user() AND has_org_access(org_id));

DROP POLICY IF EXISTS "engagements: internal users insert own org" ON purchase_requests;
CREATE POLICY "purchase_requests: internal users insert own org" ON purchase_requests
  FOR INSERT WITH CHECK (is_internal_user() AND has_org_access(org_id) AND created_by = auth.uid());

DROP POLICY IF EXISTS "engagements: internal users update own org" ON purchase_requests;
CREATE POLICY "purchase_requests: internal users update own org" ON purchase_requests
  FOR UPDATE USING (is_internal_user() AND has_org_access(org_id));

DROP POLICY IF EXISTS "engagements: internal users delete own org" ON purchase_requests;
CREATE POLICY "purchase_requests: internal users delete own org" ON purchase_requests
  FOR DELETE USING (is_internal_user() AND has_org_access(org_id));

DROP POLICY IF EXISTS "engagements: vendor reads own" ON purchase_requests;
CREATE POLICY "purchase_requests: vendor reads own" ON purchase_requests
  FOR SELECT USING (
    vendor_id IN (SELECT id FROM vendors WHERE profile_id = auth.uid())
    OR id IN (
      SELECT purchase_request_id FROM purchase_request_vendors
      WHERE vendor_id IN (SELECT id FROM vendors WHERE profile_id = auth.uid())
    )
  );

-- purchase_request_vendors (formerly engagement_vendors)
DROP POLICY IF EXISTS "ev: internal users read own org" ON purchase_request_vendors;
CREATE POLICY "prv: internal users read own org" ON purchase_request_vendors
  FOR SELECT USING (is_internal_user() AND has_org_access(org_id_for_purchase_request(purchase_request_id)));

DROP POLICY IF EXISTS "ev: internal users insert own org" ON purchase_request_vendors;
CREATE POLICY "prv: internal users insert own org" ON purchase_request_vendors
  FOR INSERT WITH CHECK (is_internal_user() AND has_org_access(org_id_for_purchase_request(purchase_request_id)));

DROP POLICY IF EXISTS "ev: internal users delete own org" ON purchase_request_vendors;
CREATE POLICY "prv: internal users delete own org" ON purchase_request_vendors
  FOR DELETE USING (is_internal_user() AND has_org_access(org_id_for_purchase_request(purchase_request_id)));

DROP POLICY IF EXISTS "ev: vendor reads own" ON purchase_request_vendors;
CREATE POLICY "prv: vendor reads own" ON purchase_request_vendors
  FOR SELECT USING (vendor_id IN (SELECT id FROM vendors WHERE profile_id = auth.uid()));

-- purchase_request_line_items (formerly engagement_line_items)
DROP POLICY IF EXISTS "eli: internal users select own org" ON purchase_request_line_items;
CREATE POLICY "prli: internal users select own org" ON purchase_request_line_items
  FOR SELECT USING (is_internal_user() AND has_org_access(org_id_for_purchase_request(purchase_request_id)));

DROP POLICY IF EXISTS "eli: internal users insert own org" ON purchase_request_line_items;
CREATE POLICY "prli: internal users insert own org" ON purchase_request_line_items
  FOR INSERT WITH CHECK (is_internal_user() AND has_org_access(org_id_for_purchase_request(purchase_request_id)));

DROP POLICY IF EXISTS "eli: internal users update own org" ON purchase_request_line_items;
CREATE POLICY "prli: internal users update own org" ON purchase_request_line_items
  FOR UPDATE USING (is_internal_user() AND has_org_access(org_id_for_purchase_request(purchase_request_id)))
  WITH CHECK (is_internal_user() AND has_org_access(org_id_for_purchase_request(purchase_request_id)));

DROP POLICY IF EXISTS "eli: internal users delete own org" ON purchase_request_line_items;
CREATE POLICY "prli: internal users delete own org" ON purchase_request_line_items
  FOR DELETE USING (is_internal_user() AND has_org_access(org_id_for_purchase_request(purchase_request_id)));

DROP POLICY IF EXISTS "eli: vendor reads invited" ON purchase_request_line_items;
CREATE POLICY "prli: vendor reads invited" ON purchase_request_line_items
  FOR SELECT USING (
    purchase_request_id IN (
      SELECT purchase_request_id FROM rfqs
      WHERE vendor_id IN (SELECT id FROM vendors WHERE profile_id = auth.uid())
    )
  );

-- attachments: this policy's entity_type = 'engagement' comparison is a
-- DATA literal, not a schema reference -- unlike the engagement_vendors
-- table/column refs below it (auto-repointed by Postgres's OID-based
-- dependency tracking, same as a view), the literal does NOT get rewritten
-- by the rename and would silently match zero rows forever once step 1's
-- UPDATE has moved every attachments.entity_type value off 'engagement'.
DROP POLICY IF EXISTS "Vendors read engagement attachments" ON attachments;
CREATE POLICY "Vendors read purchase request attachments"
  ON attachments FOR SELECT
  USING (
    entity_type = 'purchase_request' AND NOT is_deleted
    AND EXISTS (
      SELECT 1 FROM purchase_request_vendors prv JOIN vendors v ON v.id = prv.vendor_id
      WHERE prv.purchase_request_id = entity_id AND v.profile_id = auth.uid()
    )
  );

-- ─── 8. Permission catalog rows ──────────────────────────────────────────────
-- module_code (permissions.module_code) was already set as data by
-- 062_authorization_resolver.sql's one-time UPDATE keyed off the OLD module
-- value 'engagements' -- that UPDATE has already run and stored
-- module_code='procurement' on these two rows, so renaming module/key here
-- doesn't need to touch module_code or resolve_permission_as() at all (it
-- only ever reads whatever's already in permissions.module_code).
UPDATE permissions SET key = 'purchase_requests.draft', module = 'purchase_requests', description = 'Draft a new purchase request'
  WHERE key = 'engagements.draft';
UPDATE permissions SET key = 'purchase_requests.finalize', module = 'purchase_requests', description = 'Finalize/approve a purchase request'
  WHERE key = 'engagements.finalize';

-- Role description prose (018_rbac_seed.sql) also mentions "engagements" --
-- cosmetic text shown in role-management UI, updated here for consistency.
UPDATE roles SET description = 'Finalize purchase requests, compare/select quotations, create and approve POs up to threshold, first-level invoice approval, draft contracts'
  WHERE scope = 'org' AND name = 'Manager';
UPDATE roles SET description = 'Draft purchase requests, record GRNs, data-entry on invoices'
  WHERE scope = 'org' AND name = 'Associate';
UPDATE roles SET description = 'Delivery confirmations, drafting quotation line items, limited to assigned purchase requests'
  WHERE scope = 'vendor' AND name = 'Associate';

-- ─── 9. Break-glass RPC allowlist (011_superadmin.sql) ──────────────────────
-- support_view_entity() builds its target table name dynamically as
-- p_entity_type || 's' -- 'purchase_request' || 's' = 'purchase_requests',
-- so it naturally matches the renamed table once the allowlist itself is
-- updated. Not just cosmetic: this is a live server-side validator that
-- would otherwise keep accepting the stale 'engagement' value forever and
-- rejecting the correct 'purchase_request' one, once the frontend/backend
-- ALLOWED arrays (superadmin.ts, useBreakGlass.ts) send the new value.
CREATE OR REPLACE FUNCTION public.support_view_entity(
  p_entity_type text,
  p_entity_id   uuid,
  p_reason      text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_org_id uuid;
BEGIN
  IF NOT is_platform_admin() THEN
    RAISE EXCEPTION 'Not a platform admin';
  END IF;
  IF p_reason IS NULL OR length(trim(p_reason)) = 0 THEN
    RAISE EXCEPTION 'A reason is required for break-glass access';
  END IF;
  IF p_entity_type NOT IN ('purchase_request', 'purchase_order', 'grn', 'invoice', 'contract', 'quotation') THEN
    RAISE EXCEPTION 'Unsupported entity_type for break-glass access: %', p_entity_type;
  END IF;

  EXECUTE format('SELECT org_id FROM %I WHERE id = $1', p_entity_type || 's')
    INTO v_org_id USING p_entity_id;

  INSERT INTO audit_log (entity_type, entity_id, action, new_value, performed_by, org_id)
  VALUES (
    p_entity_type,
    p_entity_id,
    'superadmin_break_glass_view',
    jsonb_build_object('reason', p_reason),
    auth.uid(),
    v_org_id
  );
END;
$$;
