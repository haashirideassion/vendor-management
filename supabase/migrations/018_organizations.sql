-- ─── organizations table ──────────────────────────────────────────────────────
-- Minimal organization support for multi-tenancy
CREATE TABLE IF NOT EXISTS organizations (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                text NOT NULL UNIQUE,
  description         text,
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_organizations_name ON organizations(name);

-- ─── Insert default organization ───────────────────────────────────────────
INSERT INTO organizations (name, description) VALUES
  ('Default Organization', 'Default organization for single-tenant setup')
ON CONFLICT (name) DO NOTHING;

-- ─── Enable RLS ────────────────────────────────────────────────────────────
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;

-- Admins can manage organizations
CREATE POLICY "organizations: admins select"
  ON organizations FOR SELECT
  TO authenticated
  USING (is_admin());

CREATE POLICY "organizations: admins insert"
  ON organizations FOR INSERT
  TO authenticated
  WITH CHECK (is_admin());

CREATE POLICY "organizations: admins update"
  ON organizations FOR UPDATE
  TO authenticated
  USING (is_admin());

-- Everyone can read default organization
CREATE POLICY "organizations: public read default"
  ON organizations FOR SELECT
  USING (true);
