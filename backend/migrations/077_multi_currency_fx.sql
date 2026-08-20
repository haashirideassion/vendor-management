-- Multi-currency support with live FX conversion.
--
-- Currency was already a real per-row column on engagements/purchase_orders/
-- invoices/contracts (never actually hardcoded at the DB layer) -- the
-- hardcoding was entirely in 5 frontend forms locking the input to "INR",
-- and there was zero FX/base-currency infrastructure anywhere. This adds:
--
--   1. organizations.base_currency -- the currency all approval thresholds
--      and reporting totals are denominated in for that org.
--   2. exchange_rates -- a cache of rates fetched from a live FX API
--      (frankfurter.app, no API key required), refreshed when a cached rate
--      is more than 24h old (see backend/src/services/exchangeRates.service.ts).
--   3. exchange_rate_to_base + a GENERATED amount_in_base_currency on each
--      money-bearing table -- snapshotted at CREATION time (the rate that
--      applied when the transaction happened, not today's rate), so
--      historical reporting stays accurate even as rates move. This is the
--      same "snapshot, don't re-derive" principle already used for
--      fulfillment_type (migration 072) and approval_policies.
--
-- CONFIRMED scope: approval-threshold comparisons (approval_policies.
-- threshold_amount) are denominated in the org's base_currency -- a
-- transaction's amount is converted to base currency BEFORE being compared,
-- computed once per request and reused for both the entity's own snapshot
-- and the approval gate (see gateOnCreate call sites), not fetched twice.
--
-- Known limitation, explicitly out of scope: changing an org's
-- base_currency does not retroactively recompute exchange_rate_to_base on
-- already-existing rows -- their amount_in_base_currency stays anchored to
-- whatever base currency was active when they were created.

ALTER TABLE organizations ADD COLUMN IF NOT EXISTS base_currency text NOT NULL DEFAULT 'INR';

CREATE TABLE exchange_rates (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_currency text NOT NULL,
  to_currency   text NOT NULL,
  rate          numeric NOT NULL CHECK (rate > 0),
  fetched_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_exchange_rates_pair_date ON exchange_rates(from_currency, to_currency, fetched_at DESC);

-- engagements: amount column is estimated_value
ALTER TABLE engagements ADD COLUMN IF NOT EXISTS exchange_rate_to_base numeric;
ALTER TABLE engagements ADD COLUMN IF NOT EXISTS amount_in_base_currency numeric
  GENERATED ALWAYS AS (estimated_value * COALESCE(exchange_rate_to_base, 1)) STORED;

-- purchase_orders: amount column is total_value (applies uniformly to
-- standard/blanket/release POs)
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS exchange_rate_to_base numeric;
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS amount_in_base_currency numeric
  GENERATED ALWAYS AS (total_value * COALESCE(exchange_rate_to_base, 1)) STORED;

-- invoices: amount column is total_amount
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS exchange_rate_to_base numeric;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS amount_in_base_currency numeric
  GENERATED ALWAYS AS (total_amount * COALESCE(exchange_rate_to_base, 1)) STORED;

-- contracts: amount column is total_value, nullable (unlike the other three) --
-- the generated column just propagates NULL when total_value is NULL.
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS exchange_rate_to_base numeric;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS amount_in_base_currency numeric
  GENERATED ALWAYS AS (total_value * COALESCE(exchange_rate_to_base, 1)) STORED;

-- create_engagement_full: same trailing-DEFAULT-NULL-param pattern used by
-- 071_rfq_response_deadline_param.sql for p_response_deadline -- backward
-- compatible with any existing positional caller.
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
  v_eng_id uuid;
BEGIN
  INSERT INTO engagements (
    title, description, category_id, estimated_value,
    currency, start_date, end_date, notes, created_by, status, org_id,
    exchange_rate_to_base
  ) VALUES (
    p_title, p_description, p_category_id, p_estimated_value,
    p_currency, p_start_date, p_end_date, p_notes, p_created_by, 'draft', p_org_id,
    p_exchange_rate_to_base
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
