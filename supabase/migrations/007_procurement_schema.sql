-- ─── Sequences for auto-generated numbers ─────────────────────────────────────
CREATE SEQUENCE IF NOT EXISTS po_seq  START 1;
CREATE SEQUENCE IF NOT EXISTS grn_seq START 1;
CREATE SEQUENCE IF NOT EXISTS inv_seq START 1;

-- ─── engagements ──────────────────────────────────────────────────────────────
-- A work request raised by hr_user/manager for a specific vendor
CREATE TABLE IF NOT EXISTS engagements (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title           text NOT NULL,
  description     text,
  vendor_id       uuid NOT NULL REFERENCES vendors(id),
  category_id     uuid REFERENCES service_categories(id),
  estimated_value numeric NOT NULL CHECK (estimated_value > 0),
  currency        text NOT NULL DEFAULT 'INR',
  start_date      date,
  end_date        date,
  status          text NOT NULL DEFAULT 'draft'
                    CHECK (status IN (
                      'draft', 'pending_approval', 'approved',
                      'rejected', 'cancelled', 'completed'
                    )),
  notes           text,
  created_by      uuid NOT NULL REFERENCES profiles(id),
  approved_by     uuid REFERENCES profiles(id),
  approved_at     timestamptz,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_engagements_vendor    ON engagements(vendor_id);
CREATE INDEX IF NOT EXISTS idx_engagements_status    ON engagements(status);
CREATE INDEX IF NOT EXISTS idx_engagements_created_by ON engagements(created_by);

DROP TRIGGER IF EXISTS engagements_set_updated_at ON engagements;
CREATE TRIGGER engagements_set_updated_at
  BEFORE UPDATE ON engagements
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Audit on engagement status changes
CREATE OR REPLACE FUNCTION log_engagement_status_change()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NEW.status <> OLD.status THEN
    INSERT INTO audit_log (entity_type, entity_id, action, old_value, new_value, performed_by)
    VALUES ('engagement', NEW.id, 'status_changed',
      jsonb_build_object('status', OLD.status),
      jsonb_build_object('status', NEW.status),
      auth.uid());
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS engagement_audit ON engagements;
CREATE TRIGGER engagement_audit
  AFTER UPDATE ON engagements
  FOR EACH ROW EXECUTE FUNCTION log_engagement_status_change();

-- ─── purchase_orders ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS purchase_orders (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  po_number        text UNIQUE,                              -- set by trigger on insert
  engagement_id    uuid REFERENCES engagements(id),
  vendor_id        uuid NOT NULL REFERENCES vendors(id),
  total_value      numeric NOT NULL CHECK (total_value > 0),
  currency         text NOT NULL DEFAULT 'INR',
  status           text NOT NULL DEFAULT 'draft'
                     CHECK (status IN (
                       'draft', 'issued', 'partially_received',
                       'fully_received', 'cancelled', 'closed'
                     )),
  issue_date       date,
  expected_delivery_date date,
  delivery_address text,
  payment_terms    text,
  notes            text,
  created_by       uuid NOT NULL REFERENCES profiles(id),
  created_at       timestamptz DEFAULT now(),
  updated_at       timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_po_vendor       ON purchase_orders(vendor_id);
CREATE INDEX IF NOT EXISTS idx_po_engagement   ON purchase_orders(engagement_id);
CREATE INDEX IF NOT EXISTS idx_po_status       ON purchase_orders(status);
CREATE INDEX IF NOT EXISTS idx_po_status_date  ON purchase_orders(status, created_at DESC);

-- Auto-generate PO number: PO-YYYY-NNNN
CREATE OR REPLACE FUNCTION assign_po_number()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.po_number IS NULL THEN
    NEW.po_number := 'PO-' || TO_CHAR(NOW(), 'YYYY') || '-' || LPAD(nextval('po_seq')::text, 4, '0');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_po_number ON purchase_orders;
CREATE TRIGGER set_po_number
  BEFORE INSERT ON purchase_orders
  FOR EACH ROW EXECUTE FUNCTION assign_po_number();

DROP TRIGGER IF EXISTS po_set_updated_at ON purchase_orders;
CREATE TRIGGER po_set_updated_at
  BEFORE UPDATE ON purchase_orders
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE OR REPLACE FUNCTION log_po_status_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NEW.status <> OLD.status THEN
    INSERT INTO audit_log (entity_type, entity_id, action, old_value, new_value, performed_by)
    VALUES ('purchase_order', NEW.id, 'status_changed',
      jsonb_build_object('status', OLD.status),
      jsonb_build_object('status', NEW.status),
      auth.uid());
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS po_audit ON purchase_orders;
CREATE TRIGGER po_audit
  AFTER UPDATE ON purchase_orders
  FOR EACH ROW EXECUTE FUNCTION log_po_status_change();

-- ─── po_line_items ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS po_line_items (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  po_id       uuid NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  description text NOT NULL,
  quantity    numeric NOT NULL CHECK (quantity > 0),
  unit_price  numeric NOT NULL CHECK (unit_price >= 0),
  unit        text,          -- 'hours', 'units', 'months', 'days', etc.
  created_at  timestamptz DEFAULT now()
);

-- total_price as a virtual column computed in the application layer
-- (avoids GENERATED ALWAYS issues with Supabase type inference)

CREATE INDEX IF NOT EXISTS idx_po_line_items_po ON po_line_items(po_id);

-- ─── grns (Goods Receipt Notes) ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS grns (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  grn_number     text UNIQUE,                              -- set by trigger on insert
  po_id          uuid NOT NULL REFERENCES purchase_orders(id),
  vendor_id      uuid NOT NULL REFERENCES vendors(id),
  received_date  date NOT NULL DEFAULT CURRENT_DATE,
  status         text NOT NULL DEFAULT 'draft'
                   CHECK (status IN ('draft', 'submitted', 'verified', 'rejected')),
  notes          text,
  created_by     uuid NOT NULL REFERENCES profiles(id),
  verified_by    uuid REFERENCES profiles(id),
  verified_at    timestamptz,
  created_at     timestamptz DEFAULT now(),
  updated_at     timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_grn_po        ON grns(po_id);
CREATE INDEX IF NOT EXISTS idx_grn_vendor    ON grns(vendor_id);
CREATE INDEX IF NOT EXISTS idx_grn_status    ON grns(status);

CREATE OR REPLACE FUNCTION assign_grn_number()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.grn_number IS NULL THEN
    NEW.grn_number := 'GRN-' || TO_CHAR(NOW(), 'YYYY') || '-' || LPAD(nextval('grn_seq')::text, 4, '0');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_grn_number ON grns;
CREATE TRIGGER set_grn_number
  BEFORE INSERT ON grns
  FOR EACH ROW EXECUTE FUNCTION assign_grn_number();

DROP TRIGGER IF EXISTS grn_set_updated_at ON grns;
CREATE TRIGGER grn_set_updated_at
  BEFORE UPDATE ON grns
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE OR REPLACE FUNCTION log_grn_status_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NEW.status <> OLD.status THEN
    INSERT INTO audit_log (entity_type, entity_id, action, old_value, new_value, performed_by)
    VALUES ('grn', NEW.id, 'status_changed',
      jsonb_build_object('status', OLD.status),
      jsonb_build_object('status', NEW.status),
      auth.uid());
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS grn_audit ON grns;
CREATE TRIGGER grn_audit
  AFTER UPDATE ON grns
  FOR EACH ROW EXECUTE FUNCTION log_grn_status_change();

-- ─── grn_line_items ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS grn_line_items (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  grn_id            uuid NOT NULL REFERENCES grns(id) ON DELETE CASCADE,
  po_line_item_id   uuid REFERENCES po_line_items(id),   -- links back to the PO line
  description       text NOT NULL,
  quantity_received numeric NOT NULL CHECK (quantity_received > 0),
  unit_price        numeric NOT NULL CHECK (unit_price >= 0),
  unit              text,
  created_at        timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_grn_line_items_grn ON grn_line_items(grn_id);
CREATE INDEX IF NOT EXISTS idx_grn_line_items_po  ON grn_line_items(po_line_item_id);

-- ─── invoices ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS invoices (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_ref     text UNIQUE,                             -- internal: INV-YYYY-NNNN
  vendor_invoice_number text NOT NULL,                     -- vendor's own invoice number
  vendor_id       uuid NOT NULL REFERENCES vendors(id),
  po_id           uuid REFERENCES purchase_orders(id),
  grn_id          uuid REFERENCES grns(id),
  total_amount    numeric NOT NULL CHECK (total_amount > 0),
  currency        text NOT NULL DEFAULT 'INR',
  invoice_date    date NOT NULL,
  due_date        date,
  status          text NOT NULL DEFAULT 'submitted'
                    CHECK (status IN (
                      'submitted', 'under_review', 'matched',
                      'approved', 'rejected', 'paid'
                    )),
  match_status    text CHECK (match_status IN ('matched', 'variance', 'pending')),
  match_variance  numeric,                                 -- invoice_amount − grn_total
  storage_path    text,                                    -- uploaded invoice file
  notes           text,
  submitted_by    uuid NOT NULL REFERENCES profiles(id),
  reviewed_by     uuid REFERENCES profiles(id),
  reviewed_at     timestamptz,
  paid_at         timestamptz,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_invoice_vendor   ON invoices(vendor_id);
CREATE INDEX IF NOT EXISTS idx_invoice_po       ON invoices(po_id);
CREATE INDEX IF NOT EXISTS idx_invoice_status   ON invoices(status);
CREATE INDEX IF NOT EXISTS idx_invoice_match    ON invoices(match_status);

CREATE OR REPLACE FUNCTION assign_invoice_ref()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.invoice_ref IS NULL THEN
    NEW.invoice_ref := 'INV-' || TO_CHAR(NOW(), 'YYYY') || '-' || LPAD(nextval('inv_seq')::text, 4, '0');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_invoice_ref ON invoices;
CREATE TRIGGER set_invoice_ref
  BEFORE INSERT ON invoices
  FOR EACH ROW EXECUTE FUNCTION assign_invoice_ref();

DROP TRIGGER IF EXISTS invoice_set_updated_at ON invoices;
CREATE TRIGGER invoice_set_updated_at
  BEFORE UPDATE ON invoices
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE OR REPLACE FUNCTION log_invoice_status_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NEW.status <> OLD.status THEN
    INSERT INTO audit_log (entity_type, entity_id, action, old_value, new_value, performed_by)
    VALUES ('invoice', NEW.id, 'status_changed',
      jsonb_build_object('status', OLD.status),
      jsonb_build_object('status', NEW.status),
      auth.uid());
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS invoice_audit ON invoices;
CREATE TRIGGER invoice_audit
  AFTER UPDATE ON invoices
  FOR EACH ROW EXECUTE FUNCTION log_invoice_status_change();

-- ─── Three-way match function ──────────────────────────────────────────────────
-- Call this after a GRN is verified or an invoice is submitted.
-- Updates match_status and match_variance on the invoice.
CREATE OR REPLACE FUNCTION perform_three_way_match(p_invoice_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  inv            invoices%ROWTYPE;
  grn_total      numeric;
  variance       numeric;
  variance_pct   numeric;
  new_match_status text;
  new_status     text;
BEGIN
  SELECT * INTO inv FROM invoices WHERE id = p_invoice_id;
  IF NOT FOUND THEN RETURN; END IF;

  -- Sum verified GRN lines for this PO
  SELECT COALESCE(SUM(gli.quantity_received * gli.unit_price), 0)
  INTO grn_total
  FROM grn_line_items gli
  JOIN grns g ON gli.grn_id = g.id
  WHERE g.po_id = inv.po_id
    AND g.status = 'verified';

  variance     := inv.total_amount - grn_total;
  variance_pct := CASE WHEN grn_total = 0 THEN 100
                       ELSE ABS(variance) / grn_total * 100 END;

  -- Within 5% tolerance → matched (auto-approved for payment)
  IF variance_pct <= 5 THEN
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

-- ─── RLS ──────────────────────────────────────────────────────────────────────
ALTER TABLE engagements   ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE po_line_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE grns          ENABLE ROW LEVEL SECURITY;
ALTER TABLE grn_line_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices      ENABLE ROW LEVEL SECURITY;

-- engagements
CREATE POLICY "engagements: internal users read all"
  ON engagements FOR SELECT USING (is_internal_user());

CREATE POLICY "engagements: internal users insert"
  ON engagements FOR INSERT TO authenticated
  WITH CHECK (is_internal_user() AND created_by = auth.uid());

CREATE POLICY "engagements: internal users update"
  ON engagements FOR UPDATE USING (is_internal_user());

-- purchase_orders
CREATE POLICY "po: internal users read all"
  ON purchase_orders FOR SELECT USING (is_internal_user());

CREATE POLICY "po: vendor reads own"
  ON purchase_orders FOR SELECT
  USING (vendor_id IN (SELECT id FROM vendors WHERE profile_id = auth.uid()));

CREATE POLICY "po: procurement+ insert"
  ON purchase_orders FOR INSERT TO authenticated
  WITH CHECK (is_internal_user() AND created_by = auth.uid());

CREATE POLICY "po: procurement+ update"
  ON purchase_orders FOR UPDATE USING (is_internal_user());

-- po_line_items
CREATE POLICY "po_line_items: internal users read all"
  ON po_line_items FOR SELECT USING (is_internal_user());

CREATE POLICY "po_line_items: vendor reads own"
  ON po_line_items FOR SELECT
  USING (po_id IN (
    SELECT id FROM purchase_orders
    WHERE vendor_id IN (SELECT id FROM vendors WHERE profile_id = auth.uid())
  ));

CREATE POLICY "po_line_items: internal users insert"
  ON po_line_items FOR INSERT TO authenticated WITH CHECK (is_internal_user());

CREATE POLICY "po_line_items: internal users update"
  ON po_line_items FOR UPDATE USING (is_internal_user());

CREATE POLICY "po_line_items: internal users delete"
  ON po_line_items FOR DELETE USING (is_internal_user());

-- grns
CREATE POLICY "grns: internal users read all"
  ON grns FOR SELECT USING (is_internal_user());

CREATE POLICY "grns: vendor reads own"
  ON grns FOR SELECT
  USING (vendor_id IN (SELECT id FROM vendors WHERE profile_id = auth.uid()));

CREATE POLICY "grns: internal users insert"
  ON grns FOR INSERT TO authenticated
  WITH CHECK (is_internal_user() AND created_by = auth.uid());

CREATE POLICY "grns: internal users update"
  ON grns FOR UPDATE USING (is_internal_user());

-- grn_line_items
CREATE POLICY "grn_line_items: internal users read all"
  ON grn_line_items FOR SELECT USING (is_internal_user());

CREATE POLICY "grn_line_items: vendor reads own"
  ON grn_line_items FOR SELECT
  USING (grn_id IN (
    SELECT id FROM grns
    WHERE vendor_id IN (SELECT id FROM vendors WHERE profile_id = auth.uid())
  ));

CREATE POLICY "grn_line_items: internal users insert"
  ON grn_line_items FOR INSERT TO authenticated WITH CHECK (is_internal_user());

CREATE POLICY "grn_line_items: internal users update"
  ON grn_line_items FOR UPDATE USING (is_internal_user());

CREATE POLICY "grn_line_items: internal users delete"
  ON grn_line_items FOR DELETE USING (is_internal_user());

-- invoices
CREATE POLICY "invoices: internal users read all"
  ON invoices FOR SELECT USING (is_internal_user());

CREATE POLICY "invoices: vendor reads own"
  ON invoices FOR SELECT
  USING (vendor_id IN (SELECT id FROM vendors WHERE profile_id = auth.uid()));

CREATE POLICY "invoices: vendor inserts own"
  ON invoices FOR INSERT TO authenticated
  WITH CHECK (
    submitted_by = auth.uid()
    AND vendor_id IN (SELECT id FROM vendors WHERE profile_id = auth.uid())
  );

CREATE POLICY "invoices: internal users update"
  ON invoices FOR UPDATE USING (is_internal_user());
