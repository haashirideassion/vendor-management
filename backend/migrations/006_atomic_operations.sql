-- Atomic stored procedures for multi-step DB operations.
-- Each function runs in an implicit PL/pgSQL transaction — any error rolls back all statements.

-- ─── Vendor: create with categories ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION create_vendor_with_categories(
  p_profile_id        uuid,
  p_company_name      text,
  p_contact_name      text,
  p_contact_email     text,
  p_contact_phone     text,
  p_tax_gst_number    text,
  p_bank_name         text,
  p_bank_account_number text,
  p_bank_routing_number text,
  p_category_ids      uuid[]
) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE
  v_vendor_id uuid;
BEGIN
  INSERT INTO vendors (
    profile_id, company_name, contact_name, contact_email,
    contact_phone, tax_gst_number, bank_name, bank_account_number,
    bank_routing_number, status
  ) VALUES (
    p_profile_id, p_company_name, p_contact_name, p_contact_email,
    p_contact_phone, p_tax_gst_number, p_bank_name, p_bank_account_number,
    p_bank_routing_number, 'pending_review'
  )
  RETURNING id INTO v_vendor_id;

  IF p_category_ids IS NOT NULL AND array_length(p_category_ids, 1) > 0 THEN
    INSERT INTO vendor_categories (vendor_id, category_id)
    SELECT v_vendor_id, unnest(p_category_ids);
  END IF;

  RETURN v_vendor_id;
END;
$$;

-- ─── Vendor: update categories atomically ────────────────────────────────────
CREATE OR REPLACE FUNCTION update_vendor_categories(
  p_vendor_id    uuid,
  p_category_ids uuid[]
) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  DELETE FROM vendor_categories WHERE vendor_id = p_vendor_id;

  IF p_category_ids IS NOT NULL AND array_length(p_category_ids, 1) > 0 THEN
    INSERT INTO vendor_categories (vendor_id, category_id)
    SELECT p_vendor_id, unnest(p_category_ids);
  END IF;
END;
$$;

-- ─── Purchase Order: create with line items ───────────────────────────────────
CREATE OR REPLACE FUNCTION create_po_with_line_items(
  p_engagement_id          uuid,
  p_vendor_id              uuid,
  p_total_value            numeric,
  p_currency               text,
  p_issue_date             date,
  p_expected_delivery_date date,
  p_delivery_address       text,
  p_payment_terms          text,
  p_notes                  text,
  p_created_by             uuid,
  p_line_items             jsonb
) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE
  v_po_id uuid;
BEGIN
  INSERT INTO purchase_orders (
    engagement_id, vendor_id, total_value, currency, issue_date,
    expected_delivery_date, delivery_address, payment_terms, notes,
    created_by, status
  ) VALUES (
    p_engagement_id, p_vendor_id, p_total_value, p_currency, p_issue_date,
    p_expected_delivery_date, p_delivery_address, p_payment_terms, p_notes,
    p_created_by, 'draft'
  )
  RETURNING id INTO v_po_id;

  IF p_line_items IS NOT NULL AND jsonb_array_length(p_line_items) > 0 THEN
    INSERT INTO po_line_items (po_id, description, quantity, unit_price, total_price)
    SELECT
      v_po_id,
      (item->>'description')::text,
      (item->>'quantity')::numeric,
      (item->>'unit_price')::numeric,
      (item->>'total_price')::numeric
    FROM jsonb_array_elements(p_line_items) AS item;
  END IF;

  RETURN v_po_id;
END;
$$;

-- ─── Quotation: create with line items ───────────────────────────────────────
CREATE OR REPLACE FUNCTION create_quotation_with_line_items(
  p_rfq_id        uuid,
  p_engagement_id uuid,
  p_vendor_id     uuid,
  p_notes         text,
  p_line_items    jsonb
) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE
  v_quot_id uuid;
BEGIN
  INSERT INTO quotations (rfq_id, engagement_id, vendor_id, notes, status)
  VALUES (p_rfq_id, p_engagement_id, p_vendor_id, p_notes, 'draft')
  RETURNING id INTO v_quot_id;

  IF p_line_items IS NOT NULL AND jsonb_array_length(p_line_items) > 0 THEN
    INSERT INTO quotation_line_items (quotation_id, description, quantity, unit_price, total_price)
    SELECT
      v_quot_id,
      (item->>'description')::text,
      (item->>'quantity')::numeric,
      (item->>'unit_price')::numeric,
      (item->>'total_price')::numeric
    FROM jsonb_array_elements(p_line_items) AS item;
  END IF;

  RETURN v_quot_id;
END;
$$;

-- ─── GRN: create with line items ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION create_grn_with_line_items(
  p_po_id         uuid,
  p_vendor_id     uuid,
  p_received_date date,
  p_notes         text,
  p_created_by    uuid,
  p_verified_by   uuid,
  p_line_items    jsonb
) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE
  v_grn_id uuid;
