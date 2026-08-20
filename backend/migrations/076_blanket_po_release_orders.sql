-- Procurement Lifecycle Enhancement: Blanket PO / Release Order.
--
-- A Blanket PO is a standing agreement authorizing up to a fixed total value
-- with a vendor over a validity period, without committing to specific
-- deliveries. Actual work happens via Release Orders drawn down against it
-- over time -- each Release Order is a normal, fully-functional Purchase
-- Order (its own line items, its own GRN/Service Confirmation/Invoice flow),
-- just tagged with which Blanket PO it draws from.
--
-- Deliberately modeled as MORE purchase_orders rows (po_type discriminator +
-- self-referencing parent_po_id) rather than a new table: every downstream
-- entity (grns, service_confirmations, invoices, perform_three_way_match)
-- already references a PO purely by po_id with no other assumption about
-- it -- confirmed by inspection -- so a Release Order needs ZERO changes to
-- any of those tables/routes. It just is a purchase_orders row like any
-- other, with parent_po_id set.
--
-- CONFIRMED scope: cap enforcement is total-value-only (no per-line-item
-- authorized-quantity tracking); a Blanket PO has a validity period
-- (valid_from/valid_until) after which new Release Orders are blocked.

ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS po_type text NOT NULL DEFAULT 'standard'
  CHECK (po_type IN ('standard', 'blanket', 'release'));

ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS parent_po_id uuid REFERENCES purchase_orders(id);

ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS valid_from  date;
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS valid_until date;

-- A release must reference its blanket parent; a standard/blanket PO must
-- not reference one. (Which parent is actually of po_type='blanket', and
-- the value/validity/vendor/currency checks, are enforced at the
-- application layer in purchaseOrders.ts's /create -- matching this
-- codebase's established convention of doing business-rule validation in
-- the Express route rather than the DB, same as GRN/Service Confirmation
-- quantity-remaining checks.)
ALTER TABLE purchase_orders ADD CONSTRAINT po_release_requires_parent
  CHECK ((po_type = 'release') = (parent_po_id IS NOT NULL));

CREATE INDEX IF NOT EXISTS idx_po_parent ON purchase_orders(parent_po_id);
CREATE INDEX IF NOT EXISTS idx_po_type   ON purchase_orders(po_type);
