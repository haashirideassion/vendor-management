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
