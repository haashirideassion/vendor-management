-- Fix: 083_contract_renewal_tracking.sql rewrote notifications_type_check
-- from scratch (as every migration touching this constraint does -- Postgres
-- has no ADD-one-value-to-a-CHECK syntax) and, in doing so, dropped
-- 'contract_clause_redline_submitted' and 'contract_clause_agreed', which
-- 082_contract_approval_matrix.sql had added. contractClauses.ts has kept
-- inserting both this whole time; every insert has been silently rejected
-- since 083 was applied (notifyUsers() logs the error but the caller's
-- request still succeeds, so nothing looked broken from the UI).
--
-- Also adds 'service_confirmation_pending_approval' and
-- 'service_confirmation_decision' (serviceConfirmations.ts), which have
-- never been in this CHECK list since that route was written -- those
-- notifications have never fired.
--
-- New: 'invoice_match_exception' -- /api/invoices/run-match (perform_three_way_match,
-- 084_three_way_match_tax_inclusive.sql) previously left Admin/Finance with no
-- way to learn a 3-way match landed in variance short of noticing it in the
-- exceptions queue. invoices.ts now notifies them the same way new_invoice does.
--
-- New: 'rfq_raised' / 'rfq_invited' -- purchaseRequests.ts/create previously
-- created RFQs (one per invited vendor, inside create_purchase_request_full)
-- with no notification on either side: the org's own Manager/Admin had no way
-- to learn sourcing started besides opening the purchase request themselves,
-- and invited vendors had no way to learn they'd been invited to quote besides
-- polling their RFQ list. 'rfq_invited' fires immediately when the purchase
-- request doesn't need approval, or from /api/approvals/review once a gated
-- one is approved -- vendors can't see an RFQ before then (rfqs.ts filters
-- purchase_request.status = 'approved' for vendor callers).
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN (
    'new_vendor', 'new_invoice', 'new_quotation',
    'grn_pending_approval', 'purchase_request_pending_approval', 'contract_pending_approval', 'category_pending_approval',
    'grn_decision', 'purchase_request_decision', 'contract_decision', 'category_decision',
    'invoice_status_update',
    'contract_review_requested', 'contract_review_decision',
    'contract_approval_requested', 'contract_approval_decision',
    'contract_renewal_reminder', 'contract_renewal_decision_needed', 'contract_renewal_escalation',
    'contract_clause_redline_submitted', 'contract_clause_agreed',
    'service_confirmation_pending_approval', 'service_confirmation_decision',
    'invoice_match_exception',
    'rfq_raised', 'rfq_invited'
  ));
