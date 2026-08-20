-- Vendor Onboarding Redesign, Phase 6: Contacts.
--
-- Typed multi-contact model replacing the single flat contact_name/
-- contact_email/contact_phone on vendors. Owned at either the Vendor Group
-- level (the default/primary relationship contact) or the Legal Entity
-- level (entity-specific finance/tax/legal contacts) -- polymorphic
-- owner_type/owner_id, same pattern as documents.related_entity_type/id.
--
-- vendors.contact_name/contact_email/contact_phone are NOT dropped -- still
-- read/written by the live onboarding route, same reasoning as every prior
-- phase's legacy-column handling.

-- ─── contacts ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS contacts (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_type   text NOT NULL CHECK (owner_type IN ('vendor', 'legal_entity')),
  owner_id     uuid NOT NULL,
  contact_type text NOT NULL CHECK (contact_type IN (
                 'primary', 'finance', 'tax', 'legal', 'technical', 'emergency'
               )),
  name         text NOT NULL,
  email        text,
  phone        text,
  designation  text,
  is_primary   boolean NOT NULL DEFAULT false,
  active       boolean NOT NULL DEFAULT true,
  created_at   timestamptz DEFAULT now(),
  updated_at   timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_contacts_owner ON contacts(owner_type, owner_id);

-- At most one primary contact per owner (mirrors legal_entities.is_default
-- and bank_accounts.is_primary from earlier phases).
CREATE UNIQUE INDEX IF NOT EXISTS uq_contacts_one_primary_per_owner
  ON contacts(owner_type, owner_id) WHERE is_primary;

DROP TRIGGER IF EXISTS contacts_set_updated_at ON contacts;
CREATE TRIGGER contacts_set_updated_at
  BEFORE UPDATE ON contacts
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─── Backfill: vendors' single flat contact becomes their primary contact ──
INSERT INTO contacts (owner_type, owner_id, contact_type, name, email, phone, is_primary)
SELECT 'vendor', v.id, 'primary', v.contact_name, v.contact_email, v.contact_phone, true
FROM vendors v
WHERE v.contact_name IS NOT NULL AND v.contact_name <> ''
  AND NOT EXISTS (
    SELECT 1 FROM contacts c WHERE c.owner_type = 'vendor' AND c.owner_id = v.id AND c.is_primary
  );

-- ─── RLS ────────────────────────────────────────────────────────────────────
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "contacts: vendor reads own (vendor or legal_entity owned), admin all"
  ON contacts FOR SELECT
  USING (
    is_admin() OR (
      contacts.owner_type = 'vendor' AND EXISTS (
        SELECT 1 FROM vendor_users vu
        WHERE vu.vendor_id = contacts.owner_id
          AND vu.profile_id = auth.uid() AND vu.status = 'active'
      )
    ) OR (
      contacts.owner_type = 'legal_entity' AND EXISTS (
        SELECT 1 FROM legal_entities le
        JOIN vendor_users vu ON vu.vendor_id = le.vendor_id
        WHERE le.id = contacts.owner_id
          AND vu.profile_id = auth.uid() AND vu.status = 'active'
      )
    )
  );

CREATE POLICY "contacts: admin manages all" ON contacts FOR ALL USING (is_admin()) WITH CHECK (is_admin());
