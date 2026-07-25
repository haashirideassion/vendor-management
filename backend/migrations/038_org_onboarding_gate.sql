-- Organisation onboarding wizard, part 3: gate a newly self-registered
-- org's access to the rest of the platform (Vendors, Categories, Reports,
-- Engagements, Purchase Orders, GRNs, Invoices, Contracts, Team) until its
-- onboarding submission is reviewed and APPROVED by a superadmin -- mirrors
-- the existing vendor pattern (a vendor can't be attached to a new
-- engagement until both org-approval AND superadmin verification clear),
-- confirmed as the bar here too (submitting alone isn't enough).
--
-- Explicitly does NOT apply to organisations that already existed before
-- this feature shipped -- only orgs created via the new self-service
-- /api/auth/register-organization flow are gated; superadmin-created orgs
-- (create-with-admin / bare create) and every pre-existing org default to
-- false and are unaffected. This is a real column (not "no draft row yet
-- = gated") specifically so a new org's admin can't dodge the gate by
-- simply never clicking "Start Onboarding".

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS requires_onboarding_approval boolean NOT NULL DEFAULT false;
