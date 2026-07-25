-- Organisation onboarding wizard (confirmed single largest remaining gap in
-- the app -- zero matches anywhere in the frontend for "establishment",
-- "legal entity", "authorized signatory", "memorandum" before this).
--
-- Distinct from organizations/create-with-admin (011_superadmin.sql's
-- route), which only creates the bare organizations row + first admin
-- membership -- this captures the FULL onboarding detail (establishment
-- profile, locations, compliance documents, authorized signatory) the org's
-- own admin fills in afterward, then submits for superadmin review. This is
-- a wholly separate review queue from vendor onboarding: organizations are
-- never subject to the vendor verification_status/organization_vendors
-- machinery, and vice versa.
--
-- Autosave per step (unlike vendor onboarding's sessionStorage-only,
-- all-or-nothing-at-final-submit model, OnboardingWizard.tsx): each step's
-- fields are persisted here via POST /api/org-onboarding/save-step as soon
-- as the admin completes that step, so a browser refresh/crash never loses
-- progress. Only the initiating admin (created_by) may resume or edit the
-- draft going forward -- enforced primarily at the Express layer (never
-- trust a client-supplied draft id -- resolved from org_id + caller identity
-- only, mirroring resolveVendorId's pattern in middleware/org.ts) and
-- mirrored here in RLS as defense-in-depth, since Express runs under the
-- service-role key and bypasses RLS entirely.

-- ─── org_onboarding_drafts ──────────────────────────────────────────────────
-- One draft per organization (org_id UNIQUE): an org onboards itself exactly
-- once. A superadmin rejection reopens the SAME row for editing (status
-- reverts to 'draft') rather than creating a second submission, so history
-- stays in one place and a resubmission is just another /submit call.
CREATE TABLE IF NOT EXISTS org_onboarding_drafts (
  id                                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                            uuid NOT NULL UNIQUE REFERENCES organizations(id) ON DELETE CASCADE,
  created_by                        uuid NOT NULL REFERENCES profiles(id),
  status                            text NOT NULL DEFAULT 'draft',
  current_step                      integer NOT NULL DEFAULT 1,

  -- ── Step 1: Welcome & Account Creation (autofilled from signup, editable) ──
  full_name                         text,
  designation                       text,
  work_email                        text,
  mobile                            text,
  accepted_terms                    boolean NOT NULL DEFAULT false,
  is_solo_user                      boolean NOT NULL DEFAULT false,

  -- ── Step 2: Establishment / Company Basics ──
  legal_entity_type                 text,
  date_of_incorporation             date,
  employee_count_range              text,
  is_group_company                  boolean NOT NULL DEFAULT false,

  -- ── Step 3: Location Setup Choice ──
  location_setup                    text,

  -- ── Step 5: Documents -- non-file fields only; the files themselves live ──
  -- in organization_onboarding_documents below (Certificate of Incorporation,
  -- PAN copy, MOA, AOA, Board Resolution, bank proof, optional GST cert).
  pan_number                        text,
  bank_name                         text,
  bank_account_number               text,
  bank_ifsc                         text,

  -- ── Step 6: Authorized Signatory (signature file also lives in ──
  -- organization_onboarding_documents, document_type =
  -- 'authorized_signatory_signature') ──
  signatory_name                    text,
  signatory_designation             text,
  signatory_email                   text,
  signatory_mobile                  text,
  signatory_same_for_all_locations  boolean NOT NULL DEFAULT true,

  submitted_at                      timestamptz,
  reviewed_by                       uuid REFERENCES profiles(id),
  reviewed_at                       timestamptz,
  rejection_reason                  text,

  created_at                        timestamptz NOT NULL DEFAULT now(),
  updated_at                        timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT org_onboarding_drafts_status_check
    CHECK (status IN ('draft', 'submitted', 'approved', 'rejected')),
  CONSTRAINT org_onboarding_drafts_legal_entity_type_check
    CHECK (legal_entity_type IS NULL OR legal_entity_type IN ('pvt_ltd', 'llp', 'proprietorship', 'partnership')),
  CONSTRAINT org_onboarding_drafts_employee_count_range_check
    CHECK (employee_count_range IS NULL OR employee_count_range IN ('1-10', '11-50', '51-200', '201-500', '500+')),
  CONSTRAINT org_onboarding_drafts_location_setup_check
    CHECK (location_setup IS NULL OR location_setup IN ('single', 'multiple'))
);

CREATE INDEX IF NOT EXISTS idx_org_onboarding_drafts_status ON org_onboarding_drafts(status);
CREATE INDEX IF NOT EXISTS idx_org_onboarding_drafts_created_by ON org_onboarding_drafts(created_by);

DROP TRIGGER IF EXISTS set_updated_at_org_onboarding_drafts ON org_onboarding_drafts;
CREATE TRIGGER set_updated_at_org_onboarding_drafts BEFORE UPDATE ON org_onboarding_drafts
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─── org_onboarding_locations ───────────────────────────────────────────────
-- Step 4: repeatable per location. org_id is denormalized from the parent
-- draft (not just draft_id) purely so this table's RLS can stay a flat
-- is_org_member(org_id) check, the same shape as every other business table
-- in 008_org_scoped_rls.sql, instead of an EXISTS-through-the-parent-draft
-- subquery for every policy.
CREATE TABLE IF NOT EXISTS org_onboarding_locations (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  draft_id                 uuid NOT NULL REFERENCES org_onboarding_drafts(id) ON DELETE CASCADE,
  org_id                   uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  location_name            text NOT NULL,
  address                  text,
  state                    text,
  city                     text,
  pincode                  text,
  employee_count           integer,
  nature_of_operations     text,
  is_registered_office     boolean NOT NULL DEFAULT false,
  has_women_employees      boolean,
  has_contract_labour      boolean,
  has_shift_operations     boolean,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT org_onboarding_locations_nature_check
    CHECK (nature_of_operations IS NULL OR nature_of_operations IN ('office', 'factory', 'warehouse', 'retail'))
);

CREATE INDEX IF NOT EXISTS idx_org_onboarding_locations_draft_id ON org_onboarding_locations(draft_id);
CREATE INDEX IF NOT EXISTS idx_org_onboarding_locations_org_id ON org_onboarding_locations(org_id);

DROP TRIGGER IF EXISTS set_updated_at_org_onboarding_locations ON org_onboarding_locations;
CREATE TRIGGER set_updated_at_org_onboarding_locations BEFORE UPDATE ON org_onboarding_locations
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─── organization_onboarding_documents ──────────────────────────────────────
-- Step 5 (+ the signature upload in Step 6) file uploads. Mirrors
-- vendor_documents' shape. document_type is a fixed category set (not
-- free-form) enforced both here and in the upload route -- see
-- backend/src/routes/orgOnboarding.ts, same 15MB / PDF-JPEG-DOCX validation
-- as vendors.ts's /upload-document.
CREATE TABLE IF NOT EXISTS organization_onboarding_documents (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  draft_id         uuid NOT NULL REFERENCES org_onboarding_drafts(id) ON DELETE CASCADE,
  org_id           uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  document_type    text NOT NULL,
  file_name        text NOT NULL,
  storage_path     text NOT NULL,
  uploaded_by      uuid REFERENCES profiles(id),
  uploaded_at      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT organization_onboarding_documents_type_check CHECK (document_type IN (
    'certificate_of_incorporation', 'pan_copy', 'memorandum_of_association',
    'articles_of_association', 'board_resolution', 'bank_proof',
    'gst_certificate', 'authorized_signatory_signature'
  ))
);

