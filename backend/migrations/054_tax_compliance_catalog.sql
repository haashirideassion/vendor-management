-- Vendor Onboarding Redesign, Phase 2: Tax & Compliance catalog.
--
-- Adds tax_registrations (PAN/GSTIN/VAT/EIN..., scoped to a Legal Entity +
-- country pair, not just the entity), a country-driven compliance_requirements
-- catalog + compliance_registrations against it (CIN/TAN/MSME for India,
-- extensible to other countries without a schema change), and tax_exceptions
-- (the properly-modeled "Exception Details" requirement -- covers LDC-style
-- lower-deduction certificates, not five flat fields).
--
-- Verification is intentionally shallow here: a plain `verification_status`
-- column, no FK to a `verifications` table -- that generic model is Phase 3.
-- Phase 3 will ALTER these tables to add `verification_id` and backfill it
-- from the status/verified_by/verified_at columns added here, then those
-- columns can be retired. Doing it this way lets Phase 2 be reviewed and run
-- standalone rather than bundled with the verification framework.
--
-- TDS Sector (confirmed: a fixed, hardcoded catalog, NOT a configurable
-- table) is added as a single nullable column on legal_entities with a CHECK
-- constraint enumerating the sections -- the constraint IS the "static
-- catalog," deliberately not a separate reference table a tenant could edit.
-- The list below is illustrative; adjusting it is a migration, by design.

-- ─── legal_entities: GST exemption + TDS sector ────────────────────────────
-- GST exemption is a fact about the entity (it may have no GSTIN row at all
-- yet still be legitimately exempt -- foreign/individual/no-GST-applicable),
-- so it lives here rather than requiring a tax_registrations row to exist.
ALTER TABLE legal_entities ADD COLUMN IF NOT EXISTS gst_exempt boolean NOT NULL DEFAULT false;
ALTER TABLE legal_entities ADD COLUMN IF NOT EXISTS gst_exemption_reason text;
ALTER TABLE legal_entities ADD COLUMN IF NOT EXISTS gst_exemption_set_by uuid REFERENCES profiles(id);
ALTER TABLE legal_entities ADD COLUMN IF NOT EXISTS gst_exemption_set_at timestamptz;

ALTER TABLE legal_entities ADD COLUMN IF NOT EXISTS tds_section text;
ALTER TABLE legal_entities DROP CONSTRAINT IF EXISTS legal_entities_tds_section_check;
ALTER TABLE legal_entities ADD CONSTRAINT legal_entities_tds_section_check
  CHECK (tds_section IS NULL OR tds_section IN (
    '194A', -- Interest other than on securities
    '194C', -- Payments to contractors
    '194H', -- Commission or brokerage
    '194I', -- Rent
    '194J', -- Fees for professional or technical services
    '194Q'  -- Purchase of goods
  ));

-- ─── tax_registrations ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tax_registrations (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  legal_entity_id    uuid NOT NULL REFERENCES legal_entities(id) ON DELETE CASCADE,
  registration_type  text NOT NULL CHECK (registration_type IN ('PAN', 'GSTIN', 'VAT', 'EIN', 'OTHER')),
  country            text NOT NULL,
  -- Only meaningful for GSTIN (one per state the entity is registered in
  -- within a country) -- null for PAN/VAT/EIN.
  state              text,
  registration_value text NOT NULL,
  status             text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'superseded')),
  verification_status text NOT NULL DEFAULT 'not_verified'
                        CHECK (verification_status IN ('not_verified', 'pending', 'verified', 'failed', 'manual_review')),
  verified_by        uuid REFERENCES profiles(id),
  verified_at        timestamptz,
  created_at         timestamptz DEFAULT now(),
  updated_at         timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tax_registrations_legal_entity_id ON tax_registrations(legal_entity_id);
CREATE INDEX IF NOT EXISTS idx_tax_registrations_type_value ON tax_registrations(registration_type, registration_value);

DROP TRIGGER IF EXISTS tax_registrations_set_updated_at ON tax_registrations;
CREATE TRIGGER tax_registrations_set_updated_at
  BEFORE UPDATE ON tax_registrations
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Backfill from the existing flat vendors columns into each vendor's default
-- Legal Entity -- verification_status stays 'not_verified' deliberately
-- (no fabricated "Verified" history for legacy data, per the confirmed
-- migration approach).
INSERT INTO tax_registrations (legal_entity_id, registration_type, country, registration_value)
SELECT le.id, 'PAN', le.registered_country, v.pan_number
FROM legal_entities le
JOIN vendors v ON v.id = le.vendor_id
WHERE le.is_default AND v.pan_number IS NOT NULL AND v.pan_number <> ''
  AND NOT EXISTS (
    SELECT 1 FROM tax_registrations tr
    WHERE tr.legal_entity_id = le.id AND tr.registration_type = 'PAN'
  );

INSERT INTO tax_registrations (legal_entity_id, registration_type, country, registration_value)
SELECT le.id, 'GSTIN', le.registered_country, v.tax_gst_number
FROM legal_entities le
JOIN vendors v ON v.id = le.vendor_id
WHERE le.is_default AND v.tax_gst_number IS NOT NULL AND v.tax_gst_number <> ''
  AND NOT EXISTS (
    SELECT 1 FROM tax_registrations tr
    WHERE tr.legal_entity_id = le.id AND tr.registration_type = 'GSTIN'
  );

-- ─── compliance_requirements (catalog, country-driven) ─────────────────────
CREATE TABLE IF NOT EXISTS compliance_requirements (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  country           text NOT NULL,
  code              text NOT NULL,
  label             text NOT NULL,
  mandatory         boolean NOT NULL DEFAULT false,
  requires_document boolean NOT NULL DEFAULT false,
  active            boolean NOT NULL DEFAULT true,
  created_at        timestamptz DEFAULT now(),
  UNIQUE (country, code)
);

