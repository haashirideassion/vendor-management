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
