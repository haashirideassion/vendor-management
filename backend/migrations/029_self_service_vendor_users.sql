-- Phase 5 (vendor-side frontend): create_vendor_with_categories (self-service
-- /api/vendors/create) has never been updated since the RBAC/multi-user
-- cutover (017-021) to also create a vendor_users row for the signing-up
-- profile. Every vendor created through self-service signup since then has
-- zero vendor_users rows, so resolveVendorId() -- the resolver every
-- vendor-scoped list endpoint and all of vendor-users.ts depend on -- returns
-- null for them, even though vendors.profile_id is set correctly. The two
-- live vendor accounts predate this gap and were separately backfilled by
-- 020_rbac_backfill.sql, so nothing to backfill here -- this only fixes the
-- write path going forward.

CREATE OR REPLACE FUNCTION create_vendor_with_categories(
  p_profile_id        uuid,
  p_company_name      text,
  p_contact_name      text,
  p_contact_email     text,
  p_contact_phone     text,
  p_tax_gst_number    text,
  p_bank_name         text,
  p_bank_account_number text,
  p_bank_routing_number text,
  p_category_ids      uuid[]
) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE
  v_vendor_id uuid;
  v_vendor_user_id uuid;
  v_admin_role_id uuid;
BEGIN
  INSERT INTO vendors (
    profile_id, company_name, contact_name, contact_email,
    contact_phone, tax_gst_number, bank_name, bank_account_number,
    bank_routing_number, status
  ) VALUES (
    p_profile_id, p_company_name, p_contact_name, p_contact_email,
    p_contact_phone, p_tax_gst_number, p_bank_name, p_bank_account_number,
    p_bank_routing_number, 'pending_review'
  )
  RETURNING id INTO v_vendor_id;

  IF p_category_ids IS NOT NULL AND array_length(p_category_ids, 1) > 0 THEN
    INSERT INTO vendor_categories (vendor_id, category_id)
    SELECT v_vendor_id, unnest(p_category_ids);
  END IF;

  IF p_profile_id IS NOT NULL THEN
    INSERT INTO vendor_users (vendor_id, profile_id, status, is_primary)
    VALUES (v_vendor_id, p_profile_id, 'active', true)
    RETURNING id INTO v_vendor_user_id;

    SELECT id INTO v_admin_role_id FROM roles WHERE scope = 'vendor' AND name = 'Admin';
    IF v_admin_role_id IS NOT NULL THEN
      INSERT INTO vendor_user_roles (vendor_user_id, role_id) VALUES (v_vendor_user_id, v_admin_role_id);
    END IF;
  END IF;

  RETURN v_vendor_id;
END;
$$;
