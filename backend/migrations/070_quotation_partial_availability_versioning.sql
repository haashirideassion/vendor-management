-- Procurement Lifecycle Enhancement, Phase 2: RFQ/Quotation partial
-- availability + quotation versioning.
--
-- Three real gaps found by inspection, not assumed:
--   1. rfqs has no deadline column at all.
--   2. quotation_line_items.quantity/unit_price are NOT NULL with
--      CHECK (quantity > 0) -- structurally impossible to represent a
--      vendor marking a line "not available," which the spec requires.
--   3. quotations has UNIQUE(rfq_id) -- literally one quotation per RFQ,
--      ever. No versioning existed; a resubmission today isn't possible at
--      the database level (the /create route currently upserts the same
--      draft row in place, and blocks entirely once it leaves draft).
--
-- CONFIRMED: no "Substituted"/"Backordered" statuses -- just Available /
-- Partially Available / Not Available, since no concrete need for the
-- others surfaced.

-- ─── RFQ deadline ───────────────────────────────────────────────────────────
-- Nullable for backward compatibility with existing rows (no retroactive
-- deadline can be invented for an RFQ that's already pending/closed) --
-- enforced as REQUIRED at the application layer for newly created RFQs
-- going forward (engagements.ts, where RFQs are actually created).
ALTER TABLE rfqs ADD COLUMN IF NOT EXISTS response_deadline timestamptz;

-- ─── Line-item partial availability ────────────────────────────────────────
ALTER TABLE quotation_line_items DROP CONSTRAINT IF EXISTS quotation_line_items_quantity_check;
ALTER TABLE quotation_line_items ALTER COLUMN quantity DROP NOT NULL;
ALTER TABLE quotation_line_items ALTER COLUMN unit_price DROP NOT NULL;
ALTER TABLE quotation_line_items ALTER COLUMN tax_rate DROP NOT NULL;
ALTER TABLE quotation_line_items ALTER COLUMN tax_rate DROP DEFAULT;

ALTER TABLE quotation_line_items ADD COLUMN IF NOT EXISTS availability_status text NOT NULL DEFAULT 'available'
  CHECK (availability_status IN ('available', 'partially_available', 'not_available'));

-- A "not available" line can never carry a price/tax/quantity; anything
-- else requires a valid positive quantity and non-negative price -- format
-- validation enforced at BOTH layers per the established rule (never trust
-- frontend validation alone), this is the server-side half.
ALTER TABLE quotation_line_items ADD CONSTRAINT quotation_line_items_availability_consistency CHECK (
  (availability_status = 'not_available' AND quantity IS NULL AND unit_price IS NULL AND tax_rate IS NULL)
  OR
  (availability_status IN ('available', 'partially_available') AND quantity IS NOT NULL AND quantity > 0 AND unit_price IS NOT NULL AND unit_price >= 0)
);

-- The GENERATED total column can't evaluate against NULL inputs for a
-- not_available line -- COALESCE to 0 so the row is still insertable
-- (0 correctly reflects "nothing being charged for this line").
ALTER TABLE quotation_line_items DROP COLUMN IF EXISTS total;
ALTER TABLE quotation_line_items ADD COLUMN total numeric GENERATED ALWAYS AS (
  COALESCE(quantity, 0) * COALESCE(unit_price, 0) * (1 + COALESCE(tax_rate, 0) / 100)
) STORED;

-- ─── Quotation versioning ───────────────────────────────────────────────────
ALTER TABLE quotations DROP CONSTRAINT IF EXISTS quotations_rfq_id_key;
ALTER TABLE quotations ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1;
ALTER TABLE quotations ADD COLUMN IF NOT EXISTS is_current boolean NOT NULL DEFAULT true;

-- Every existing quotation is, by definition, the only (and therefore
-- current) version for its RFQ -- this backfill is a no-op in practice
-- (default true already covers it) but stated explicitly for clarity.
UPDATE quotations SET is_current = true WHERE is_current IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_quotations_one_current_per_rfq ON quotations(rfq_id) WHERE is_current;
