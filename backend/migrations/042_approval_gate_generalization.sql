-- Phase 3 (Debugs.pdf items 1-5): generalizes the "Associate action needs
-- Manager/Admin approval" gate (already built for vendor-side quotations,
-- 031_quotation_manager_approval_gate.sql) to the org side: Engagements,
-- Contracts, GRNs, Categories.
--
-- Reuses the existing generic approval_requests table (006_approval_workflow.sql)
-- as the single source of truth for the gate on all 4 entities, rather than
-- adding review_notes/reviewed_by/reviewed_at columns to each entity table
-- separately -- approval_requests already has status/reviewed_by/reviewed_at/
-- notes, and backend/src/routes/approvals.ts's /by-entity and /review routes
-- already read and write it generically.
--
-- Gate shape (uniform across all 4): if the creator's only org role is
-- Associate, the entity is created at 'pending_approval' and an
-- approval_requests row is inserted; otherwise it goes straight to its
-- normal starting status, unchanged from today. A Manager/Admin then
-- approves (entity -> its normal starting status) or rejects with notes
-- (entity stays at 'pending_approval', editable, with the rejection notes
-- visible via approval_requests -- no new per-entity rejection-reason column
-- needed).

ALTER TABLE approval_requests DROP CONSTRAINT IF EXISTS approval_requests_entity_type_check;
ALTER TABLE approval_requests ADD CONSTRAINT approval_requests_entity_type_check
  CHECK (entity_type IN ('engagement', 'purchase_order', 'invoice', 'grn', 'contract', 'category'));

ALTER TABLE contracts DROP CONSTRAINT IF EXISTS contracts_status_check;
ALTER TABLE contracts ADD CONSTRAINT contracts_status_check
  CHECK (status IN ('pending_approval', 'draft', 'active', 'expired', 'terminated'));

ALTER TABLE grns DROP CONSTRAINT IF EXISTS grns_status_check;
ALTER TABLE grns ADD CONSTRAINT grns_status_check
  CHECK (status IN ('pending_approval', 'draft', 'submitted', 'verified', 'rejected'));

-- Categories never had a lifecycle/status concept -- is_active is a simple
-- manual archive toggle, orthogonal to this gate. New status column, all
-- existing rows backfilled to 'active' (they were usable before this
-- migration and stay usable after). Categories stay a platform-wide/global
-- taxonomy (org_id is NOT added here) -- the gate is keyed off which org the
-- creating user is ACTING FROM at request time (X-Org-Id), not off the
-- category row itself, since a category's eventual availability is
-- platform-wide regardless of who requested it.
ALTER TABLE service_categories ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active';
ALTER TABLE service_categories DROP CONSTRAINT IF EXISTS service_categories_status_check;
ALTER TABLE service_categories ADD CONSTRAINT service_categories_status_check
  CHECK (status IN ('pending_approval', 'active'));
UPDATE service_categories SET status = 'active' WHERE status IS NULL;

-- Associate never had ANY contracts.* permission (only Manager/Admin do),
-- unlike engagements.draft/grns.record, which Associate already holds --
-- meaning there was no existing frontend entry point an Associate could
-- reach to even trigger this new gate for Contracts specifically. Grants
-- the same base-tier permission Engagements/GRNs already give Associate, so
-- "New Contract" becomes reachable (frontend's canManageContracts check
-- already reads contracts.draft, no frontend change needed beyond this).
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.scope = 'org' AND r.name = 'Associate'
  AND p.key = 'contracts.draft'
ON CONFLICT DO NOTHING;
