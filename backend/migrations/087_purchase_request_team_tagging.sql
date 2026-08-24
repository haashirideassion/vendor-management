-- Optional Team tag, propagated forward from purchase_requests through the
-- full procurement chain (RFQ -> PO -> GRN/Service Confirmation -> Invoice).
-- Reuses the existing rbac `teams` table (059_rbac_teams.sql, scope='org'
-- rows only) rather than a new entity -- same denormalize-forward-at-
-- creation-time pattern as purchase_orders.fulfillment_type
-- (072_service_confirmations.sql): each row gets its own copy fixed at
-- creation time, not re-joined through the chain on every read.
--
-- Nullable everywhere -- Team is optional end to end, never defaulted,
-- never inferred from the logged-in user, and never editable downstream of
-- the originating purchase request. Existing rows correctly get team_id =
-- NULL; there's no backfill signal to reclassify them.

ALTER TABLE purchase_requests     ADD COLUMN IF NOT EXISTS team_id uuid REFERENCES teams(id) ON DELETE SET NULL;
ALTER TABLE rfqs                  ADD COLUMN IF NOT EXISTS team_id uuid REFERENCES teams(id) ON DELETE SET NULL;
ALTER TABLE purchase_orders       ADD COLUMN IF NOT EXISTS team_id uuid REFERENCES teams(id) ON DELETE SET NULL;
ALTER TABLE grns                  ADD COLUMN IF NOT EXISTS team_id uuid REFERENCES teams(id) ON DELETE SET NULL;
ALTER TABLE service_confirmations ADD COLUMN IF NOT EXISTS team_id uuid REFERENCES teams(id) ON DELETE SET NULL;
ALTER TABLE invoices              ADD COLUMN IF NOT EXISTS team_id uuid REFERENCES teams(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_purchase_requests_team     ON purchase_requests(team_id);
CREATE INDEX IF NOT EXISTS idx_rfqs_team                  ON rfqs(team_id);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_team       ON purchase_orders(team_id);
CREATE INDEX IF NOT EXISTS idx_grns_team                  ON grns(team_id);
CREATE INDEX IF NOT EXISTS idx_service_confirmations_team ON service_confirmations(team_id);
CREATE INDEX IF NOT EXISTS idx_invoices_team              ON invoices(team_id);

-- Extend create_purchase_request_full with an optional p_team_id, appended
-- last with a default -- the existing named-argument call site in
-- purchaseRequests.ts needs no reordering. Copied onto purchase_requests
-- and onto every rfqs row inserted for this PR (one per invited vendor).
CREATE OR REPLACE FUNCTION create_purchase_request_full(
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
  p_exchange_rate_to_base numeric DEFAULT NULL,
  p_team_id         uuid DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE
  v_pr_id uuid;
BEGIN
  INSERT INTO purchase_requests (
    title, description, category_id, estimated_value,
    currency, start_date, end_date, notes, created_by, status, org_id,
    exchange_rate_to_base, team_id
  ) VALUES (
    p_title, p_description, p_category_id, p_estimated_value,
    p_currency, p_start_date, p_end_date, p_notes, p_created_by, 'draft', p_org_id,
    p_exchange_rate_to_base, p_team_id
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

    INSERT INTO rfqs (purchase_request_id, vendor_id, status, org_id, response_deadline, team_id)
    SELECT v_pr_id, (elem::text)::uuid, 'pending', p_org_id, p_response_deadline, p_team_id
    FROM jsonb_array_elements_text(p_vendor_ids) AS elem
    ON CONFLICT (purchase_request_id, vendor_id) DO UPDATE SET status = 'pending', response_deadline = p_response_deadline;
  END IF;

  RETURN v_pr_id;
END;
$$;
