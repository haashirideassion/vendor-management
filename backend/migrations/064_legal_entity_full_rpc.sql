-- Vendor Onboarding Redesign, Phase 7 Step B: create_legal_entity_full RPC.
--
-- Mirrors the existing "create X with nested children" atomic-operation
-- pattern (create_vendor_with_categories, create_po_with_line_items,
-- create_engagement_full -- 006_atomic_operations.sql) rather than doing
-- several sequential Supabase-client inserts from the route layer.
--
-- This is specifically for the MNC "operates through more than one legal
-- entity" case -- adding an ADDITIONAL, non-default entity. The vendor's
-- one default entity is created automatically at signup by
-- ensureDefaultLegalEntity() (legalEntity.service.ts, Phase 7 Step A); this
-- RPC is never used for that one.

CREATE OR REPLACE FUNCTION create_legal_entity_full(
  p_vendor_id            uuid,
  p_registered_country   text,
  p_legal_name           text,
  p_registration_number  text,
  p_entity_type          text,
  p_operating_countries  jsonb, -- array of country strings
  p_tax_registrations    jsonb, -- array of {registration_type, country, state, registration_value}
  p_bank_accounts        jsonb  -- array of {country, currency, bank_name, account_number, ifsc, swift_bic, iban, beneficiary_name, is_primary}
) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE
  v_entity_id uuid;
  v_bank_item jsonb;
  v_primary_used boolean := false;
BEGIN
  INSERT INTO legal_entities (vendor_id, registered_country, legal_name, registration_number, entity_type, is_default)
  VALUES (p_vendor_id, p_registered_country, p_legal_name, p_registration_number, COALESCE(p_entity_type, 'company'), false)
  RETURNING id INTO v_entity_id;

  -- The registered country is always an operating country too, even if the
  -- caller's operating-countries list forgot to include it.
  INSERT INTO legal_entity_operating_countries (legal_entity_id, country)
  VALUES (v_entity_id, p_registered_country)
  ON CONFLICT (legal_entity_id, country) DO NOTHING;

  IF p_operating_countries IS NOT NULL AND jsonb_array_length(p_operating_countries) > 0 THEN
    INSERT INTO legal_entity_operating_countries (legal_entity_id, country)
    SELECT v_entity_id, value
    FROM jsonb_array_elements_text(p_operating_countries) AS value
    ON CONFLICT (legal_entity_id, country) DO NOTHING;
  END IF;

  IF p_tax_registrations IS NOT NULL AND jsonb_array_length(p_tax_registrations) > 0 THEN
    INSERT INTO tax_registrations (legal_entity_id, registration_type, country, state, registration_value)
    SELECT
      v_entity_id,
      item->>'registration_type',
      item->>'country',
      item->>'state',
      item->>'registration_value'
    FROM jsonb_array_elements(p_tax_registrations) AS item
    WHERE item->>'registration_value' IS NOT NULL AND item->>'registration_value' <> '';
  END IF;

  -- Looped, not a set-based INSERT ... SELECT -- bank_accounts has a
  -- partial unique index enforcing at most one is_primary=true row per
  -- entity (uq_bank_accounts_one_primary_per_entity, 056). If the caller
  -- accidentally marks more than one account primary, only the first one
  -- requested wins; the rest are forced false rather than letting the whole
  -- entity creation fail on a unique-violation.
  IF p_bank_accounts IS NOT NULL AND jsonb_array_length(p_bank_accounts) > 0 THEN
    FOR v_bank_item IN SELECT value FROM jsonb_array_elements(p_bank_accounts) AS value LOOP
      IF v_bank_item->>'account_number' IS NULL OR v_bank_item->>'account_number' = '' THEN
        CONTINUE;
      END IF;

      INSERT INTO bank_accounts (legal_entity_id, country, currency, bank_name, account_number, ifsc, swift_bic, iban, beneficiary_name, is_primary)
      VALUES (
        v_entity_id,
        v_bank_item->>'country',
        COALESCE(v_bank_item->>'currency', 'INR'),
        v_bank_item->>'bank_name',
        v_bank_item->>'account_number',
        v_bank_item->>'ifsc',
        v_bank_item->>'swift_bic',
        v_bank_item->>'iban',
        v_bank_item->>'beneficiary_name',
        COALESCE((v_bank_item->>'is_primary')::boolean, false) AND NOT v_primary_used
      );

      IF COALESCE((v_bank_item->>'is_primary')::boolean, false) THEN
        v_primary_used := true;
      END IF;
    END LOOP;
  END IF;

  RETURN v_entity_id;
END;
$$;
