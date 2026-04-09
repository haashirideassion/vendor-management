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
