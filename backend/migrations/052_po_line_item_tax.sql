-- po_line_items never had a tax field, unlike quotation_line_items
-- (tax_rate) -- so when a PO was generated from an accepted quotation, its
-- tax_rate was silently dropped, understating the PO/GRN total against
-- what the vendor later invoices (the source of at least one investigated
-- "invoice variance" that was actually just missing tax carried through).

ALTER TABLE po_line_items ADD COLUMN IF NOT EXISTS tax_rate numeric NOT NULL DEFAULT 0;
