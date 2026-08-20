-- Contract Lifecycle Management, Phase 3: tiered Approval matrix (Stage 7).
--
-- The spec's risk-tiering table (Low: Legal+Business User -> Medium: +
-- Finance -> High: +Compliance+VP/CFO) was actually written for Stage 7,
-- but Phase 1 (080_contract_risk_review.sql) already reused that identical
-- table for Stage 4's Internal Review instead. Confirmed with the user:
-- Stage 7 needs a genuinely DISTINCT chain, not a second round of the same
-- people approving the same thing -- driven by contract VALUE (the same
-- "amount in base currency" concept -- total_value * exchange_rate_to_base
-- -- resolveApprovalGate already compares against thresholds today, not the
-- risk tier), and PARALLEL (same routing style as Stage 4, not a new
-- sequential-queue concept this app has nothing like today).
--
-- Tier -> required approvers (escalating, distinct role set from Stage 4):
--   low (< medium_threshold):    Legal only
--   medium (< high_threshold):   + Finance
--   high (>= high_threshold):    + Admin ("VP/CFO", same mapping Phase 1
--                                 already established -- no distinct role)
--
-- contract_approval_thresholds is org-configurable, following the SAME
-- pattern as match_tolerance_settings (073_match_tolerance_and_exceptions.sql):
-- a dedicated per-org settings table, Admin-settable via a live screen,
-- absence of a row falling back to sensible defaults (no prior "today's
-- behavior" to preserve here since this is new, but the shape is identical).
--
-- contract_approvals mirrors contract_reviewers structurally (one row per
-- required role per round) but is a SEPARATE table -- risk-based review and
-- value-based approval are conceptually distinct gates, kept independently
-- queryable/auditable rather than overloading one table with two meanings.

-- ─── 1. contract_approval_thresholds ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS contract_approval_thresholds (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id           uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE UNIQUE,
  medium_threshold numeric NOT NULL DEFAULT 500000 CHECK (medium_threshold >= 0),
  high_threshold   numeric NOT NULL DEFAULT 2000000 CHECK (high_threshold >= medium_threshold),
  set_by           uuid REFERENCES profiles(id),
  set_at           timestamptz DEFAULT now()
);

ALTER TABLE contract_approval_thresholds ENABLE ROW LEVEL SECURITY;

CREATE POLICY "contract_approval_thresholds: platform admins manage" ON contract_approval_thresholds
  FOR ALL USING (is_platform_admin()) WITH CHECK (is_platform_admin());

CREATE POLICY "contract_approval_thresholds: org member reads own org's setting" ON contract_approval_thresholds
  FOR SELECT USING (
    is_platform_admin() OR EXISTS (
      SELECT 1 FROM organization_members om WHERE om.org_id = contract_approval_thresholds.org_id AND om.profile_id = auth.uid()
    )
  );

-- ─── 2. contract_approvals ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS contract_approvals (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id   uuid NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  round         integer NOT NULL DEFAULT 1,
  approver_role text NOT NULL CHECK (approver_role IN ('legal', 'finance', 'vp_cfo')),
  status        text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  notes         text,
  approved_by   uuid REFERENCES profiles(id),
  approved_at   timestamptz,
  created_at    timestamptz DEFAULT now(),
  UNIQUE (contract_id, round, approver_role)
);

CREATE INDEX IF NOT EXISTS idx_contract_approvals_contract ON contract_approvals(contract_id);

ALTER TABLE contract_approvals ENABLE ROW LEVEL SECURITY;

-- Mirrors contract_reviewers' join-through-parent pattern (contract_approvals
-- has no own org_id either), reusing the existing org_id_for_contract() helper.
CREATE POLICY "contract_approvals: internal users read own org" ON contract_approvals
  FOR SELECT USING (is_internal_user() AND has_org_access(org_id_for_contract(contract_id)));

CREATE POLICY "contract_approvals: internal users insert own org" ON contract_approvals
  FOR INSERT WITH CHECK (is_internal_user() AND has_org_access(org_id_for_contract(contract_id)));

CREATE POLICY "contract_approvals: internal users update own org" ON contract_approvals
  FOR UPDATE USING (is_internal_user() AND has_org_access(org_id_for_contract(contract_id)));

-- ─── 3. New contract status (+ a Phase 1 gap fixed while touching this) ─────
-- 080_contract_risk_review.sql introduced contracts.status = 'internal_review'
-- (set by contractReviews.ts's /request route) but never actually widened
-- this CHECK constraint to allow it -- confirmed live: 042_approval_gate_
-- generalization.sql's version (still the current one) only lists
-- ('pending_approval','draft','active','expired','terminated'), so that
-- UPDATE has been failing its CHECK constraint this whole time. Fixed here
-- alongside adding 'pending_final_approval' for Stage 7, rather than in a
-- separate migration, since both are the same statement.
ALTER TABLE contracts DROP CONSTRAINT IF EXISTS contracts_status_check;
ALTER TABLE contracts ADD CONSTRAINT contracts_status_check
  CHECK (status IN ('pending_approval', 'draft', 'internal_review', 'pending_final_approval', 'active', 'expired', 'terminated'));

-- ─── 4. Notification types ────────────────────────────────────────────────────
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN (
    'new_vendor', 'new_invoice', 'new_quotation',
    'grn_pending_approval', 'purchase_request_pending_approval', 'contract_pending_approval', 'category_pending_approval',
    'grn_decision', 'purchase_request_decision', 'contract_decision', 'category_decision',
    'invoice_status_update',
    'contract_review_requested', 'contract_review_decision',
    'contract_clause_redline_submitted', 'contract_clause_agreed',
    'contract_approval_requested', 'contract_approval_decision'
  ));
