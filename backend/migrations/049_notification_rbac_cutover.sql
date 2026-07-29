-- Notifications were built on the legacy profiles.role single-string model
-- (supabase/migrations/017_notifications.sql), which the RBAC bundle
-- refactor (this directory's 017-021) left behind -- profiles.role is only
-- ever set once at signup and never updated when a user is later invited as
-- Admin/Manager/Finance into an org via organization_members/org_member_roles,
-- so those triggers silently miss almost everyone except the original
-- org-signup admin. Replaced with Express-side notification code
-- (services/approvalGate.ts, routes/invoices.ts, routes/vendors.ts) that
-- resolves the real org-scoped/vendor-scoped role holders.
--
-- Also widens the type CHECK to the values Express code already writes --
-- grn/engagement/contract/category _pending_approval were already being
-- inserted by approvalGate.ts's notifyApprovers, silently failing this
-- entire time since they were never in the original CHECK list and the
-- insert's `error` was never checked.

DROP TRIGGER IF EXISTS trigger_new_vendor ON vendors;
DROP TRIGGER IF EXISTS trigger_new_invoice ON invoices;
DROP TRIGGER IF EXISTS trigger_new_quotation_update ON quotations;
DROP TRIGGER IF EXISTS trigger_new_quotation_insert ON quotations;
DROP FUNCTION IF EXISTS notify_admins_new_vendor();
DROP FUNCTION IF EXISTS notify_admins_new_invoice();
DROP FUNCTION IF EXISTS notify_admins_new_quotation();

ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN (
    'new_vendor', 'new_invoice', 'new_quotation',
    'grn_pending_approval', 'engagement_pending_approval', 'contract_pending_approval', 'category_pending_approval',
    'grn_decision', 'engagement_decision', 'contract_decision', 'category_decision',
    'invoice_status_update'
  ));