CREATE INDEX IF NOT EXISTS idx_org_onboarding_documents_draft_id ON organization_onboarding_documents(draft_id);

-- ─── RLS ─────────────────────────────────────────────────────────────────────
-- Express (service-role key) is the real gate -- ownership + permission
-- checks live in backend/src/routes/orgOnboarding.ts. These policies are
-- defense-in-depth only, mirroring 008_org_scoped_rls.sql's pattern: direct
-- Supabase access stays scoped to (a) the draft's own creator, or (b) a
-- platform admin reviewing submissions.
ALTER TABLE org_onboarding_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE org_onboarding_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_onboarding_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org_onboarding_drafts: owner or platform admin read" ON org_onboarding_drafts;
CREATE POLICY "org_onboarding_drafts: owner or platform admin read" ON org_onboarding_drafts
  FOR SELECT USING (created_by = auth.uid() OR is_platform_admin());

DROP POLICY IF EXISTS "org_onboarding_drafts: owner insert" ON org_onboarding_drafts;
CREATE POLICY "org_onboarding_drafts: owner insert" ON org_onboarding_drafts
  FOR INSERT WITH CHECK (created_by = auth.uid() AND is_org_member(org_id));

DROP POLICY IF EXISTS "org_onboarding_drafts: owner or platform admin update" ON org_onboarding_drafts;
CREATE POLICY "org_onboarding_drafts: owner or platform admin update" ON org_onboarding_drafts
  FOR UPDATE USING (created_by = auth.uid() OR is_platform_admin());

DROP POLICY IF EXISTS "org_onboarding_locations: reachable via own draft" ON org_onboarding_locations;
CREATE POLICY "org_onboarding_locations: reachable via own draft" ON org_onboarding_locations
  FOR SELECT USING (
    is_platform_admin() OR EXISTS (
      SELECT 1 FROM org_onboarding_drafts d WHERE d.id = org_onboarding_locations.draft_id AND d.created_by = auth.uid()
    )
  );

DROP POLICY IF EXISTS "org_onboarding_locations: owner manages via own draft" ON org_onboarding_locations;
CREATE POLICY "org_onboarding_locations: owner manages via own draft" ON org_onboarding_locations
  FOR ALL USING (
    EXISTS (SELECT 1 FROM org_onboarding_drafts d WHERE d.id = org_onboarding_locations.draft_id AND d.created_by = auth.uid())
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM org_onboarding_drafts d WHERE d.id = org_onboarding_locations.draft_id AND d.created_by = auth.uid())
  );

DROP POLICY IF EXISTS "organization_onboarding_documents: reachable via own draft" ON organization_onboarding_documents;
CREATE POLICY "organization_onboarding_documents: reachable via own draft" ON organization_onboarding_documents
  FOR SELECT USING (
    is_platform_admin() OR EXISTS (
      SELECT 1 FROM org_onboarding_drafts d WHERE d.id = organization_onboarding_documents.draft_id AND d.created_by = auth.uid()
    )
  );

DROP POLICY IF EXISTS "organization_onboarding_documents: owner manages via own draft" ON organization_onboarding_documents;
CREATE POLICY "organization_onboarding_documents: owner manages via own draft" ON organization_onboarding_documents
  FOR ALL USING (
    EXISTS (SELECT 1 FROM org_onboarding_drafts d WHERE d.id = organization_onboarding_documents.draft_id AND d.created_by = auth.uid())
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM org_onboarding_drafts d WHERE d.id = organization_onboarding_documents.draft_id AND d.created_by = auth.uid())
  );
