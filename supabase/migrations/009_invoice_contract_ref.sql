-- Add contract linkage to invoices
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS contract_id uuid REFERENCES contracts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_invoices_contract_id ON invoices(contract_id);
