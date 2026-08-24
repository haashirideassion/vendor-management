-- Stable linkage between a vendor's quotation line item and the specific
-- purchase-request line item it was quoted against. Until now this
-- relationship existed only implicitly (array-position + copied
-- description text at submission time in quotations.ts POST /create),
-- which breaks the moment a vendor edits a row's description or the org
-- wants to compare vendors item-by-item rather than card-by-card.
--
-- Nullable: (a) a vendor can append an ad-hoc extra row in the quotation
-- dialog that was never seeded from any PR line item -- there is nothing
-- to link it to, by design; (b) quotation_line_items rows created before
-- this migration have no way to be retroactively linked (no backfill
-- attempted) and stay NULL forever.
--
-- ON DELETE SET NULL: a purchase_request_line_item row is never deleted in
-- this app's UI today, but if it ever were, the vendor's historical
-- quotation line item must survive -- it just degrades to looking like an
-- unlinked/ad-hoc row, which the comparison UI already has to handle for
-- pre-migration data anyway.
ALTER TABLE quotation_line_items
  ADD COLUMN IF NOT EXISTS purchase_request_line_item_id uuid
    REFERENCES purchase_request_line_items(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_quotation_line_items_pr_line_item
  ON quotation_line_items(purchase_request_line_item_id);
