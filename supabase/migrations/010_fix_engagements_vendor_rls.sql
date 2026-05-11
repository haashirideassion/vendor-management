-- Add vendor SELECT policy on engagements (was missing from migration 007).
-- All other vendor-accessible tables already follow this pattern:
--   purchase_orders (007 line 362), grns (007 line 397),
--   invoices (007 line 432), contracts (008 line 113)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'engagements'
      AND policyname = 'engagements: vendor reads own'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "engagements: vendor reads own"
        ON engagements FOR SELECT
        USING (vendor_id IN (
          SELECT id FROM vendors WHERE profile_id = auth.uid()
        ))
    $policy$;
  END IF;
END $$;
