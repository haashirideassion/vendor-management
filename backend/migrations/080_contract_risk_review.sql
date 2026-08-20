-- Contract Lifecycle Management, Phase 1: risk tiering + multi-stakeholder
-- Internal Review.
--
-- The existing Contracts feature already has a single Manager/Admin
-- approval gate (pending_approval -> draft, gateOnCreate/approval_requests,
-- same generic mechanism used by Purchase Requests/GRNs/Categories/Service
-- Confirmations) -- but approval_requests is strictly single-pending-row/
-- single-approver (confirmed by reading approvalGate.ts and every other
-- approval-shaped table in this app), so it can't express "Legal AND
-- Finance AND Compliance AND the requester must each independently sign
-- off before this proceeds." This adds a NEW, purpose-built parallel-review
-- table (contract_reviewers) alongside the existing gate, rather than
-- bending approval_requests to do something it wasn't designed for.
--
-- Reviewer roles required per risk tier (confirmed scope):
--   low:    business_user, legal
--   medium: + finance
--   high:   + compliance, vp_cfo
-- "VP/CFO" is deliberately mapped to this app's existing Admin role (its
-- top org tier already) rather than inventing a new distinct role -- only
-- Legal and Compliance are genuinely new roles, per the confirmed decision.
--
-- Rounds, not full document versioning: if any reviewer requests changes,
-- the contract drops back to 'draft' and a fresh "Request Internal Review"
-- opens a new round with all slots reset to pending -- prior rounds stay in
-- the table for audit history. Full redline/version history (Stages 5-6)
-- is an explicitly separate, later phase.

-- ─── 1. New roles ────────────────────────────────────────────────────────────
-- 065_custom_roles.sql dropped the original plain UNIQUE(scope, name)
-- constraint (which is what 040_finance_role.sql's identical-looking
-- ON CONFLICT (scope, name) matched, back when it ran) and replaced it with
-- a PARTIAL unique index scoped to system roles only
-- (uq_roles_system_scope_name ... WHERE is_system = true), so the ON
-- CONFLICT target must repeat that predicate to be inferred correctly --
-- confirmed live: omitting it throws "42P10: there is no unique or
-- exclusion constraint matching the ON CONFLICT specification".
INSERT INTO roles (name, scope, description) VALUES
  ('Legal', 'org', 'Contract drafting and legal review'),
  ('Compliance', 'org', 'Contract compliance/InfoSec review')
ON CONFLICT (scope, name) WHERE is_system = true DO NOTHING;

-- ─── 2. New permission + grants ─────────────────────────────────────────────
INSERT INTO permissions (key, module, action, description) VALUES
  ('contracts.review', 'contracts', 'review', 'Review a contract as part of Internal Review sign-off')
ON CONFLICT (key) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.scope = 'org' AND r.name IN ('Legal', 'Compliance', 'Finance', 'Admin')
  AND p.key = 'contracts.review'
ON CONFLICT DO NOTHING;

-- Legal is Stage 3's actual owner (drafts the contract) per the confirmed
-- spec, same key Associate/Manager already hold for the same action.
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.scope = 'org' AND r.name = 'Legal' AND p.key = 'contracts.draft'
ON CONFLICT DO NOTHING;

-- ─── 3. Risk tier on contracts ───────────────────────────────────────────────
-- Nullable -- any contract that never sets this keeps behaving exactly as
-- today (no review requirement, "Activate" stays reachable straight from
-- draft), same additive convention used throughout this codebase.
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS risk_tier text CHECK (risk_tier IN ('low', 'medium', 'high'));

-- ─── 4. contract_reviewers ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS contract_reviewers (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id   uuid NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  round         integer NOT NULL DEFAULT 1,
  reviewer_role text NOT NULL CHECK (reviewer_role IN ('business_user', 'legal', 'finance', 'compliance', 'vp_cfo')),
  status        text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'changes_requested')),
  notes         text,
  reviewed_by   uuid REFERENCES profiles(id),
  reviewed_at   timestamptz,
  created_at    timestamptz DEFAULT now(),
  UNIQUE (contract_id, round, reviewer_role)
);

CREATE INDEX IF NOT EXISTS idx_contract_reviewers_contract ON contract_reviewers(contract_id);

ALTER TABLE contract_reviewers ENABLE ROW LEVEL SECURITY;

-- Mirrors contract_amendments' join-through-parent pattern (contract_reviewers
-- has no own org_id either) -- reuses the existing org_id_for_contract()
-- helper (009_fix_rls_recursion.sql) already used for contract_amendments'
-- own policies.
CREATE POLICY "contract_reviewers: internal users read own org" ON contract_reviewers
  FOR SELECT USING (is_internal_user() AND has_org_access(org_id_for_contract(contract_id)));

CREATE POLICY "contract_reviewers: internal users insert own org" ON contract_reviewers
  FOR INSERT WITH CHECK (is_internal_user() AND has_org_access(org_id_for_contract(contract_id)));

CREATE POLICY "contract_reviewers: internal users update own org" ON contract_reviewers
  FOR UPDATE USING (is_internal_user() AND has_org_access(org_id_for_contract(contract_id)));

-- ─── 5. Notification types ───────────────────────────────────────────────────
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN (
    'new_vendor', 'new_invoice', 'new_quotation',
    'grn_pending_approval', 'purchase_request_pending_approval', 'contract_pending_approval', 'category_pending_approval',
    'grn_decision', 'purchase_request_decision', 'contract_decision', 'category_decision',
    'invoice_status_update',
    'contract_review_requested', 'contract_review_decision'
  ));
