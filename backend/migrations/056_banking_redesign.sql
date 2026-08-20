-- Vendor Onboarding Redesign, Phase 4: Banking redesign.
--
-- bank_accounts replaces the 3 flat columns on vendors (bank_name,
-- bank_account_number, bank_routing_number) with a proper multi-account
-- model per Legal Entity: one marked primary, country-aware fields (IFSC
-- for India, SWIFT/IBAN for international), and a link into Phase 3's
-- generic verification framework ('bank_account' was already reserved as a
-- valid subject_type there).
--
-- Confirmed rule: a bank account does NOT block onboarding completion, but
-- DOES block actual payment disbursement until reviewed/approved -- modeled
-- as `status` here (pending_review/approved/rejected), separate from
-- verification_id's own status, since "we manually checked the account is
-- real" and "we've approved it for use in payments" are different
-- decisions that can happen at different times by different people.
--
-- IMPORTANT, unlike Phase 3's cleanup: vendors.bank_name/
-- bank_account_number/bank_routing_number are NOT dropped here. Phase 3
-- could safely drop its stopgap columns because nothing outside our own
-- migrations ever touched them. These banking columns are still read and
-- written by the live onboarding route today -- dropping them now would
-- break production before that route is cut over to bank_accounts. They
-- stay in place (matching Phase 1's precedent for legal_name/
-- registration_number) until route-layer work migrates off them.
--
-- Masking: full account_number IS stored (masking is a display-layer
-- concern, not a storage-layer one), but account_number_last4 is a stored
-- generated column so masked UI displays never need to fetch/decrypt the
-- full value at all. Any "reveal full number" action must write an
-- audit_log entry (entity_type = 'bank_account', action = 'reveal') at the
-- application layer -- no separate reveal-audit table needed, the existing
-- audit_log already covers this shape.

-- ─── bank_accounts ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bank_accounts (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  legal_entity_id       uuid NOT NULL REFERENCES legal_entities(id) ON DELETE CASCADE,
  is_primary            boolean NOT NULL DEFAULT false,
  country               text NOT NULL,
  currency              text NOT NULL DEFAULT 'INR',
  account_name          text,
  beneficiary_name      text,
  account_number        text NOT NULL,
  account_number_last4  text GENERATED ALWAYS AS (right(account_number, 4)) STORED,
  bank_name             text,
  bank_address          text,
  branch_name           text,
  -- India-specific vs international rails -- both nullable, populate
  -- whichever applies to the account's country. Not enforced by a CHECK
  -- (e.g. "IFSC required if country = India") to avoid hardcoding country
  -- logic into a constraint; that validation belongs in the onboarding
  -- route layer where the full country list already lives.
  ifsc                  text,
  swift_bic             text,
  iban                  text,
  status                text NOT NULL DEFAULT 'pending_review'
                          CHECK (status IN ('pending_review', 'approved', 'rejected')),
  verification_id       uuid REFERENCES verifications(id),
  created_at            timestamptz DEFAULT now(),
  updated_at            timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bank_accounts_legal_entity_id ON bank_accounts(legal_entity_id);

-- Exactly one primary account per Legal Entity (same pattern as
-- legal_entities.is_default from Phase 1).
CREATE UNIQUE INDEX IF NOT EXISTS uq_bank_accounts_one_primary_per_entity
  ON bank_accounts(legal_entity_id) WHERE is_primary;

DROP TRIGGER IF EXISTS bank_accounts_set_updated_at ON bank_accounts;
CREATE TRIGGER bank_accounts_set_updated_at
  BEFORE UPDATE ON bank_accounts
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─── Backfill: one primary account per vendor's default Legal Entity ───────
-- Only inserted if at least one of the 3 legacy fields is non-null --
-- absence stays absence, not a fabricated blank row (confirmed migration
-- approach). bank_routing_number is IFSC in the existing onboarding wizard
-- (Step2TaxBanking's IFSC-format validation), mapped accordingly.
INSERT INTO bank_accounts (legal_entity_id, country, currency, bank_name, account_number, ifsc, is_primary)
SELECT
  le.id,
  le.registered_country,
  'INR',
  v.bank_name,
  v.bank_account_number,
  v.bank_routing_number,
  true
FROM legal_entities le
JOIN vendors v ON v.id = le.vendor_id
WHERE le.is_default
  AND (v.bank_name IS NOT NULL OR v.bank_account_number IS NOT NULL OR v.bank_routing_number IS NOT NULL)
  AND v.bank_account_number IS NOT NULL AND v.bank_account_number <> '' -- account_number is NOT NULL on the new table
  AND NOT EXISTS (
    SELECT 1 FROM bank_accounts ba WHERE ba.legal_entity_id = le.id AND ba.is_primary
  );

-- ─── RLS ────────────────────────────────────────────────────────────────────
ALTER TABLE bank_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "bank_accounts: vendor reads own via entity, admin all"
  ON bank_accounts FOR SELECT
  USING (
    is_admin() OR EXISTS (
      SELECT 1 FROM legal_entities le
      JOIN vendor_users vu ON vu.vendor_id = le.vendor_id
      WHERE le.id = bank_accounts.legal_entity_id
        AND vu.profile_id = auth.uid() AND vu.status = 'active'
    )
  );

CREATE POLICY "bank_accounts: admin manages all" ON bank_accounts FOR ALL USING (is_admin()) WITH CHECK (is_admin());
