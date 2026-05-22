-- ─── engagement_line_items ────────────────────────────────────────────────────
-- Scope-of-work items defined at engagement creation, visible in RFQ and
-- auto-propagated to PO line items when POs are created.

CREATE TABLE IF NOT EXISTS engagement_line_items (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  engagement_id uuid NOT NULL REFERENCES engagements(id) ON DELETE CASCADE,
  description   text NOT NULL,
  quantity      numeric NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_price    numeric NOT NULL DEFAULT 0 CHECK (unit_price >= 0),
  unit          text,
  created_at    timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_eli_engagement ON engagement_line_items(engagement_id);

ALTER TABLE engagement_line_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "eli: internal users select"
  ON engagement_line_items FOR SELECT
  TO authenticated
  USING (is_internal_user());

CREATE POLICY "eli: internal users insert"
  ON engagement_line_items FOR INSERT
  TO authenticated
  WITH CHECK (is_internal_user());

CREATE POLICY "eli: internal users update"
  ON engagement_line_items FOR UPDATE
  TO authenticated
  USING (is_internal_user())
  WITH CHECK (is_internal_user());

CREATE POLICY "eli: internal users delete"
  ON engagement_line_items FOR DELETE
  TO authenticated
  USING (is_internal_user());

-- Vendors can read line items for engagements they have been invited to (via RFQs)
CREATE POLICY "eli: vendor reads invited"
  ON engagement_line_items FOR SELECT
  USING (
    engagement_id IN (
      SELECT engagement_id FROM rfqs
      WHERE vendor_id IN (SELECT id FROM vendors WHERE profile_id = auth.uid())
    )
  );

-- ─── invoices: add engagement_id ─────────────────────────────────────────────
-- Allows vendors to submit invoices directly against an engagement (without a
-- contract), so either contract_id OR engagement_id satisfies the linkage rule.

ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS engagement_id uuid
    REFERENCES engagements(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_invoices_engagement ON invoices(engagement_id);

-- ─── vendor_categories: ensure vendor RLS allows self-service ─────────────────
-- Vendors must be able to insert/delete their own category mappings so the
-- Profile screen can update categories without admin intervention.

DO $$
BEGIN
  -- insert policy
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'vendor_categories'
      AND policyname = 'vendor_categories: vendor inserts own'
  ) THEN
    CREATE POLICY "vendor_categories: vendor inserts own"
      ON vendor_categories FOR INSERT
      TO authenticated
      WITH CHECK (vendor_id IN (SELECT id FROM vendors WHERE profile_id = auth.uid()));
  END IF;

  -- delete policy
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'vendor_categories'
      AND policyname = 'vendor_categories: vendor deletes own'
  ) THEN
    CREATE POLICY "vendor_categories: vendor deletes own"
      ON vendor_categories FOR DELETE
      TO authenticated
      USING (vendor_id IN (SELECT id FROM vendors WHERE profile_id = auth.uid()));
  END IF;
END;
$$;
