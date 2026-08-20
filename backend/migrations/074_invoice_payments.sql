-- Procurement Lifecycle Enhancement: formal Payment entity.
--
-- Today, /mark-paid just flips invoices.status to 'paid' with a timestamp --
-- no amount, method, reference number, or partial-payment support. This adds
-- invoice_payments (one row per payment made against an invoice, supporting
-- installments) and widens invoices.status with 'partially_paid' for the
-- case where the sum of payments so far is less than total_amount.
--
-- The actual status recomputation (partially_paid vs. paid) happens at the
-- application layer (backend/src/routes/invoices.ts's new /payments/create
-- route), matching this codebase's established convention of doing business
-- transitions in Express routes rather than DB triggers.

CREATE TABLE invoice_payments (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id        uuid NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  org_id            uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  amount            numeric NOT NULL CHECK (amount > 0),
  payment_method    text NOT NULL CHECK (payment_method IN ('bank_transfer', 'cheque', 'cash', 'card', 'upi', 'other')),
  reference_number  text,
  paid_date         date NOT NULL DEFAULT CURRENT_DATE,
  notes             text,
  recorded_by       uuid NOT NULL REFERENCES profiles(id),
  created_at        timestamptz DEFAULT now()
);

CREATE INDEX idx_invoice_payments_invoice ON invoice_payments(invoice_id);
CREATE INDEX idx_invoice_payments_org     ON invoice_payments(org_id);

ALTER TABLE invoice_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "invoice_payments: platform admins manage" ON invoice_payments
  FOR ALL USING (is_platform_admin()) WITH CHECK (is_platform_admin());

-- Mirrors invoices' own "internal users read all" policy (007_procurement_
-- schema.sql) -- vendor-side reads go through the backend's /payments/list
-- route instead (resolveVendorId-based scoping), not raw RLS, since the
-- legacy vendors.profile_id=auth.uid() RLS check is broken for any
-- multi-user vendor (a recurring, already-flagged limitation elsewhere in
-- this schema, not reintroduced here).
CREATE POLICY "invoice_payments: internal users read all" ON invoice_payments
  FOR SELECT USING (is_internal_user());

ALTER TABLE invoices DROP CONSTRAINT invoices_status_check;
ALTER TABLE invoices ADD CONSTRAINT invoices_status_check
  CHECK (status IN ('submitted', 'under_review', 'matched', 'approved', 'rejected', 'paid', 'partially_paid'));
