-- Vendor Onboarding Redesign, Phase 1: Legal Entity core + migration.
--
-- Scope is deliberately narrow -- per the agreed phasing, this migration adds
-- ONLY the Legal Entity layer (entity identity, registered country, operating
-- countries, addresses) and backfills it from the existing `vendors` row.
-- Tax/compliance registrations, banking, documents and contacts are separate
-- entities added in Phases 2, 4, 5 and 6 respectively -- they are NOT created
-- here, to keep each phase independently reviewable.
--
-- `vendors` itself is NOT renamed to `vendor_group` or otherwise altered
-- structurally: it is the most-referenced table in the schema (vendor_id FKs
-- span vendor_categories, vendor_documents, vendor_ratings, vendor_services,
-- organization_vendors, vendor_users, engagement_vendors, purchase_orders,
-- grns, invoices, rfqs, quotations, vendor_user_assignments...). Renaming it
-- for a conceptual relabel only (vendors ARE "VendorGroup" now) would be the
-- same high-blast-radius, zero-functional-benefit move flagged and rejected
-- for the Engagement->PR rename. `vendors.legal_name` and
-- `vendors.registration_number` (027_vendor_onboarding_fields.sql) are left
-- in place for now as the columns existing routes still read/write --
-- retiring them in favour of the new legal_entities columns is a follow-up
-- cleanup once those routes are cut over, not part of this migration.
--
-- A vendor with today's single flat profile becomes exactly one
-- legal_entities row (its "default" entity) -- Phase 7 is what lets the UI
-- add more; nothing here requires the onboarding wizard to change yet.

