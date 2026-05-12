-- ─── Step 1: Expand profiles.role to include all 6 VMS roles ─────────────────
-- Keep 'admin' as a legacy alias; new code should use 'super_admin'
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('vendor', 'hr_user', 'manager', 'procurement_admin', 'finance_ap', 'super_admin', 'admin'));

-- Update signup trigger default to vendor (unchanged, but make explicit)
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, role, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'role', 'vendor'),
    NEW.raw_user_meta_data->>'full_name'
  );
  RETURN NEW;
END;
$$;

-- ─── Step 2: Update is_admin() to include super_admin ─────────────────────────
CREATE OR REPLACE FUNCTION is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'super_admin')
  );
$$;

-- ─── Step 3: Add is_internal_user() for broad read access ─────────────────────
-- Any non-vendor role can read vendor data (for their daily work)
CREATE OR REPLACE FUNCTION is_internal_user()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
      AND role IN ('admin', 'super_admin', 'hr_user', 'manager', 'procurement_admin', 'finance_ap')
  );
$$;

-- ─── Step 4: Widen SELECT policies to all internal users ──────────────────────

-- profiles
DROP POLICY IF EXISTS "profiles: users read own, admins read all" ON profiles;
CREATE POLICY "profiles: users read own, internal users read all"
  ON profiles FOR SELECT
  USING (id = auth.uid() OR is_internal_user());

-- vendors
DROP POLICY IF EXISTS "vendors: vendor reads own, admin reads all" ON vendors;
CREATE POLICY "vendors: vendor reads own, internal users read all"
  ON vendors FOR SELECT
  USING (profile_id = auth.uid() OR is_internal_user());

-- vendor_categories
DROP POLICY IF EXISTS "vendor_categories: vendor reads own, admin reads all" ON vendor_categories;
CREATE POLICY "vendor_categories: vendor reads own, internal users read all"
  ON vendor_categories FOR SELECT
  USING (
    vendor_id IN (SELECT id FROM vendors WHERE profile_id = auth.uid())
    OR is_internal_user()
  );

-- vendor_services
DROP POLICY IF EXISTS "vendor_services: vendor reads own, admin reads all" ON vendor_services;
CREATE POLICY "vendor_services: vendor reads own, internal users read all"
  ON vendor_services FOR SELECT
  USING (
    vendor_id IN (SELECT id FROM vendors WHERE profile_id = auth.uid())
    OR is_internal_user()
  );

-- vendor_documents
DROP POLICY IF EXISTS "vendor_documents: vendor reads own, admin reads all" ON vendor_documents;
CREATE POLICY "vendor_documents: vendor reads own, internal users read all"
  ON vendor_documents FOR SELECT
  USING (
    vendor_id IN (SELECT id FROM vendors WHERE profile_id = auth.uid())
    OR is_internal_user()
  );

-- vendor_ratings
DROP POLICY IF EXISTS "vendor_ratings: vendor reads own, admin reads all" ON vendor_ratings;
CREATE POLICY "vendor_ratings: vendor reads own, internal users read all"
  ON vendor_ratings FOR SELECT
  USING (
    vendor_id IN (SELECT id FROM vendors WHERE profile_id = auth.uid())
    OR is_internal_user()
  );

-- audit_log
DROP POLICY IF EXISTS "audit_log: admins read all" ON audit_log;
CREATE POLICY "audit_log: internal users read all"
  ON audit_log FOR SELECT
  USING (is_internal_user());
