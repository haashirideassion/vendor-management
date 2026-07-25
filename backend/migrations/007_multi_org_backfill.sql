-- Phase 2 (multi-org migration): backfill organization_members and
-- organization_vendors, which exist in the live schema but were never
-- populated or captured in a committed migration.
--
-- Legacy vendors.org_id / vendors.status columns are intentionally left in
-- place here — app code (backend/src/routes/vendors.ts and friends) still
-- reads/writes them. Drop them in a later phase once the app is migrated to
-- read status/org linkage from organization_vendors instead.

-- ─── Backfill organization_members from existing internal (non-vendor) profiles ─
-- Vendor-role profiles are NOT added here: a vendor's relationship to an org is
-- tracked via organization_vendors (vendor_id + org_id), not organization_members.
INSERT INTO organization_members (org_id, profile_id, org_role, is_primary)
SELECT
  '00000000-0000-0000-0000-000000000001',
  p.id,
  CASE WHEN p.role IN ('admin', 'super_admin') THEN 'org_admin' ELSE p.role END,
  true
FROM profiles p
WHERE p.role <> 'vendor'
ON CONFLICT DO NOTHING;

-- ─── Backfill organization_vendors from existing vendors ─────────────────────
-- assign_org_vendor_id_trigger only fires BEFORE UPDATE (not INSERT), so we
-- replicate its logic here manually for the initial backfill: prefix is the
-- first 3 letters of the org slug, uppercased; org_seq is per-org sequential.
WITH org_slug AS (
  SELECT upper(left(slug, 3)) AS prefix
  FROM organizations
  WHERE id = '00000000-0000-0000-0000-000000000001'
),
numbered_vendors AS (
  SELECT
    v.id AS vendor_id,
    v.status,
    row_number() OVER (ORDER BY v.created_at) AS seq
  FROM vendors v
)
INSERT INTO organization_vendors (
  org_id, vendor_id, status, vendor_id_code, org_seq,
  contract_start_date, contract_anniversary
)
SELECT
  '00000000-0000-0000-0000-000000000001',
  nv.vendor_id,
  nv.status,
  CASE WHEN nv.status = 'active'
    THEN (SELECT prefix FROM org_slug) || '-' || LPAD(nv.seq::text, 4, '0')
    ELSE NULL
  END,
  CASE WHEN nv.status = 'active' THEN nv.seq ELSE NULL END,
  CASE WHEN nv.status = 'active' THEN CURRENT_DATE ELSE NULL END,
  CASE WHEN nv.status = 'active' THEN CURRENT_DATE + INTERVAL '1 year' ELSE NULL END
FROM numbered_vendors nv
ON CONFLICT DO NOTHING;

-- ─── Fix: create_engagement_full never set org_id on any insert, and would ─
-- violate the NOT NULL org_id constraint added to engagements/rfqs/
-- approval_requests since this function was first written. Add p_org_id.
CREATE OR REPLACE FUNCTION create_engagement_full(
  p_title           text,
  p_description     text,
  p_category_id     uuid,
  p_estimated_value numeric,
  p_currency        text,
  p_start_date      date,
  p_end_date        date,
  p_notes           text,
  p_created_by      uuid,
  p_vendor_ids      jsonb,
  p_line_items      jsonb,
  p_org_id          uuid
) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE
  v_eng_id uuid;
BEGIN
  INSERT INTO engagements (
    title, description, category_id, estimated_value,
    currency, start_date, end_date, notes, created_by, status, org_id
  ) VALUES (
    p_title, p_description, p_category_id, p_estimated_value,
    p_currency, p_start_date, p_end_date, p_notes, p_created_by, 'draft', p_org_id
  )
  RETURNING id INTO v_eng_id;

  IF p_line_items IS NOT NULL AND jsonb_array_length(p_line_items) > 0 THEN
    INSERT INTO engagement_line_items (engagement_id, description, quantity, unit_price, total_price)
    SELECT
      v_eng_id,
      (item->>'description')::text,
      (item->>'quantity')::numeric,
      (item->>'unit_price')::numeric,
      (item->>'total_price')::numeric
    FROM jsonb_array_elements(p_line_items) AS item;
  END IF;

  IF p_vendor_ids IS NOT NULL AND jsonb_array_length(p_vendor_ids) > 0 THEN
    INSERT INTO engagement_vendors (engagement_id, vendor_id)
    SELECT v_eng_id, (elem::text)::uuid
    FROM jsonb_array_elements_text(p_vendor_ids) AS elem;

    INSERT INTO rfqs (engagement_id, vendor_id, status, org_id)
    SELECT v_eng_id, (elem::text)::uuid, 'pending', p_org_id
    FROM jsonb_array_elements_text(p_vendor_ids) AS elem
    ON CONFLICT (engagement_id, vendor_id) DO UPDATE SET status = 'pending';
  END IF;

  INSERT INTO approval_requests (entity_type, entity_id, requested_by, amount, notes, org_id)
  VALUES ('engagement', v_eng_id, p_created_by, p_estimated_value, NULL, p_org_id);

  UPDATE engagements SET status = 'pending_approval' WHERE id = v_eng_id;

  RETURN v_eng_id;
END;
$$;
