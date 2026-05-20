-- ─── Sequences ────────────────────────────────────────────────────────────────
CREATE SEQUENCE IF NOT EXISTS rfq_seq  START 1;
CREATE SEQUENCE IF NOT EXISTS quot_seq START 1;

-- ─── rfqs ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS rfqs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rfq_number    text UNIQUE,
  engagement_id uuid NOT NULL REFERENCES engagements(id) ON DELETE CASCADE,
  vendor_id     uuid NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  status        text NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'viewed', 'responded', 'closed')),
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now(),
  UNIQUE (engagement_id, vendor_id)
);

CREATE INDEX IF NOT EXISTS idx_rfq_engagement ON rfqs(engagement_id);
CREATE INDEX IF NOT EXISTS idx_rfq_vendor     ON rfqs(vendor_id);
CREATE INDEX IF NOT EXISTS idx_rfq_status     ON rfqs(status);

CREATE OR REPLACE FUNCTION assign_rfq_number()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.rfq_number IS NULL THEN
    NEW.rfq_number := 'RFQ-' || TO_CHAR(NOW(), 'YYYY') || '-' || LPAD(nextval('rfq_seq')::text, 4, '0');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_rfq_number ON rfqs;
CREATE TRIGGER set_rfq_number
  BEFORE INSERT ON rfqs
  FOR EACH ROW EXECUTE FUNCTION assign_rfq_number();

DROP TRIGGER IF EXISTS rfq_set_updated_at ON rfqs;
CREATE TRIGGER rfq_set_updated_at
  BEFORE UPDATE ON rfqs
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE rfqs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rfqs: internal users read all"
  ON rfqs FOR SELECT
  USING (is_internal_user());

CREATE POLICY "rfqs: internal users insert"
  ON rfqs FOR INSERT
  TO authenticated
  WITH CHECK (is_internal_user());

CREATE POLICY "rfqs: internal users update"
  ON rfqs FOR UPDATE
  USING (is_internal_user());

CREATE POLICY "rfqs: vendor reads own"
  ON rfqs FOR SELECT
  USING (vendor_id IN (SELECT id FROM vendors WHERE profile_id = auth.uid()));

CREATE POLICY "rfqs: vendor updates own status"
  ON rfqs FOR UPDATE
  USING (vendor_id IN (SELECT id FROM vendors WHERE profile_id = auth.uid()))
  WITH CHECK (vendor_id IN (SELECT id FROM vendors WHERE profile_id = auth.uid()));

-- ─── quotations ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS quotations (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quot_number   text UNIQUE,
  rfq_id        uuid NOT NULL REFERENCES rfqs(id) ON DELETE CASCADE,
  engagement_id uuid NOT NULL REFERENCES engagements(id) ON DELETE CASCADE,
  vendor_id     uuid NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  status        text NOT NULL DEFAULT 'draft'
                  CHECK (status IN ('draft', 'submitted', 'accepted', 'rejected')),
  notes         text,
  total_amount  numeric,
  submitted_at  timestamptz,
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now(),
  UNIQUE (rfq_id)
);

CREATE INDEX IF NOT EXISTS idx_quot_rfq        ON quotations(rfq_id);
CREATE INDEX IF NOT EXISTS idx_quot_engagement ON quotations(engagement_id);
CREATE INDEX IF NOT EXISTS idx_quot_vendor     ON quotations(vendor_id);
CREATE INDEX IF NOT EXISTS idx_quot_status     ON quotations(status);

CREATE OR REPLACE FUNCTION assign_quot_number()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.quot_number IS NULL THEN
    NEW.quot_number := 'QUO-' || TO_CHAR(NOW(), 'YYYY') || '-' || LPAD(nextval('quot_seq')::text, 4, '0');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_quot_number ON quotations;
CREATE TRIGGER set_quot_number
  BEFORE INSERT ON quotations
  FOR EACH ROW EXECUTE FUNCTION assign_quot_number();

DROP TRIGGER IF EXISTS quot_set_updated_at ON quotations;
CREATE TRIGGER quot_set_updated_at
  BEFORE UPDATE ON quotations
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE quotations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "quotations: internal users read all"
  ON quotations FOR SELECT
  USING (is_internal_user());

CREATE POLICY "quotations: internal users update"
  ON quotations FOR UPDATE
  USING (is_internal_user());

CREATE POLICY "quotations: vendor reads own"
  ON quotations FOR SELECT
  USING (vendor_id IN (SELECT id FROM vendors WHERE profile_id = auth.uid()));

CREATE POLICY "quotations: vendor inserts own"
  ON quotations FOR INSERT
  TO authenticated
  WITH CHECK (vendor_id IN (SELECT id FROM vendors WHERE profile_id = auth.uid()));

CREATE POLICY "quotations: vendor updates own draft"
  ON quotations FOR UPDATE
  USING (
    vendor_id IN (SELECT id FROM vendors WHERE profile_id = auth.uid())
    AND status IN ('draft', 'submitted')
  )
  WITH CHECK (vendor_id IN (SELECT id FROM vendors WHERE profile_id = auth.uid()));

-- ─── quotation_line_items ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS quotation_line_items (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quotation_id  uuid NOT NULL REFERENCES quotations(id) ON DELETE CASCADE,
  description   text NOT NULL,
  quantity      numeric NOT NULL CHECK (quantity > 0),
  unit_price    numeric NOT NULL CHECK (unit_price >= 0),
  tax_rate      numeric NOT NULL DEFAULT 0 CHECK (tax_rate >= 0 AND tax_rate <= 100),
  total         numeric GENERATED ALWAYS AS (quantity * unit_price * (1 + tax_rate / 100)) STORED,
  remarks       text,
  created_at    timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_qli_quotation ON quotation_line_items(quotation_id);

ALTER TABLE quotation_line_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "qli: internal users read all"
  ON quotation_line_items FOR SELECT
  USING (is_internal_user());

CREATE POLICY "qli: vendor reads own"
  ON quotation_line_items FOR SELECT
  USING (
    quotation_id IN (
      SELECT id FROM quotations
      WHERE vendor_id IN (SELECT id FROM vendors WHERE profile_id = auth.uid())
    )
  );

CREATE POLICY "qli: vendor inserts own"
  ON quotation_line_items FOR INSERT
  TO authenticated
  WITH CHECK (
    quotation_id IN (
      SELECT id FROM quotations
      WHERE vendor_id IN (SELECT id FROM vendors WHERE profile_id = auth.uid())
        AND status IN ('draft', 'submitted')
    )
  );

CREATE POLICY "qli: vendor deletes own draft"
  ON quotation_line_items FOR DELETE
  USING (
    quotation_id IN (
      SELECT id FROM quotations
      WHERE vendor_id IN (SELECT id FROM vendors WHERE profile_id = auth.uid())
        AND status = 'draft'
    )
  );

CREATE POLICY "qli: internal users delete"
  ON quotation_line_items FOR DELETE
  USING (is_internal_user());
