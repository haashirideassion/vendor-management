-- Contract Lifecycle Management, Phase 2: Negotiation with Vendor (Stage 5)
-- + Redlining & Revisions (Stage 6).
--
-- A contract's negotiable terms are modeled as named clauses
-- (contract_clauses), each with its own redline version history
-- (contract_clause_versions) -- the exact same supersede-on-resubmit
-- pattern already proven for quotations
-- (070_quotation_partial_availability_versioning.sql): a partial unique
-- index enforces one current version per clause, and submitting a new
-- version marks the prior one non-current rather than overwriting it, so
-- every redline round stays inspectable.
--
-- No automated text-diffing exists anywhere in this app (confirmed) -- the
-- "summarize material changes" requirement is a manual change_summary field
-- the submitter writes themselves, not a computed diff.
--
-- Locking: contract_clauses.status ('under_negotiation' / 'agreed') plus
-- two independent flags (vendor_agreed / internal_agreed). Either side
-- marks their own flag true on the CURRENT version; once both are true the
-- clause locks ('agreed') and further redlines are rejected until a
-- Legal-role org member explicitly reopens it (resets status + both
-- flags) -- per the confirmed spec ("do not allow the same clause to be
-- reopened... without explicit override from Legal").
--
-- High-priority flagging: contract_clauses.category is set once at clause
-- creation; a submitted redline on a 'liability'/'indemnity'/'termination'/
-- 'ip' clause additionally notifies Legal with an urgent-styled
-- notification (application-layer logic in contractClauses.ts, not schema).
--
-- Vendor-facing, two-way (confirmed scope): vendors can propose and agree
-- to redlines themselves. No new RLS policy is needed for vendor access,
-- though -- the backend always reads/writes through the service-role key
-- (RLS bypassed for all API traffic, same as every other table in this
-- app), so real vendor authorization lives in contractClauses.ts's route
-- code (resolveListScope + ownership checks), not in Postgres policies.

-- ─── 1. contract_clauses ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS contract_clauses (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id     uuid NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  title           text NOT NULL,
  category        text NOT NULL DEFAULT 'other' CHECK (category IN ('liability', 'indemnity', 'termination', 'ip', 'other')),
  status          text NOT NULL DEFAULT 'under_negotiation' CHECK (status IN ('under_negotiation', 'agreed')),
  vendor_agreed   boolean NOT NULL DEFAULT false,
  internal_agreed boolean NOT NULL DEFAULT false,
  created_by      uuid NOT NULL REFERENCES profiles(id),
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_contract_clauses_contract ON contract_clauses(contract_id);

CREATE TRIGGER contract_clauses_set_updated_at
  BEFORE UPDATE ON contract_clauses
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE contract_clauses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "contract_clauses: internal users read own org" ON contract_clauses
  FOR SELECT USING (is_internal_user() AND has_org_access(org_id_for_contract(contract_id)));

CREATE POLICY "contract_clauses: internal users insert own org" ON contract_clauses
  FOR INSERT WITH CHECK (is_internal_user() AND has_org_access(org_id_for_contract(contract_id)));

CREATE POLICY "contract_clauses: internal users update own org" ON contract_clauses
  FOR UPDATE USING (is_internal_user() AND has_org_access(org_id_for_contract(contract_id)));

-- ─── 2. contract_clause_versions ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS contract_clause_versions (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clause_id      uuid NOT NULL REFERENCES contract_clauses(id) ON DELETE CASCADE,
  version        integer NOT NULL DEFAULT 1,
  is_current     boolean NOT NULL DEFAULT true,
  content        text NOT NULL,
  change_summary text,
  author_side    text NOT NULL CHECK (author_side IN ('internal', 'vendor')),
  authored_by    uuid NOT NULL REFERENCES profiles(id),
  created_at     timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_contract_clause_versions_clause ON contract_clause_versions(clause_id);

-- One current version per clause -- same partial-index technique as
-- uq_quotations_one_current_per_rfq (070_quotation_partial_availability_versioning.sql).
CREATE UNIQUE INDEX IF NOT EXISTS uq_contract_clause_versions_one_current
  ON contract_clause_versions(clause_id) WHERE is_current;

ALTER TABLE contract_clause_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "contract_clause_versions: internal users read own org" ON contract_clause_versions
  FOR SELECT USING (
    is_internal_user() AND EXISTS (
      SELECT 1 FROM contract_clauses cc WHERE cc.id = contract_clause_versions.clause_id
        AND has_org_access(org_id_for_contract(cc.contract_id))
    )
  );

CREATE POLICY "contract_clause_versions: internal users insert own org" ON contract_clause_versions
  FOR INSERT WITH CHECK (
    is_internal_user() AND EXISTS (
      SELECT 1 FROM contract_clauses cc WHERE cc.id = contract_clause_versions.clause_id
        AND has_org_access(org_id_for_contract(cc.contract_id))
    )
  );

CREATE POLICY "contract_clause_versions: internal users update own org" ON contract_clause_versions
  FOR UPDATE USING (
    is_internal_user() AND EXISTS (
      SELECT 1 FROM contract_clauses cc WHERE cc.id = contract_clause_versions.clause_id
        AND has_org_access(org_id_for_contract(cc.contract_id))
    )
  );

-- ─── 3. Notification types ───────────────────────────────────────────────────
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN (
    'new_vendor', 'new_invoice', 'new_quotation',
    'grn_pending_approval', 'purchase_request_pending_approval', 'contract_pending_approval', 'category_pending_approval',
    'grn_decision', 'purchase_request_decision', 'contract_decision', 'category_decision',
    'invoice_status_update',
    'contract_review_requested', 'contract_review_decision',
    'contract_clause_redline_submitted', 'contract_clause_agreed'
  ));