BEGIN
  INSERT INTO grns (
    po_id, vendor_id, received_date, notes, created_by,
    status, verified_by, verified_at
  ) VALUES (
    p_po_id, p_vendor_id, p_received_date, p_notes, p_created_by,
    'verified', p_verified_by, now()
  )
  RETURNING id INTO v_grn_id;

  IF p_line_items IS NOT NULL AND jsonb_array_length(p_line_items) > 0 THEN
    INSERT INTO grn_line_items (
      grn_id, po_line_item_id, description,
      ordered_quantity, received_quantity, notes
    )
    SELECT
      v_grn_id,
      (item->>'po_line_item_id')::uuid,
      (item->>'description')::text,
      (item->>'ordered_quantity')::numeric,
      (item->>'received_quantity')::numeric,
      (item->>'notes')::text
    FROM jsonb_array_elements(p_line_items) AS item;
  END IF;

  RETURN v_grn_id;
END;
$$;

-- ─── Engagement: create full (engagement + line items + vendors + rfqs + approval) ─
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
  p_line_items      jsonb
) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE
  v_eng_id uuid;
BEGIN
  INSERT INTO engagements (
    title, description, category_id, estimated_value,
    currency, start_date, end_date, notes, created_by, status
  ) VALUES (
    p_title, p_description, p_category_id, p_estimated_value,
    p_currency, p_start_date, p_end_date, p_notes, p_created_by, 'draft'
  )
  RETURNING id INTO v_eng_id;

  IF p_line_items IS NOT NULL AND jsonb_array_length(p_line_items) > 0 THEN
    INSERT INTO engagement_line_items (engagement_id, description, quantity, unit_price, total_price)
    SELECT
      v_eng_id,
      (item->>'description')::text,
      (item->>'quantity')::numeric,
      (item->>'unit_price')::numeric,
      (item->>'total_price')::numeric
    FROM jsonb_array_elements(p_line_items) AS item;
  END IF;

  IF p_vendor_ids IS NOT NULL AND jsonb_array_length(p_vendor_ids) > 0 THEN
    INSERT INTO engagement_vendors (engagement_id, vendor_id)
    SELECT v_eng_id, (elem::text)::uuid
    FROM jsonb_array_elements_text(p_vendor_ids) AS elem;

    INSERT INTO rfqs (engagement_id, vendor_id, status)
    SELECT v_eng_id, (elem::text)::uuid, 'pending'
    FROM jsonb_array_elements_text(p_vendor_ids) AS elem
    ON CONFLICT (engagement_id, vendor_id) DO UPDATE SET status = 'pending';
  END IF;

  INSERT INTO approval_requests (entity_type, entity_id, requested_by, amount, notes)
  VALUES ('engagement', v_eng_id, p_created_by, p_estimated_value, NULL);

  UPDATE engagements SET status = 'pending_approval' WHERE id = v_eng_id;

  RETURN v_eng_id;
END;
$$;

-- ─── Contract: mark signed atomically (COALESCE prevents race condition) ─────
CREATE OR REPLACE FUNCTION mark_contract_signed(
  p_contract_id        uuid,
  p_signed_by_vendor   boolean DEFAULT NULL,
  p_signed_by_internal boolean DEFAULT NULL
) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  UPDATE contracts SET
    signed_by_vendor   = COALESCE(p_signed_by_vendor,   signed_by_vendor),
    signed_by_internal = COALESCE(p_signed_by_internal, signed_by_internal),
    signed_at = CASE
      WHEN COALESCE(p_signed_by_vendor,   signed_by_vendor)
       AND COALESCE(p_signed_by_internal, signed_by_internal)
      THEN NOW() ELSE signed_at END
  WHERE id = p_contract_id;
END;
$$;

-- ─── Contract: add amendment with atomic sequential numbering ─────────────────
CREATE OR REPLACE FUNCTION add_contract_amendment(
  p_contract_id    uuid,
  p_title          text,
  p_description    text,
  p_effective_date date,
  p_created_by     uuid
) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE
  v_amendment_id uuid;
  v_next_number  int;
BEGIN
  SELECT COALESCE(MAX(amendment_number), 0) + 1
    INTO v_next_number
    FROM contract_amendments
   WHERE contract_id = p_contract_id;

  INSERT INTO contract_amendments
    (contract_id, amendment_number, title, description, effective_date, created_by)
  VALUES
    (p_contract_id, v_next_number, p_title, p_description, p_effective_date, p_created_by)
  RETURNING id INTO v_amendment_id;

  RETURN v_amendment_id;
END;
$$;

-- ─── Auth: rotate refresh token atomically ────────────────────────────────────
CREATE OR REPLACE FUNCTION rotate_refresh_token(
  p_old_token_id uuid,
  p_user_id      uuid,
  p_new_hash     text,
  p_expires_at   timestamptz
) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  UPDATE refresh_tokens SET revoked = true WHERE id = p_old_token_id;
  INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
  VALUES (p_user_id, p_new_hash, p_expires_at);
END;
$$;
