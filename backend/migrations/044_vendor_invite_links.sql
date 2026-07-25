-- Phase 6: vendor invite links. An org (or group) admin generates a
-- shareable signup link carrying their org_code or group_code as an opaque,
-- expiring token -- a prospective vendor who signs up via that link gets
-- their onboarding wizard's org_code/group_code field prefilled AND locked,
-- instead of typing (and possibly mistyping) a code by hand. Every access
-- goes through the backend's service-role key (create/resolve routes in
-- vendorInviteLinks.ts), matching this app's established pattern of
-- backend-mediated access rather than direct-from-client RLS -- so no
-- policies are defined here beyond enabling RLS itself (deny-by-default).
CREATE TABLE IF NOT EXISTS vendor_invite_links (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token        text NOT NULL UNIQUE,
  org_id       uuid REFERENCES organizations(id) ON DELETE CASCADE,
  group_id     uuid REFERENCES organization_groups(id) ON DELETE CASCADE,
  created_by   uuid NOT NULL REFERENCES profiles(id),
  expires_at   timestamptz NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT vendor_invite_links_target_check CHECK (
    (org_id IS NOT NULL AND group_id IS NULL) OR (org_id IS NULL AND group_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS vendor_invite_links_token_idx ON vendor_invite_links(token);

ALTER TABLE vendor_invite_links ENABLE ROW LEVEL SECURITY;
