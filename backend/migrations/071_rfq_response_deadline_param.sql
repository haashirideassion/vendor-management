-- Procurement Lifecycle Enhancement, Phase 2 (cont'd): create_engagement_full
-- is where RFQs actually get created (one per invited vendor, on engagement
-- creation) -- there is no separate "create RFQ" endpoint. Adding
-- p_response_deadline as a new trailing DEFAULT NULL parameter keeps this
-- function signature backward compatible; the route (engagements.ts) is
-- what actually makes it a required field going forward, per the spec.
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
  p_response_deadline timestamptz DEFAULT NULL
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

    INSERT INTO rfqs (engagement_id, vendor_id, status, org_id, response_deadline)
    SELECT v_eng_id, (elem::text)::uuid, 'pending', p_org_id, p_response_deadline
    FROM jsonb_array_elements_text(p_vendor_ids) AS elem
    ON CONFLICT (engagement_id, vendor_id) DO UPDATE SET status = 'pending', response_deadline = p_response_deadline;
  END IF;

  RETURN v_eng_id;
END;
$$;
