-- organization_vendors carries the same status vocabulary vendors.status
-- originally defined (001_initial_schema.sql: pending_review, active,
-- action_required, suspended, rejected), but that set has no way to
-- represent "an admin created this vendor and invited them, but they
-- haven't submitted their onboarding details yet" -- admin-onboard
-- (vendors.ts /admin-onboard) was setting pending_review immediately at
-- creation, which the frontend (VendorStatusGuard) treats as "onboarding
-- already completed," so the invited vendor's own submission step
-- (the /onboarding wizard) was never reachable.
--
-- 'invited' fills that gap: admin-onboard now sets this instead of
-- pending_review, and it only advances to pending_review once the vendor
-- actually submits the wizard (backend/src/routes/vendors.ts /create).
ALTER TABLE organization_vendors DROP CONSTRAINT IF EXISTS organization_vendors_status_check;
ALTER TABLE organization_vendors ADD CONSTRAINT organization_vendors_status_check
  CHECK (status IN ('invited', 'pending_review', 'active', 'action_required', 'suspended', 'rejected'));
