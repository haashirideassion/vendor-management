-- RBAC/Teams Redesign, Phase 7c: Geographic/Legal-Entity record scope.
--
-- Deferred in the original spec until the Legal Entity model existed (it now
-- does, from the Vendor Onboarding redesign). Restricts WHICH RECORDS an
-- org-side member can see -- e.g. an "India-only" reviewer should only see
-- vendors that have an India legal entity, not every vendor the org works
-- with.
--
-- Deliberately reuses the EXACT precedence pattern already proven by
-- vendor_user_assignments (019_rbac_assignment_tables.sql) rather than
-- building a new generic ABAC engine: if ANY scope rows exist for a member,
-- they are restricted to exactly those legal entities; if none exist, they
-- are unrestricted (sees everything their role otherwise allows). This is
-- the same "presence of an allow-list row is itself the restriction signal"
-- design, just keyed by legal_entity_id instead of organization_id.
--
-- This migration ships the mechanism (table + resolver function) and wires
-- ONE concrete example (the org's own vendor list, vendors.ts /list) to
-- prove it works end-to-end. Applying the same filter to every other
-- vendor-touching route (contracts, POs, invoices, engagements, etc.) is
-- separate, incremental adoption work -- same pattern as Phase 3's
-- requirePermission() rollout: build the mechanism, adopt it gradually.

CREATE TABLE IF NOT EXISTS org_member_legal_entity_scope (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_member_id   uuid NOT NULL REFERENCES organization_members(id) ON DELETE CASCADE,
  legal_entity_id uuid NOT NULL REFERENCES legal_entities(id) ON DELETE CASCADE,
  created_at      timestamptz DEFAULT now(),
  UNIQUE (org_member_id, legal_entity_id)
);

CREATE INDEX IF NOT EXISTS idx_omles_org_member ON org_member_legal_entity_scope(org_member_id);

-- Returns NULL for "no restriction, sees every legal entity their role
-- otherwise allows" (mirrors resolveVendorAllowedOrgIds' null-vs-empty-array
-- distinction in middleware/org.ts) or the array of allowed legal_entity_ids
-- if the member has been explicitly scoped.
CREATE OR REPLACE FUNCTION resolve_org_member_legal_entity_scope(p_org_member_id uuid)
RETURNS uuid[] LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT CASE WHEN EXISTS (SELECT 1 FROM org_member_legal_entity_scope WHERE org_member_id = p_org_member_id)
    THEN ARRAY(SELECT legal_entity_id FROM org_member_legal_entity_scope WHERE org_member_id = p_org_member_id)
    ELSE NULL
  END;
$$;

ALTER TABLE org_member_legal_entity_scope ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_member_legal_entity_scope: platform admins manage" ON org_member_legal_entity_scope
  FOR ALL USING (is_platform_admin()) WITH CHECK (is_platform_admin());

CREATE POLICY "org_member_legal_entity_scope: self read" ON org_member_legal_entity_scope
  FOR SELECT USING (
    is_platform_admin() OR EXISTS (
      SELECT 1 FROM organization_members om WHERE om.id = org_member_legal_entity_scope.org_member_id AND om.profile_id = auth.uid()
    )
  );
