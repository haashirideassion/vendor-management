-- ─── Fix: create_engagement_full inserts a total_price column that ─────────
-- engagement_line_items has never had (it's deliberately app-computed, same
-- as the sibling po_line_items table -- see 007_procurement_schema.sql's own
-- comment on that design). Every engagement creation with >=1 line item has
-- been hitting a 500 from this INSERT. Drop total_price from the RPC.
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
  p_org_id          uuid
) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE
  v_eng_id uuid;
BEGIN
  INSERT INTO engagements (
    title, description, category_id, estimated_value,
    currency, start_date, end_date, notes, created_by, status, org_id
  ) VALUES (
    p_title, p_description, p_category_id, p_estimated_value,
    p_currency, p_start_date, p_end_date, p_notes, p_created_by, 'draft', p_org_id
  )
  RETURNING id INTO v_eng_id;

  IF p_line_items IS NOT NULL AND jsonb_array_length(p_line_items) > 0 THEN
    INSERT INTO engagement_line_items (engagement_id, description, quantity, unit_price)
    SELECT
      v_eng_id,
      (item->>'description')::text,
      (item->>'quantity')::numeric,
      (item->>'unit_price')::numeric
    FROM jsonb_array_elements(p_line_items) AS item;
  END IF;

  IF p_vendor_ids IS NOT NULL AND jsonb_array_length(p_vendor_ids) > 0 THEN
    INSERT INTO engagement_vendors (engagement_id, vendor_id)
    SELECT v_eng_id, (elem::text)::uuid
    FROM jsonb_array_elements_text(p_vendor_ids) AS elem;

    INSERT INTO rfqs (engagement_id, vendor_id, status, org_id)
    SELECT v_eng_id, (elem::text)::uuid, 'pending', p_org_id
    FROM jsonb_array_elements_text(p_vendor_ids) AS elem
    ON CONFLICT (engagement_id, vendor_id) DO UPDATE SET status = 'pending';
  END IF;

  INSERT INTO approval_requests (entity_type, entity_id, requested_by, amount, notes, org_id)
  VALUES ('engagement', v_eng_id, p_created_by, p_estimated_value, NULL, p_org_id);

  UPDATE engagements SET status = 'pending_approval' WHERE id = v_eng_id;

  RETURN v_eng_id;
END;
$$;
