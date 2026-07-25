-- Phase (org onboarding): a platform superadmin can now create an org and
-- invite its first admin by email, before that admin has ever logged in.
-- organization_members needs a status so we can distinguish "invited but
-- hasn't accepted yet" from "active" (and "suspended" for parity with
-- organizations.status).

ALTER TABLE organization_members ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active';
ALTER TABLE organization_members ADD CONSTRAINT organization_members_status_check
  CHECK (status IN ('invited', 'active', 'suspended'));

-- Existing rows all predate this column and are real, logged-in members.
UPDATE organization_members SET status = 'active' WHERE status IS NULL;
