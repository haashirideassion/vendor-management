-- Tax component generalization.
--
-- Today's tax_rate (a single flat % on quotation_line_items/po_line_items/
-- grn_line_items/service_confirmation_line_items) can't represent a
-- multi-part tax like India's CGST+SGST (intra-state) vs IGST (inter-state),
-- or any other jurisdiction that splits tax into named parts. CONFIRMED
-- scope: components are entered manually (name + rate) -- no auto-split
-- based on place of supply, which would need a buyer-org state/location
-- concept that doesn't exist today (only vendors have one).
--
-- Deliberately additive, not a replacement: tax_rate stays exactly as it is
-- on all 4 tables (every existing total formula -- 7 frontend call sites
-- plus quotation_line_items' own GENERATED column -- keeps working
-- unchanged). A line item's tax_rate is simply the SUM of its components,
-- computed at the APPLICATION layer when components are submitted (backend
-- routes, not a DB trigger -- matching this codebase's established
-- convention of doing business-rule computation in Express routes). A line
-- item with no components behaves exactly as before: a single flat
-- tax_rate with no breakdown.
--
-- Modeled as ONE polymorphic table (line_item_type discriminator) rather
-- than 4 near-identical child tables -- this codebase already uses the
-- same polymorphic-association pattern extensively (documents,
-- verifications, contacts all use related_entity_type/related_entity_id).
-- No real FK to line_item_id is possible since it points at 4 different
-- tables depending on line_item_type, same limitation those other
-- polymorphic tables already have.

CREATE TABLE line_item_tax_components (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  line_item_type text NOT NULL CHECK (line_item_type IN ('quotation', 'po', 'grn', 'service_confirmation')),
  line_item_id   uuid NOT NULL,
  name           text NOT NULL,
  rate           numeric NOT NULL CHECK (rate >= 0),
  created_at     timestamptz DEFAULT now()
);

CREATE INDEX idx_line_item_tax_components_item ON line_item_tax_components(line_item_type, line_item_id);
