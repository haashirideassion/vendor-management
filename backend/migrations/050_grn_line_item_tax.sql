-- GRN line items had no tax field at all, unlike quotation_line_items
-- (tax_rate) -- the "Items Received" table couldn't show what tax applied
-- to a received line, per Debug2.pdf's "Item Received table headers not
-- showing" report.

ALTER TABLE grn_line_items ADD COLUMN IF NOT EXISTS tax_rate numeric NOT NULL DEFAULT 0;
