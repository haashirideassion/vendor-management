-- RBAC/Teams Redesign, Phase 2: Feature Entitlement layer.
--
-- Platform-level, Super-Admin-controlled: which product modules are
-- available to a given tenant (org or vendor) AT ALL -- independent of and
-- prior to role/permission. Per the confirmed precedence pipeline, this is
-- a HARD GATE evaluated before role/permission: if a module isn't entitled,
-- nothing below matters, regardless of the caller's role. Enforcing that
-- gate is Phase 3's job (the centralized authorization resolver) -- this
-- migration only adds the schema + a query helper, no route wiring yet,
-- same schema-then-enforcement split used throughout this session.
--
-- feature_modules is a real catalog TABLE, not a CHECK-constrained enum
-- like Vendor Onboarding's TDS Sector list. That was deliberate there
-- because TDS sections are a stable, rarely-changing legal/tax concept;
-- product modules are the opposite -- exactly the kind of thing expected to
-- grow as the product does (a future "Blanket PO" or "Analytics Pro" module
-- shouldn't need a schema migration to introduce). Super Admin manages this
-- catalog going forward.
--
-- Seeded module codes are grounded in this app's actual existing feature
-- areas (procurement = engagements/RFQ/PO/GRN, finance = invoices/payments/
-- approvals, compliance = GST/tax/verification, analytics = reports/
-- dashboards, vendor_management = core onboarding/directory) -- not
-- invented. The exact set and their granularity is a product/business call
-- that may need revisiting once real plan tiers are defined; this is a
-- reasonable starting catalog, not a final one.
--
-- Absence of an entitlement row = entitled (enabled). This is deliberate,
-- not an oversight: every existing org/vendor keeps exactly today's access
-- with zero backfill needed -- a feature_entitlements row only ever needs
-- to exist to explicitly DISABLE a module for a tenant, not to grant it.

-- ─── feature_modules (catalog) ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS feature_modules (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code        text NOT NULL UNIQUE,
  label       text NOT NULL,
  description text,
  active      boolean NOT NULL DEFAULT true,
  created_at  timestamptz DEFAULT now()
);

INSERT INTO feature_modules (code, label, description) VALUES
  ('vendor_management', 'Vendor Management', 'Vendor onboarding, directory, and profile -- core baseline, always entitled in practice'),
  ('procurement',       'Procurement',       'Engagements/PR, RFQ, quotations, purchase orders, GRNs'),
  ('finance',           'Finance',           'Invoices, approvals, payments'),
  ('compliance',        'Compliance & Tax',  'GST/PAN/tax verification, compliance registrations'),
  ('analytics',         'Analytics',         'Reports and dashboards')
ON CONFLICT (code) DO NOTHING;

-- ─── feature_entitlements ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS feature_entitlements (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope       text NOT NULL CHECK (scope IN ('org', 'vendor')),
  org_id      uuid REFERENCES organizations(id) ON DELETE CASCADE,
  vendor_id   uuid REFERENCES vendors(id) ON DELETE CASCADE,
  module_code text NOT NULL REFERENCES feature_modules(code),
  enabled     boolean NOT NULL DEFAULT true,
  set_by      uuid REFERENCES profiles(id),
  set_at      timestamptz DEFAULT now(),
  notes       text,
  CONSTRAINT feature_entitlements_scope_consistency CHECK (
    (scope = 'org'    AND org_id    IS NOT NULL AND vendor_id IS NULL) OR
    (scope = 'vendor' AND vendor_id IS NOT NULL AND org_id    IS NULL)
  )
);

-- Partial unique indexes, not a plain multi-column UNIQUE -- learned from
-- 060's fix: NULL org_id/vendor_id would never actually collide under a
-- flat UNIQUE constraint, silently defeating the "one row per tenant per
-- module" intent.
CREATE UNIQUE INDEX IF NOT EXISTS uq_feature_entitlements_org    ON feature_entitlements(org_id, module_code)    WHERE scope = 'org';
CREATE UNIQUE INDEX IF NOT EXISTS uq_feature_entitlements_vendor ON feature_entitlements(vendor_id, module_code) WHERE scope = 'vendor';

-- ─── Query helper: entitled unless an explicit disabling row exists ────────
CREATE OR REPLACE FUNCTION is_feature_entitled(p_scope text, p_org_id uuid, p_vendor_id uuid, p_module_code text)
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT NOT EXISTS (
    SELECT 1 FROM feature_entitlements fe
    WHERE fe.scope = p_scope
      AND ((p_scope = 'org' AND fe.org_id = p_org_id) OR (p_scope = 'vendor' AND fe.vendor_id = p_vendor_id))
      AND fe.module_code = p_module_code
      AND fe.enabled = false
  );
$$;

-- ─── RLS ────────────────────────────────────────────────────────────────────
-- Platform-admin-only, matching Teams' RLS convention (059) -- this is
-- Super Admin's own configuration surface, not something an org/vendor
-- admin manages themselves. A tenant CAN read its own entitlements (so a
-- future "why can't I see this module" screen has something to query), but
-- only Super Admin ever writes.
ALTER TABLE feature_modules ENABLE ROW LEVEL SECURITY;
ALTER TABLE feature_entitlements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "feature_modules: anyone authenticated reads catalog"
  ON feature_modules FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "feature_modules: platform admins manage" ON feature_modules
  FOR ALL USING (is_platform_admin()) WITH CHECK (is_platform_admin());

CREATE POLICY "feature_entitlements: platform admins manage" ON feature_entitlements
  FOR ALL USING (is_platform_admin()) WITH CHECK (is_platform_admin());

CREATE POLICY "feature_entitlements: org member reads own org's entitlements" ON feature_entitlements
  FOR SELECT USING (
    is_platform_admin() OR (
      scope = 'org' AND EXISTS (SELECT 1 FROM organization_members om WHERE om.org_id = feature_entitlements.org_id AND om.profile_id = auth.uid())
    ) OR (
      scope = 'vendor' AND EXISTS (SELECT 1 FROM vendor_users vu WHERE vu.vendor_id = feature_entitlements.vendor_id AND vu.profile_id = auth.uid() AND vu.status = 'active')
    )
  );
