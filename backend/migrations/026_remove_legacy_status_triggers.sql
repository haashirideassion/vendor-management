-- Phase 4: remove the five status-change audit triggers whose performed_by
-- (via auth.uid()) has been silently NULL for every Express-driven write
-- since they were introduced -- confirmed live before writing this
-- migration: both existing status_changed audit_log rows (a purchase_order
-- and an invoice) already have performed_by: null, because auth.uid() is
-- NULL under the service-role key Express writes through. A trigger in that
-- position can't identify the actor at all, so it can't set acting_as
-- either (the requirement this phase needs to satisfy).
--
-- Checked for any writer to engagements/purchase_orders/grns/invoices/
-- contracts other than Express (directly or via the 006_atomic_operations.sql
-- RPCs, which are themselves Express-invoked): pg_cron's renewal-cron only
-- touches vendors, the on-vendor-status-changed edge function only sends
-- email, migrate-attachment-paths.ts only touches attachments, and no cron/
-- worker file exists in backend/src. Nothing else writes to these tables, so
-- removing these triggers loses no audit coverage -- only the audit_log
-- rows they wrote (with an unusable, always-null performed_by) stop being
-- written from here on. Replacement: the Express routes/RPCs that perform
-- these status writes now call the shared writeAudit() helper explicitly
-- with the real actor id and acting_as (backend/src/services/audit.ts), one
-- call site per write path, listed in the phase plan.

DROP TRIGGER IF EXISTS engagement_audit ON engagements;
DROP TRIGGER IF EXISTS po_audit ON purchase_orders;
DROP TRIGGER IF EXISTS grn_audit ON grns;
DROP TRIGGER IF EXISTS invoice_audit ON invoices;
DROP TRIGGER IF EXISTS contract_audit ON contracts;

DROP FUNCTION IF EXISTS log_engagement_status_change();
DROP FUNCTION IF EXISTS log_po_status_change();
DROP FUNCTION IF EXISTS log_grn_status_change();
DROP FUNCTION IF EXISTS log_invoice_status_change();
DROP FUNCTION IF EXISTS log_contract_status_change();
