-- Contract Lifecycle Management, Phase 4: Repository & Obligation Tracking
-- (Stage 9 -- 90/60/30-day renewal reminders) + Renewal/Amendment/Exit
-- (Stage 11 -- a decision record, auto-opened at the contract's own
-- renewal_notice_days deadline, escalated urgently if left undecided).
--
-- Driven by a daily Vercel Cron Job (backend/src/routes/cron.ts), since this
-- app's backend runs as an ephemeral Vercel serverless function with no
-- persistent process to host an in-process timer.
--
-- Both new tables key off the contract's CURRENT expiry_date rather than a
-- separate "cycle number" -- if a renewal/amendment later pushes expiry_date
-- forward, that's automatically a fresh cycle (new unique key), with no
-- explicit cycle-closing step needed.

-- ─── 1. New role ─────────────────────────────────────────────────────────────
-- Owns Stage 9's reminders and is a Stage 11 escalation target, alongside the
-- contract's own creator (Business User). Mirrors Legal/Compliance's ON
-- CONFLICT target (065_custom_roles.sql's partial unique index scoped to
-- system roles only).
INSERT INTO roles (name, scope, description) VALUES
  ('Contract Manager', 'org', 'Owns contract renewal tracking and escalations')
ON CONFLICT (scope, name) WHERE is_system = true DO NOTHING;

INSERT INTO permissions (key, module, action, description) VALUES
  ('contracts.manage_renewals', 'contracts', 'manage_renewals', 'Log renewal/amendment/exit decisions and receive renewal escalations')
ON CONFLICT (key) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.scope = 'org' AND r.name IN ('Contract Manager', 'Admin')
  AND p.key = 'contracts.manage_renewals'
ON CONFLICT DO NOTHING;

-- ─── 2. contract_renewal_reminders ──────────────────────────────────────────
-- One row per (contract, expiry_date, threshold) once that nudge has been
-- sent -- existence = "already sent," giving the daily cron idempotency for
-- free via the unique constraint below.
CREATE TABLE IF NOT EXISTS contract_renewal_reminders (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id uuid NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  expiry_date date NOT NULL,
  days_before integer NOT NULL CHECK (days_before IN (90, 60, 30)),
  sent_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (contract_id, expiry_date, days_before)
);

CREATE INDEX IF NOT EXISTS idx_contract_renewal_reminders_contract ON contract_renewal_reminders(contract_id);

ALTER TABLE contract_renewal_reminders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "contract_renewal_reminders: internal users read own org" ON contract_renewal_reminders
  FOR SELECT USING (is_internal_user() AND has_org_access(org_id_for_contract(contract_id)));

-- ─── 3. contract_renewal_decisions ──────────────────────────────────────────
-- One row per renewal cycle, auto-opened by the cron once the contract
-- crosses its own renewal_notice_days window before expiry_date. `decision`
-- is NULL until logged (pending); `escalated_at` records the first urgent
-- escalation for this cycle (idempotency for escalation, same pattern as
-- the reminders table above).
CREATE TABLE IF NOT EXISTS contract_renewal_decisions (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id              uuid NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  cycle_expiry_date        date NOT NULL,
  decision                 text CHECK (decision IN ('renew', 'amend', 'terminate')),
  amendment_scope          text,
  termination_notice_date  date,
  decided_by               uuid REFERENCES profiles(id),
  decided_at               timestamptz,
  escalated_at             timestamptz,
  created_at               timestamptz NOT NULL DEFAULT now(),
  UNIQUE (contract_id, cycle_expiry_date)
);

CREATE INDEX IF NOT EXISTS idx_contract_renewal_decisions_contract ON contract_renewal_decisions(contract_id);

ALTER TABLE contract_renewal_decisions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "contract_renewal_decisions: internal users read own org" ON contract_renewal_decisions
  FOR SELECT USING (is_internal_user() AND has_org_access(org_id_for_contract(contract_id)));

CREATE POLICY "contract_renewal_decisions: internal users update own org" ON contract_renewal_decisions
  FOR UPDATE USING (is_internal_user() AND has_org_access(org_id_for_contract(contract_id)));

-- ─── 4. Notification types ──────────────────────────────────────────────────
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN (
    'new_vendor', 'new_invoice', 'new_quotation',
    'grn_pending_approval', 'purchase_request_pending_approval', 'contract_pending_approval', 'category_pending_approval',
    'grn_decision', 'purchase_request_decision', 'contract_decision', 'category_decision',
    'invoice_status_update',
    'contract_review_requested', 'contract_review_decision',
    'contract_approval_requested', 'contract_approval_decision',
    'contract_renewal_reminder', 'contract_renewal_decision_needed', 'contract_renewal_escalation'
  ));
