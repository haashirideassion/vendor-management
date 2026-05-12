-- Add missing DELETE policies on procurement and workflow tables.
-- All tables already have SELECT/INSERT/UPDATE policies; DELETE was omitted in migrations 006-008.
-- Only internal users (admins, managers, procurement staff) may delete these records.

DO $$
BEGIN
  -- approval_requests
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='approval_requests' AND policyname='approval_requests: internal users delete'
  ) THEN
    EXECUTE $p$ CREATE POLICY "approval_requests: internal users delete" ON approval_requests FOR DELETE USING (is_internal_user()) $p$;
  END IF;

  -- engagements
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='engagements' AND policyname='engagements: internal users delete'
  ) THEN
    EXECUTE $p$ CREATE POLICY "engagements: internal users delete" ON engagements FOR DELETE USING (is_internal_user()) $p$;
  END IF;

  -- purchase_orders
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='purchase_orders' AND policyname='purchase_orders: internal users delete'
  ) THEN
    EXECUTE $p$ CREATE POLICY "purchase_orders: internal users delete" ON purchase_orders FOR DELETE USING (is_internal_user()) $p$;
  END IF;

  -- grns
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='grns' AND policyname='grns: internal users delete'
  ) THEN
    EXECUTE $p$ CREATE POLICY "grns: internal users delete" ON grns FOR DELETE USING (is_internal_user()) $p$;
  END IF;

  -- invoices
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='invoices' AND policyname='invoices: internal users delete'
  ) THEN
    EXECUTE $p$ CREATE POLICY "invoices: internal users delete" ON invoices FOR DELETE USING (is_internal_user()) $p$;
  END IF;

  -- contracts
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='contracts' AND policyname='contracts: internal users delete'
  ) THEN
    EXECUTE $p$ CREATE POLICY "contracts: internal users delete" ON contracts FOR DELETE USING (is_internal_user()) $p$;
  END IF;

  -- contract_amendments
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='contract_amendments' AND policyname='contract_amendments: internal users delete'
  ) THEN
    EXECUTE $p$ CREATE POLICY "contract_amendments: internal users delete" ON contract_amendments FOR DELETE USING (is_internal_user()) $p$;
  END IF;
END $$;
