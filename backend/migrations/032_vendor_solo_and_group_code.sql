-- Phase B: vendor self-service onboarding (Step1CompanyInfo.tsx) gains two
-- fields per the confirmed flow-doc spec --
--   - is_solo_user: the vendor operates as a single person, no separate
--     Manager/Associate staff to invite later (informational flag only;
--     doesn't change the RBAC bundle itself -- a solo vendor's one login
--     still holds whatever role vendor_users/vendor_user_roles assigns it).
--   - org_group_code: freeform text the vendor optionally supplies during
--     self-signup, identifying the organisation/group they intend to work
--     with. Editable during self-signup or when Superadmin does it on the
--     vendor's behalf; read-only/prefilled when a local admin or group
--     admin onboards the vendor on their behalf (see Step1CompanyInfo.tsx's
--     lock logic) -- captured as-is for the reviewing admin to act on
--     during verification, not resolved/validated against
--     organizations/organization_groups here (no shared "join code" concept
--     exists on either table yet; introducing one is out of scope for this
--     small phase).

ALTER TABLE vendors
  ADD COLUMN IF NOT EXISTS is_solo_user   boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS org_group_code text;
