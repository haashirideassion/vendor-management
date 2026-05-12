-- ─── Sequence for auto-generated contract references ─────────────────────────
CREATE SEQUENCE IF NOT EXISTS contract_seq START 1;

-- ─── contracts ────────────────────────────────────────────────────────────────
-- Proper contract management: MSA, SOW, NDA per vendor
-- Keeps existing vendors.contract_start_date / contract_anniversary untouched
-- (still used by the renewal cron for backward compatibility)
CREATE TABLE IF NOT EXISTS contracts (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_ref        text UNIQUE,                            -- CON-YYYY-NNNN (auto)
  vendor_id           uuid NOT NULL REFERENCES vendors(id),
  parent_id           uuid REFERENCES contracts(id),          -- SOW → MSA linkage
  contract_type       text NOT NULL
                        CHECK (contract_type IN ('msa', 'sow', 'nda', 'other')),
  title               text NOT NULL,
  status              text NOT NULL DEFAULT 'draft'
                        CHECK (status IN ('draft', 'active', 'expired', 'terminated')),
  version             integer NOT NULL DEFAULT 1,
  effective_date      date,
  expiry_date         date,
  total_value         numeric,
  currency            text DEFAULT 'INR',
  auto_renew          boolean DEFAULT false,
  renewal_notice_days integer DEFAULT 30,                     -- days before expiry to alert
  signed_by_vendor    boolean DEFAULT false,
  signed_by_internal  boolean DEFAULT false,
  signed_at           timestamptz,
  storage_path        text,                                   -- uploaded contract PDF
  notes               text,
  created_by          uuid NOT NULL REFERENCES profiles(id),
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_contracts_vendor   ON contracts(vendor_id);
CREATE INDEX IF NOT EXISTS idx_contracts_status   ON contracts(status);
CREATE INDEX IF NOT EXISTS idx_contracts_type     ON contracts(contract_type);
CREATE INDEX IF NOT EXISTS idx_contracts_expiry   ON contracts(expiry_date) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_contracts_parent   ON contracts(parent_id);

-- Auto-generate contract_ref: CON-YYYY-NNNN
CREATE OR REPLACE FUNCTION assign_contract_ref()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.contract_ref IS NULL THEN
    NEW.contract_ref := 'CON-' || TO_CHAR(NOW(), 'YYYY') || '-' || LPAD(nextval('contract_seq')::text, 4, '0');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_contract_ref ON contracts;
CREATE TRIGGER set_contract_ref
  BEFORE INSERT ON contracts
  FOR EACH ROW EXECUTE FUNCTION assign_contract_ref();

DROP TRIGGER IF EXISTS contracts_set_updated_at ON contracts;
CREATE TRIGGER contracts_set_updated_at
  BEFORE UPDATE ON contracts
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE OR REPLACE FUNCTION log_contract_status_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NEW.status <> OLD.status THEN
    INSERT INTO audit_log (entity_type, entity_id, action, old_value, new_value, performed_by)
    VALUES ('contract', NEW.id, 'status_changed',
      jsonb_build_object('status', OLD.status),
      jsonb_build_object('status', NEW.status),
      auth.uid());
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS contract_audit ON contracts;
CREATE TRIGGER contract_audit
  AFTER UPDATE ON contracts
  FOR EACH ROW EXECUTE FUNCTION log_contract_status_change();

-- ─── contract_amendments ──────────────────────────────────────────────────────
-- Track amendments / addendums to a contract over time
CREATE TABLE IF NOT EXISTS contract_amendments (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id      uuid NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  amendment_number integer NOT NULL,
  title            text NOT NULL,
  description      text,
  effective_date   date,
  storage_path     text,
  created_by       uuid NOT NULL REFERENCES profiles(id),
  created_at       timestamptz DEFAULT now(),
  UNIQUE (contract_id, amendment_number)
);

CREATE INDEX IF NOT EXISTS idx_amendments_contract ON contract_amendments(contract_id);

-- ─── Link contracts to engagements and purchase orders ────────────────────────
ALTER TABLE engagements     ADD COLUMN IF NOT EXISTS contract_id uuid REFERENCES contracts(id) ON DELETE SET NULL;
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS contract_id uuid REFERENCES contracts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_engagements_contract ON engagements(contract_id);
CREATE INDEX IF NOT EXISTS idx_po_contract          ON purchase_orders(contract_id);

-- ─── RLS ──────────────────────────────────────────────────────────────────────
ALTER TABLE contracts           ENABLE ROW LEVEL SECURITY;
ALTER TABLE contract_amendments ENABLE ROW LEVEL SECURITY;

-- contracts: internal users read all; vendor reads own
CREATE POLICY "contracts: internal users read all"
  ON contracts FOR SELECT USING (is_internal_user());

CREATE POLICY "contracts: vendor reads own"
  ON contracts FOR SELECT
  USING (vendor_id IN (SELECT id FROM vendors WHERE profile_id = auth.uid()));

CREATE POLICY "contracts: internal users insert"
  ON contracts FOR INSERT TO authenticated
  WITH CHECK (is_internal_user() AND created_by = auth.uid());

CREATE POLICY "contracts: internal users update"
  ON contracts FOR UPDATE USING (is_internal_user());

-- contract_amendments: follows parent contract access
CREATE POLICY "amendments: internal users read all"
  ON contract_amendments FOR SELECT USING (is_internal_user());

CREATE POLICY "amendments: vendor reads own"
  ON contract_amendments FOR SELECT
  USING (contract_id IN (
    SELECT id FROM contracts
    WHERE vendor_id IN (SELECT id FROM vendors WHERE profile_id = auth.uid())
  ));

CREATE POLICY "amendments: internal users insert"
  ON contract_amendments FOR INSERT TO authenticated
  WITH CHECK (is_internal_user() AND created_by = auth.uid());

CREATE POLICY "amendments: internal users update"
  ON contract_amendments FOR UPDATE USING (is_internal_user());
