-- Procurement Lifecycle Enhancement, Phase 3: Service Confirmation entity --
-- the services-equivalent of a Goods Receipt Note (GRN). GRNs only make
-- sense for physical goods (they record "quantity received"); a services
-- engagement (the overwhelming majority of this app's seeded categories --
-- see service_categories) has nothing to "receive," so invoices against a
-- services PO had no delivery-confirmation step to gate the 3-way match at
-- all. This migration adds that step, structurally mirroring GRN (same
-- status lifecycle, same Associate-creates/Manager-approves/Manager-verifies
-- gate, same line-item shape) rather than inventing a new pattern.
--
-- No goods/services distinction existed anywhere in the schema before this
-- (confirmed by inspection: service_categories/engagements/po_line_items all
-- lack any such column) -- fulfillment_type is added here as that missing
-- discriminator.

-- ─── fulfillment_type: goods vs. service ───────────────────────────────────
ALTER TABLE service_categories ADD COLUMN IF NOT EXISTS fulfillment_type text NOT NULL DEFAULT 'service'
  CHECK (fulfillment_type IN ('goods', 'service'));

-- The only seed category that is unambiguously physical goods, not a
-- service -- everything else in the seed set (002_seed_categories.sql) is
-- explicitly service-flavored ("IT Services", "Professional Consulting
-- Services", etc.), so 'service' is the correct default for all of them.
UPDATE service_categories SET fulfillment_type = 'goods' WHERE name = 'Hardware & Networking Equipment';

-- Denormalized onto purchase_orders (fixed at creation time from the
-- engagement's category, see backend/src/routes/purchaseOrders.ts) rather
-- than re-joined through engagements->service_categories on every read --
-- this is what both the PO detail page (which action to show: Record GRN
-- vs. Record Service Confirmation) and this migration's own backfill below
-- key off of.
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS fulfillment_type text NOT NULL DEFAULT 'service'
  CHECK (fulfillment_type IN ('goods', 'service'));

-- Backfill: any PO that already has a GRN recorded against it is, by
-- definition, a goods PO -- data-driven rather than re-deriving from
-- engagement/category (a category's fulfillment_type may have been
-- reclassified since the PO was created).
UPDATE purchase_orders po SET fulfillment_type = 'goods'
WHERE EXISTS (SELECT 1 FROM grns g WHERE g.po_id = po.id);

-- ─── service_confirmations / service_confirmation_line_items ───────────────
-- Structural clone of grns/grn_line_items (007_procurement_schema.sql) --
-- same status lifecycle (pending_approval -> draft/submitted -> verified/
-- rejected, see 042_approval_gate_generalization.sql's widening of GRN's
-- enum), same triggers, same indexes.
CREATE SEQUENCE IF NOT EXISTS service_confirmation_seq START 1;

CREATE TABLE service_confirmations (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  confirmation_number text UNIQUE,
  po_id              uuid NOT NULL REFERENCES purchase_orders(id),
  vendor_id          uuid NOT NULL REFERENCES vendors(id),
  org_id             uuid NOT NULL REFERENCES organizations(id),
  confirmed_date     date NOT NULL DEFAULT CURRENT_DATE,
  status             text NOT NULL DEFAULT 'draft'
                       CHECK (status IN ('pending_approval', 'draft', 'submitted', 'verified', 'rejected')),
  notes              text,
  created_by         uuid NOT NULL REFERENCES profiles(id),
  verified_by        uuid REFERENCES profiles(id),
  verified_at        timestamptz,
  created_at         timestamptz DEFAULT now(),
  updated_at         timestamptz DEFAULT now()
);

CREATE INDEX idx_service_confirmation_po     ON service_confirmations(po_id);
CREATE INDEX idx_service_confirmation_vendor ON service_confirmations(vendor_id);
CREATE INDEX idx_service_confirmation_status ON service_confirmations(status);

CREATE OR REPLACE FUNCTION assign_service_confirmation_number()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.confirmation_number IS NULL THEN
    NEW.confirmation_number := 'SC-' || TO_CHAR(NOW(), 'YYYY') || '-' || LPAD(nextval('service_confirmation_seq')::text, 4, '0');
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER set_service_confirmation_number
  BEFORE INSERT ON service_confirmations
  FOR EACH ROW EXECUTE FUNCTION assign_service_confirmation_number();

CREATE TRIGGER service_confirmation_set_updated_at
  BEFORE UPDATE ON service_confirmations
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE OR REPLACE FUNCTION log_service_confirmation_status_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NEW.status <> OLD.status THEN
    INSERT INTO audit_log (entity_type, entity_id, action, old_value, new_value, performed_by)
    VALUES ('service_confirmation', NEW.id, 'status_changed',
      jsonb_build_object('status', OLD.status),
      jsonb_build_object('status', NEW.status),
      auth.uid());
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER service_confirmation_audit
  AFTER UPDATE ON service_confirmations
  FOR EACH ROW EXECUTE FUNCTION log_service_confirmation_status_change();

CREATE TABLE service_confirmation_line_items (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_confirmation_id uuid NOT NULL REFERENCES service_confirmations(id) ON DELETE CASCADE,
  po_line_item_id       uuid REFERENCES po_line_items(id),
  description           text NOT NULL,
  quantity_confirmed    numeric NOT NULL CHECK (quantity_confirmed > 0),
  unit_price            numeric NOT NULL CHECK (unit_price >= 0),
  unit                  text,
  tax_rate              numeric NOT NULL DEFAULT 0,
  created_at            timestamptz DEFAULT now()
);

CREATE INDEX idx_service_confirmation_line_items_sc ON service_confirmation_line_items(service_confirmation_id);
CREATE INDEX idx_service_confirmation_line_items_po ON service_confirmation_line_items(po_line_item_id);

-- ─── 3-way match: sum verified Service Confirmations alongside verified GRNs ─
-- Mirrors 051_three_way_match_zero_tolerance.sql's own choice to compare
-- quantity*unit_price only (no tax_rate multiplier) for parity with the
-- existing GRN half of this sum -- not a new inconsistency introduced here.
CREATE OR REPLACE FUNCTION perform_three_way_match(p_invoice_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  inv              invoices%ROWTYPE;
  delivered_total  numeric;
  variance         numeric;
  new_match_status text;
  new_status       text;
BEGIN
  SELECT * INTO inv FROM invoices WHERE id = p_invoice_id;
  IF NOT FOUND THEN RETURN; END IF;

  SELECT
    COALESCE((SELECT SUM(gli.quantity_received * gli.unit_price)
              FROM grn_line_items gli JOIN grns g ON gli.grn_id = g.id
              WHERE g.po_id = inv.po_id AND g.status = 'verified'), 0)
    +
    COALESCE((SELECT SUM(scli.quantity_confirmed * scli.unit_price)
              FROM service_confirmation_line_items scli JOIN service_confirmations sc ON scli.service_confirmation_id = sc.id
              WHERE sc.po_id = inv.po_id AND sc.status = 'verified'), 0)
  INTO delivered_total;

  variance := inv.total_amount - delivered_total;

  IF variance = 0 THEN
    new_match_status := 'matched';
    new_status       := 'matched';
  ELSE
    new_match_status := 'variance';
    new_status       := 'under_review';
  END IF;

  UPDATE invoices
  SET match_status  = new_match_status,
      match_variance = variance,
      status        = new_status
  WHERE id = p_invoice_id;
END;
$$;

-- gateOnCreate (services/approvalGate.ts) inserts into approval_requests
-- with entity_type='service_confirmation' -- widen the same CHECK that
-- 042_approval_gate_generalization.sql already widened for grn/category.
ALTER TABLE approval_requests DROP CONSTRAINT IF EXISTS approval_requests_entity_type_check;
ALTER TABLE approval_requests ADD CONSTRAINT approval_requests_entity_type_check
  CHECK (entity_type IN ('engagement', 'purchase_order', 'invoice', 'grn', 'contract', 'category', 'service_confirmation'));

-- ─── permission: service_confirmations.record ──────────────────────────────
-- Same tier as grns.record (Associate and above, cumulative) -- confirming
-- a service was delivered is the day-to-day equivalent of recording a
-- goods receipt, not a higher-trust action.
INSERT INTO permissions (key, module, action, description, module_code) VALUES
  ('service_confirmations.record', 'service_confirmations', 'record', 'Confirm a contracted service was delivered', 'procurement')
ON CONFLICT (key) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.scope = 'org' AND r.name IN ('Associate', 'Manager', 'Admin')
  AND p.key = 'service_confirmations.record'
ON CONFLICT DO NOTHING;
