-- ─── Vendor ID sequence ───────────────────────────────────────────────────────
CREATE SEQUENCE IF NOT EXISTS vendor_seq START 1;

-- ─── profiles ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS profiles (
  id         uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role       text NOT NULL DEFAULT 'vendor' CHECK (role IN ('admin', 'vendor')),
  full_name  text,
  email      text NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- ─── service_categories ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS service_categories (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL UNIQUE,
  description text,
  is_active   boolean DEFAULT true,
  created_at  timestamptz DEFAULT now(),
  created_by  uuid REFERENCES profiles(id)
);

-- ─── vendors ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS vendors (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id           uuid REFERENCES profiles(id) ON DELETE CASCADE UNIQUE,
  vendor_id_code       text UNIQUE,
  company_name         text NOT NULL,
  contact_name         text NOT NULL,
  contact_email        text NOT NULL,
  contact_phone        text,
  tax_gst_number       text,
  bank_name            text,
  bank_account_number  text,
  bank_routing_number  text,
  status               text NOT NULL DEFAULT 'pending_review'
                         CHECK (status IN (
                           'pending_review',
                           'active',
                           'action_required',
                           'suspended',
                           'rejected'
                         )),
  contract_start_date  date,
  contract_anniversary date,
  renewal_notified_at  timestamptz,
  admin_notes          text,
  created_at           timestamptz DEFAULT now(),
  updated_at           timestamptz DEFAULT now()
);

-- ─── vendor_categories ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS vendor_categories (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id   uuid REFERENCES vendors(id) ON DELETE CASCADE,
  category_id uuid REFERENCES service_categories(id) ON DELETE CASCADE,
  assigned_at timestamptz DEFAULT now(),
  UNIQUE (vendor_id, category_id)
);

-- ─── vendor_services ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS vendor_services (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id   uuid REFERENCES vendors(id) ON DELETE CASCADE,
  name        text NOT NULL,
  description text,
  created_at  timestamptz DEFAULT now()
);

-- ─── vendor_documents ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS vendor_documents (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id     uuid REFERENCES vendors(id) ON DELETE CASCADE,
  document_type text NOT NULL CHECK (document_type IN (
                   'tc_agreement',
                   'insurance_coi',
                   'bank_letter',
                   'tax_certificate',
                   'other'
                 )),
  file_name     text NOT NULL,
  storage_path  text NOT NULL,
  uploaded_at   timestamptz DEFAULT now(),
  expires_at    date,
  verified      boolean DEFAULT false,
  verified_by   uuid REFERENCES profiles(id),
  verified_at   timestamptz,
  notes         text
);

-- ─── vendor_ratings ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS vendor_ratings (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id  uuid REFERENCES vendors(id) ON DELETE CASCADE,
  rated_by   uuid REFERENCES profiles(id),
  score      integer NOT NULL CHECK (score BETWEEN 1 AND 5),
  comment    text,
  created_at timestamptz DEFAULT now(),
  UNIQUE (vendor_id, rated_by)
);

-- ─── audit_log ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_log (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type  text NOT NULL,
  entity_id    uuid NOT NULL,
  action       text NOT NULL,
  old_value    jsonb,
  new_value    jsonb,
  performed_by uuid REFERENCES profiles(id),
  created_at   timestamptz DEFAULT now()
);

-- ─── Indexes ──────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_vendors_status         ON vendors(status);
CREATE INDEX IF NOT EXISTS idx_vendors_profile_id     ON vendors(profile_id);
CREATE INDEX IF NOT EXISTS idx_vendors_anniversary    ON vendors(contract_anniversary);
CREATE INDEX IF NOT EXISTS idx_vendor_categories_vid  ON vendor_categories(vendor_id);
CREATE INDEX IF NOT EXISTS idx_vendor_documents_vid   ON vendor_documents(vendor_id);
CREATE INDEX IF NOT EXISTS idx_vendor_ratings_vid     ON vendor_ratings(vendor_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_entity       ON audit_log(entity_id);
-- ─── Enable RLS on all tables ─────────────────────────────────────────────────
ALTER TABLE profiles         ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendors          ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendor_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendor_services  ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendor_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendor_ratings   ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log        ENABLE ROW LEVEL SECURITY;

-- ─── Helper: is the current user an admin? ────────────────────────────────────
CREATE OR REPLACE FUNCTION is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
  );
$$;

-- ─── profiles ─────────────────────────────────────────────────────────────────
CREATE POLICY "profiles: users read own, admins read all"
  ON profiles FOR SELECT
  USING (id = auth.uid() OR is_admin());

CREATE POLICY "profiles: users update own"
  ON profiles FOR UPDATE
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- ─── service_categories ───────────────────────────────────────────────────────
CREATE POLICY "categories: authenticated users read"
  ON service_categories FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "categories: admins insert"
  ON service_categories FOR INSERT
  TO authenticated
  WITH CHECK (is_admin());

CREATE POLICY "categories: admins update"
  ON service_categories FOR UPDATE
  TO authenticated
  USING (is_admin());

CREATE POLICY "categories: admins delete"
  ON service_categories FOR DELETE
  TO authenticated
  USING (is_admin());

-- ─── vendors ──────────────────────────────────────────────────────────────────
CREATE POLICY "vendors: vendor reads own, admin reads all"
  ON vendors FOR SELECT
  USING (
    profile_id = auth.uid() OR is_admin()
  );

CREATE POLICY "vendors: vendor inserts own"
  ON vendors FOR INSERT
  WITH CHECK (
    profile_id = auth.uid()
  );

CREATE POLICY "vendors: vendor updates own pending, admin updates all"
  ON vendors FOR UPDATE
  USING (
    (profile_id = auth.uid() AND status = 'pending_review') OR is_admin()
  );

-- ─── vendor_categories ────────────────────────────────────────────────────────
CREATE POLICY "vendor_categories: vendor reads own, admin reads all"
  ON vendor_categories FOR SELECT
  USING (
    vendor_id IN (SELECT id FROM vendors WHERE profile_id = auth.uid())
    OR is_admin()
  );

CREATE POLICY "vendor_categories: vendor inserts own, admin inserts all"
  ON vendor_categories FOR INSERT
  WITH CHECK (
    vendor_id IN (SELECT id FROM vendors WHERE profile_id = auth.uid())
    OR is_admin()
  );

CREATE POLICY "vendor_categories: admin deletes"
  ON vendor_categories FOR DELETE
  USING (is_admin());

-- ─── vendor_services ──────────────────────────────────────────────────────────
CREATE POLICY "vendor_services: vendor reads own, admin reads all"
  ON vendor_services FOR SELECT
  USING (
    vendor_id IN (SELECT id FROM vendors WHERE profile_id = auth.uid())
    OR is_admin()
  );

CREATE POLICY "vendor_services: vendor inserts own, admin inserts all"
  ON vendor_services FOR INSERT
  WITH CHECK (
    vendor_id IN (SELECT id FROM vendors WHERE profile_id = auth.uid())
    OR is_admin()
  );

CREATE POLICY "vendor_services: vendor updates own, admin updates all"
  ON vendor_services FOR UPDATE
  USING (
    vendor_id IN (SELECT id FROM vendors WHERE profile_id = auth.uid())
    OR is_admin()
  );

CREATE POLICY "vendor_services: vendor deletes own, admin deletes all"
  ON vendor_services FOR DELETE
  USING (
    vendor_id IN (SELECT id FROM vendors WHERE profile_id = auth.uid())
    OR is_admin()
  );

-- ─── vendor_documents ─────────────────────────────────────────────────────────
CREATE POLICY "vendor_documents: vendor reads own, admin reads all"
  ON vendor_documents FOR SELECT
  USING (
    vendor_id IN (SELECT id FROM vendors WHERE profile_id = auth.uid())
    OR is_admin()
  );

CREATE POLICY "vendor_documents: vendor inserts own"
  ON vendor_documents FOR INSERT
  WITH CHECK (
    vendor_id IN (SELECT id FROM vendors WHERE profile_id = auth.uid())
    OR is_admin()
  );

CREATE POLICY "vendor_documents: admin updates (verify)"
  ON vendor_documents FOR UPDATE
  USING (is_admin());

CREATE POLICY "vendor_documents: admin deletes"
  ON vendor_documents FOR DELETE
  USING (is_admin());

-- ─── vendor_ratings ───────────────────────────────────────────────────────────
CREATE POLICY "vendor_ratings: vendor reads own, admin reads all"
  ON vendor_ratings FOR SELECT
  USING (
    vendor_id IN (SELECT id FROM vendors WHERE profile_id = auth.uid())
    OR is_admin()
  );

CREATE POLICY "vendor_ratings: admins insert"
  ON vendor_ratings FOR INSERT
  WITH CHECK (is_admin());

CREATE POLICY "vendor_ratings: admins update"
  ON vendor_ratings FOR UPDATE
  USING (is_admin());

-- ─── audit_log ────────────────────────────────────────────────────────────────
CREATE POLICY "audit_log: admins read all"
  ON audit_log FOR SELECT
  USING (is_admin());

CREATE POLICY "audit_log: service role insert"
  ON audit_log FOR INSERT
  WITH CHECK (true);
-- ─── 1. Auto-create profile on auth signup ────────────────────────────────────
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

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ─── 2. Auto-update updated_at on vendors ─────────────────────────────────────
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS vendors_set_updated_at ON vendors;
CREATE TRIGGER vendors_set_updated_at
  BEFORE UPDATE ON vendors
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─── 3. Generate vendor_id_code when status becomes 'active' ──────────────────
CREATE OR REPLACE FUNCTION assign_vendor_id_on_activation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status = 'active' AND OLD.status <> 'active' AND NEW.vendor_id_code IS NULL THEN
    NEW.vendor_id_code := 'IDN-' || LPAD(nextval('vendor_seq')::text, 4, '0');
    NEW.contract_start_date := CURRENT_DATE;
    NEW.contract_anniversary := CURRENT_DATE + INTERVAL '1 year';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS assign_vendor_id ON vendors;
CREATE TRIGGER assign_vendor_id
  BEFORE UPDATE ON vendors
  FOR EACH ROW EXECUTE FUNCTION assign_vendor_id_on_activation();

-- ─── 4. Write audit log on vendor status change ───────────────────────────────
CREATE OR REPLACE FUNCTION log_vendor_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NEW.status <> OLD.status THEN
    INSERT INTO audit_log (entity_type, entity_id, action, old_value, new_value, performed_by)
    VALUES (
      'vendor',
      NEW.id,
      'status_changed',
      jsonb_build_object('status', OLD.status),
      jsonb_build_object('status', NEW.status),
      auth.uid()
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS vendor_audit_status ON vendors;
CREATE TRIGGER vendor_audit_status
  AFTER UPDATE ON vendors
  FOR EACH ROW EXECUTE FUNCTION log_vendor_status_change();
-- ─── Default Service Categories ───────────────────────────────────────────────
INSERT INTO service_categories (name, description) VALUES
  ('IT & Software', 'Software development, IT support, cloud services, cybersecurity'),
  ('Marketing & Design', 'Branding, digital marketing, graphic design, content creation'),
  ('Legal & Compliance', 'Legal counsel, regulatory compliance, contract management'),
  ('Finance & Accounting', 'Bookkeeping, auditing, tax advisory, payroll'),
  ('Human Resources', 'Recruitment, training, HR consulting, staffing'),
  ('Facilities & Maintenance', 'Cleaning, repairs, building maintenance, security'),
  ('Logistics & Delivery', 'Courier services, warehousing, freight, last-mile delivery'),
  ('Catering & Events', 'Corporate catering, event management, hospitality'),
  ('Printing & Stationery', 'Business cards, brochures, office supplies, promotional items'),
  ('Consulting & Advisory', 'Business strategy, management consulting, research')
ON CONFLICT (name) DO NOTHING;

-- ─── Admin User ───────────────────────────────────────────────────────────────
-- After creating an admin user via Supabase Auth dashboard or via the API,
-- manually update their role in the profiles table:
--
-- UPDATE profiles SET role = 'admin' WHERE email = 'admin@yourdomain.com';
--
-- OR run this SQL in the Supabase SQL editor after the user has signed up:
-- UPDATE profiles SET role = 'admin', full_name = 'Admin User'
-- WHERE email = 'admin@yourdomain.com';
