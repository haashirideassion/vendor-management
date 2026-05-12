-- ─── approval_requests ────────────────────────────────────────────────────────
-- Generic approval table reused by engagements, purchase orders, invoices, GRNs
CREATE TABLE IF NOT EXISTS approval_requests (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type  text NOT NULL CHECK (entity_type IN ('engagement', 'purchase_order', 'invoice', 'grn')),
  entity_id    uuid NOT NULL,
  requested_by uuid NOT NULL REFERENCES profiles(id),
  status       text NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
  reviewed_by  uuid REFERENCES profiles(id),
  reviewed_at  timestamptz,
  amount       numeric,          -- optional: value being approved (for threshold checks)
  notes        text,
  created_at   timestamptz DEFAULT now(),
  updated_at   timestamptz DEFAULT now()
);

-- ─── Indexes ──────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_approval_entity   ON approval_requests(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_approval_status   ON approval_requests(status);
CREATE INDEX IF NOT EXISTS idx_approval_requester ON approval_requests(requested_by);

-- ─── Auto-update updated_at (reuse existing set_updated_at function) ──────────
DROP TRIGGER IF EXISTS approval_requests_set_updated_at ON approval_requests;
CREATE TRIGGER approval_requests_set_updated_at
  BEFORE UPDATE ON approval_requests
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─── Audit log on status changes ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION log_approval_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NEW.status <> OLD.status THEN
    INSERT INTO audit_log (entity_type, entity_id, action, old_value, new_value, performed_by)
    VALUES (
      NEW.entity_type,
      NEW.entity_id,
      'approval_' || NEW.status,
      jsonb_build_object('status', OLD.status),
      jsonb_build_object('status', NEW.status, 'notes', NEW.notes),
      auth.uid()
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS approval_audit ON approval_requests;
CREATE TRIGGER approval_audit
  AFTER UPDATE ON approval_requests
  FOR EACH ROW EXECUTE FUNCTION log_approval_status_change();

-- ─── RLS ──────────────────────────────────────────────────────────────────────
ALTER TABLE approval_requests ENABLE ROW LEVEL SECURITY;

-- Internal users see all; vendors see only their own requests
CREATE POLICY "approval_requests: internal users read all, requester reads own"
  ON approval_requests FOR SELECT
  USING (is_internal_user() OR requested_by = auth.uid());

-- Anyone authenticated can submit a request
CREATE POLICY "approval_requests: authenticated users insert"
  ON approval_requests FOR INSERT
  TO authenticated
  WITH CHECK (requested_by = auth.uid());

-- Only internal users can review (approve/reject/cancel)
CREATE POLICY "approval_requests: internal users update"
  ON approval_requests FOR UPDATE
  USING (is_internal_user());

-- ─── Database type map entry (for reference) ──────────────────────────────────
-- approval_requests columns:
--   id, entity_type, entity_id, requested_by, status, reviewed_by, reviewed_at, amount, notes, created_at, updated_at
