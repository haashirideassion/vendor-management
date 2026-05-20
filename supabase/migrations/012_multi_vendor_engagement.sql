-- ─── Make vendor_id nullable (multi-vendor engagements use junction table) ─────
ALTER TABLE engagements ALTER COLUMN vendor_id DROP NOT NULL;

-- ─── Relax estimated_value constraint (optional for RFQ-based engagements) ─────
ALTER TABLE engagements DROP CONSTRAINT IF EXISTS engagements_estimated_value_check;
ALTER TABLE engagements ALTER COLUMN estimated_value DROP NOT NULL;
ALTER TABLE engagements ADD CONSTRAINT engagements_estimated_value_check
  CHECK (estimated_value IS NULL OR estimated_value >= 0);

-- ─── engagement_vendors (many-to-many junction) ────────────────────────────────
CREATE TABLE IF NOT EXISTS engagement_vendors (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  engagement_id uuid NOT NULL REFERENCES engagements(id) ON DELETE CASCADE,
  vendor_id     uuid NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  created_at    timestamptz DEFAULT now(),
  UNIQUE (engagement_id, vendor_id)
);

CREATE INDEX IF NOT EXISTS idx_ev_engagement ON engagement_vendors(engagement_id);
CREATE INDEX IF NOT EXISTS idx_ev_vendor     ON engagement_vendors(vendor_id);

ALTER TABLE engagement_vendors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ev: internal users read all"
  ON engagement_vendors FOR SELECT
  USING (is_internal_user());

CREATE POLICY "ev: internal users insert"
  ON engagement_vendors FOR INSERT
  TO authenticated
  WITH CHECK (is_internal_user());

CREATE POLICY "ev: internal users delete"
  ON engagement_vendors FOR DELETE
  USING (is_internal_user());

CREATE POLICY "ev: vendor reads own"
  ON engagement_vendors FOR SELECT
  USING (vendor_id IN (SELECT id FROM vendors WHERE profile_id = auth.uid()));

-- ─── Expand vendor RLS on engagements to include multi-vendor rows ─────────────
DROP POLICY IF EXISTS "engagements: vendor reads own" ON engagements;

CREATE POLICY "engagements: vendor reads own"
  ON engagements FOR SELECT
  USING (
    vendor_id IN (SELECT id FROM vendors WHERE profile_id = auth.uid())
    OR id IN (
      SELECT engagement_id FROM engagement_vendors
      WHERE vendor_id IN (SELECT id FROM vendors WHERE profile_id = auth.uid())
    )
  );