-- Seed: India catalog. All three confirmed optional (mandatory = false) --
-- CIN applies to India companies only, TAN capture-only (no rate logic
-- hangs on it per the confirmed decision), MSME self-declared + document.
INSERT INTO compliance_requirements (country, code, label, mandatory, requires_document) VALUES
  ('India', 'CIN',  'Corporate Identification Number', false, false),
  ('India', 'TAN',  'Tax Deduction Account Number',     false, false),
  ('India', 'MSME', 'MSME / Udyam Registration',        false, true)
ON CONFLICT (country, code) DO NOTHING;

-- ─── compliance_registrations ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS compliance_registrations (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  legal_entity_id      uuid NOT NULL REFERENCES legal_entities(id) ON DELETE CASCADE,
  requirement_id       uuid NOT NULL REFERENCES compliance_requirements(id),
  registration_value   text NOT NULL,
  status               text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  verification_status  text NOT NULL DEFAULT 'not_verified'
                         CHECK (verification_status IN ('not_verified', 'pending', 'verified', 'failed', 'manual_review')),
  verified_by          uuid REFERENCES profiles(id),
  verified_at          timestamptz,
  created_at           timestamptz DEFAULT now(),
  updated_at           timestamptz DEFAULT now(),
  UNIQUE (legal_entity_id, requirement_id)
);

CREATE INDEX IF NOT EXISTS idx_compliance_registrations_legal_entity_id ON compliance_registrations(legal_entity_id);

DROP TRIGGER IF EXISTS compliance_registrations_set_updated_at ON compliance_registrations;
CREATE TRIGGER compliance_registrations_set_updated_at
  BEFORE UPDATE ON compliance_registrations
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─── tax_exceptions (LDC / withholding-exemption style records) ────────────
-- Deliberately not "5 flat fields" -- a proper record type supporting
-- multiple concurrent exceptions per entity, with its own approval trail.
-- Certificate document attachment deferred to Phase 5 (generic Document
-- model doesn't exist yet); add that FK via ALTER TABLE then.
CREATE TABLE IF NOT EXISTS tax_exceptions (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  legal_entity_id    uuid NOT NULL REFERENCES legal_entities(id) ON DELETE CASCADE,
  tax_registration_id uuid REFERENCES tax_registrations(id),
  exception_type     text NOT NULL CHECK (exception_type IN ('lower_deduction_certificate', 'withholding_treaty_exemption', 'other')),
  amount             numeric,
  rate_percent       numeric,
  currency           text NOT NULL DEFAULT 'INR',
  effective_from     date,
  effective_to       date,
  approval_status    text NOT NULL DEFAULT 'pending' CHECK (approval_status IN ('pending', 'approved', 'rejected')),
  approved_by        uuid REFERENCES profiles(id),
  approved_at        timestamptz,
  created_at         timestamptz DEFAULT now(),
  updated_at         timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tax_exceptions_legal_entity_id ON tax_exceptions(legal_entity_id);

DROP TRIGGER IF EXISTS tax_exceptions_set_updated_at ON tax_exceptions;
CREATE TRIGGER tax_exceptions_set_updated_at
  BEFORE UPDATE ON tax_exceptions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─── RLS (defense-in-depth, matches Phase 1's shape) ───────────────────────
ALTER TABLE tax_registrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE compliance_requirements ENABLE ROW LEVEL SECURITY;
ALTER TABLE compliance_registrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE tax_exceptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tax_registrations: vendor reads own via entity, admin all"
  ON tax_registrations FOR SELECT
  USING (
    is_admin() OR EXISTS (
      SELECT 1 FROM legal_entities le
      JOIN vendor_users vu ON vu.vendor_id = le.vendor_id
      WHERE le.id = tax_registrations.legal_entity_id
        AND vu.profile_id = auth.uid() AND vu.status = 'active'
    )
  );
CREATE POLICY "tax_registrations: admin manages all" ON tax_registrations FOR ALL USING (is_admin()) WITH CHECK (is_admin());

CREATE POLICY "compliance_requirements: anyone authenticated reads catalog"
  ON compliance_requirements FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "compliance_requirements: admin manages catalog" ON compliance_requirements FOR ALL USING (is_admin()) WITH CHECK (is_admin());

CREATE POLICY "compliance_registrations: vendor reads own via entity, admin all"
  ON compliance_registrations FOR SELECT
  USING (
    is_admin() OR EXISTS (
      SELECT 1 FROM legal_entities le
      JOIN vendor_users vu ON vu.vendor_id = le.vendor_id
      WHERE le.id = compliance_registrations.legal_entity_id
        AND vu.profile_id = auth.uid() AND vu.status = 'active'
    )
  );
CREATE POLICY "compliance_registrations: admin manages all" ON compliance_registrations FOR ALL USING (is_admin()) WITH CHECK (is_admin());

CREATE POLICY "tax_exceptions: vendor reads own via entity, admin all"
  ON tax_exceptions FOR SELECT
  USING (
    is_admin() OR EXISTS (
      SELECT 1 FROM legal_entities le
      JOIN vendor_users vu ON vu.vendor_id = le.vendor_id
      WHERE le.id = tax_exceptions.legal_entity_id
        AND vu.profile_id = auth.uid() AND vu.status = 'active'
    )
  );
CREATE POLICY "tax_exceptions: admin manages all" ON tax_exceptions FOR ALL USING (is_admin()) WITH CHECK (is_admin());