-- ─── legal_entities ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS legal_entities (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id              uuid NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  parent_legal_entity_id uuid REFERENCES legal_entities(id),
  registered_country     text NOT NULL,
  legal_name             text,
  registration_number    text,
  -- Derived at backfill time from vendors.is_solo_user; self-declared by the
  -- vendor going forward once Phase 7's UI exists. Deliberately just these
  -- two values for now -- the onboarding blueprint's "individual vs company"
  -- distinction is what drives risk classification (onboarding-authority
  -- spec) and India-only compliance fields (CIN etc., Phase 2); no other
  -- entity_type has a concrete consumer yet.
  entity_type            text NOT NULL DEFAULT 'company'
                           CHECK (entity_type IN ('individual', 'company')),
  status                 text NOT NULL DEFAULT 'active'
                           CHECK (status IN ('active', 'inactive')),
  is_default             boolean NOT NULL DEFAULT false,
  created_at             timestamptz DEFAULT now(),
  updated_at             timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_legal_entities_vendor_id ON legal_entities(vendor_id);

-- Exactly one default entity per vendor (the one every existing vendor gets
-- via backfill, and what a small-business self-onboarding vendor gets
-- silently created for them -- see onboarding blueprint Section C/point 9).
CREATE UNIQUE INDEX IF NOT EXISTS uq_legal_entities_one_default_per_vendor
  ON legal_entities(vendor_id) WHERE is_default;

DROP TRIGGER IF EXISTS legal_entities_set_updated_at ON legal_entities;
CREATE TRIGGER legal_entities_set_updated_at
  BEFORE UPDATE ON legal_entities
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─── legal_entity_operating_countries ──────────────────────────────────────
-- 1:N, deliberately separate from registered_country (a Legal Entity can
-- operate in countries it isn't incorporated in -- confirmed correction to
-- the earlier "Legal Entity = one country" draft).
CREATE TABLE IF NOT EXISTS legal_entity_operating_countries (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  legal_entity_id  uuid NOT NULL REFERENCES legal_entities(id) ON DELETE CASCADE,
  country          text NOT NULL,
  added_at         timestamptz DEFAULT now(),
  UNIQUE (legal_entity_id, country)
);

CREATE INDEX IF NOT EXISTS idx_leoc_legal_entity_id ON legal_entity_operating_countries(legal_entity_id);

-- ─── legal_entity_addresses ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS legal_entity_addresses (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  legal_entity_id  uuid NOT NULL REFERENCES legal_entities(id) ON DELETE CASCADE,
  address_type     text NOT NULL CHECK (address_type IN ('registered', 'billing', 'service')),
  country          text NOT NULL,
  state            text,
  city             text,
  postal_code      text,
  line1            text,
  line2            text,
  created_at       timestamptz DEFAULT now(),
  updated_at       timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lea_legal_entity_id ON legal_entity_addresses(legal_entity_id);

DROP TRIGGER IF EXISTS legal_entity_addresses_set_updated_at ON legal_entity_addresses;
CREATE TRIGGER legal_entity_addresses_set_updated_at
  BEFORE UPDATE ON legal_entity_addresses
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─── Backfill: one default Legal Entity per existing vendor ────────────────
-- registered_country defaults to India -- the only market the current schema
-- supports; entity_type derived from is_solo_user (real signal already on
-- the row, per 032_vendor_solo_and_group_code.sql), not guessed. legal_name /
-- registration_number carried over verbatim, including NULL where absent --
-- no fabricated placeholder values.
INSERT INTO legal_entities (vendor_id, registered_country, legal_name, registration_number, entity_type, is_default)
SELECT
  v.id,
  'India',
  v.legal_name,
  v.registration_number,
  CASE WHEN v.is_solo_user THEN 'individual' ELSE 'company' END,
  true
FROM vendors v
WHERE NOT EXISTS (
  SELECT 1 FROM legal_entities le WHERE le.vendor_id = v.id AND le.is_default
);

-- Every default Legal Entity operates in (at least) its registered country.
INSERT INTO legal_entity_operating_countries (legal_entity_id, country)
SELECT le.id, le.registered_country
FROM legal_entities le
WHERE le.is_default
ON CONFLICT (legal_entity_id, country) DO NOTHING;

-- ─── RLS ────────────────────────────────────────────────────────────────────
-- Defense-in-depth only, matching the vendors table's own policy shape --
-- the Express backend runs under the service-role key and is the actual
-- enforcement point (route-level authorization is a later phase, tracked
-- against the RBAC/onboarding-authority specs, not this migration).
ALTER TABLE legal_entities ENABLE ROW LEVEL SECURITY;
ALTER TABLE legal_entity_operating_countries ENABLE ROW LEVEL SECURITY;
ALTER TABLE legal_entity_addresses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "legal_entities: vendor reads own, admin reads all"
  ON legal_entities FOR SELECT
  USING (
    is_admin() OR EXISTS (
      SELECT 1 FROM vendor_users vu
      WHERE vu.vendor_id = legal_entities.vendor_id
        AND vu.profile_id = auth.uid()
        AND vu.status = 'active'
    )
  );

CREATE POLICY "legal_entities: admin manages all"
  ON legal_entities FOR ALL
  USING (is_admin())
  WITH CHECK (is_admin());

CREATE POLICY "legal_entity_operating_countries: readable via parent entity"
  ON legal_entity_operating_countries FOR SELECT
  USING (
    is_admin() OR EXISTS (
      SELECT 1 FROM legal_entities le
      JOIN vendor_users vu ON vu.vendor_id = le.vendor_id
      WHERE le.id = legal_entity_operating_countries.legal_entity_id
        AND vu.profile_id = auth.uid()
        AND vu.status = 'active'
    )
  );

CREATE POLICY "legal_entity_operating_countries: admin manages all"
  ON legal_entity_operating_countries FOR ALL
  USING (is_admin())
  WITH CHECK (is_admin());

CREATE POLICY "legal_entity_addresses: readable via parent entity"
  ON legal_entity_addresses FOR SELECT
  USING (
    is_admin() OR EXISTS (
      SELECT 1 FROM legal_entities le
      JOIN vendor_users vu ON vu.vendor_id = le.vendor_id
      WHERE le.id = legal_entity_addresses.legal_entity_id
        AND vu.profile_id = auth.uid()
        AND vu.status = 'active'
    )
  );

CREATE POLICY "legal_entity_addresses: admin manages all"
  ON legal_entity_addresses FOR ALL
  USING (is_admin())
  WITH CHECK (is_admin());
