-- Phase 3 (vendor onboarding & verification): new legal/registration fields
-- for the admin-initiated onboarding flow, plus a record of which group (if
-- any) a vendor was onboarded through -- needed later for the explicit
-- "extend reach to a newly joined org" action (confirmed: reach is a
-- snapshot at onboarding time, never live/automatic).
--
-- verification_status itself is untouched -- the existing 'pending' value
-- (011_superadmin.sql) already means exactly what this flow calls
-- "pending_verification"; no new enum value needed.

ALTER TABLE vendors ADD COLUMN IF NOT EXISTS legal_name text;
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS pan_number text;
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS registration_number text;
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS onboarded_via_group_id uuid REFERENCES organization_groups(id);
