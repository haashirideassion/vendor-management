-- Vendor Onboarding Redesign, Phase 3: Verification framework (manual-only).
--
-- Generic, reusable verification model -- one table for PAN/GST/MSME/bank
-- verification instead of per-field logic, so a real automated provider can
-- slot in later (Setu/Karza/Deepvue-style KYC APIs -- confirmed no free
-- unlimited official option exists for PAN/GST today) without a schema
-- change. Ships MANUAL-ONLY: a reviewer checks PAN/GSTIN on the free
-- government portal themselves and records the outcome here.
--
-- `subject_type`/`subject_id` is a polymorphic reference (same pattern the
-- app already uses for audit_log.entity_type/entity_id and
-- approval_requests.entity_type/entity_id) -- no FK is possible across
-- multiple subject tables, so this is enforced at the application layer,
-- not the database layer, consistent with those existing tables.
--
-- 'bank_account' is included in the subject_type catalog now even though
-- bank_accounts doesn't exist until Phase 4 -- the CHECK constraint doesn't
-- require the table to exist, and this avoids a second migration touching
-- this constraint later.
--
-- tax_registrations/compliance_registrations had a plain verification_status
-- column added in Phase 2 as a stopgap; this migration backfills that into a
-- proper `verifications` row per existing registration, links it via the new
-- `verification_id`, and retires the now-redundant inline columns -- single
-- source of truth going forward.

-- ─── verifications ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS verifications (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_type          text NOT NULL CHECK (subject_type IN ('tax_registration', 'compliance_registration', 'bank_account')),
  subject_id            uuid NOT NULL,
  verification_type     text NOT NULL, -- e.g. 'PAN', 'GSTIN', 'MSME', 'BANK_ACCOUNT' -- denormalized for filtering without a join
  provider              text NOT NULL DEFAULT 'manual',
  status                text NOT NULL DEFAULT 'not_verified'
                          CHECK (status IN ('not_verified', 'pending', 'verified', 'failed', 'manual_review')),
  request_payload       jsonb,
  response_snapshot     jsonb,
  verified_at           timestamptz,
  failure_reason        text,
  retry_count           integer NOT NULL DEFAULT 0,
  manual_override_by    uuid REFERENCES profiles(id),
  manual_override_reason text,
  -- At most one CURRENT verification per subject -- history is kept (an
  -- edit to a verified registration creates a new pending row rather than
  -- mutating this one), enforced by the partial unique index below.
  is_current            boolean NOT NULL DEFAULT true,
  created_at            timestamptz DEFAULT now(),
  updated_at            timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_verifications_subject ON verifications(subject_type, subject_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_verifications_one_current_per_subject
  ON verifications(subject_type, subject_id) WHERE is_current;

DROP TRIGGER IF EXISTS verifications_set_updated_at ON verifications;
CREATE TRIGGER verifications_set_updated_at
  BEFORE UPDATE ON verifications
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─── Link tax_registrations to verifications, retire the stopgap columns ──
ALTER TABLE tax_registrations ADD COLUMN IF NOT EXISTS verification_id uuid REFERENCES verifications(id);

INSERT INTO verifications (subject_type, subject_id, verification_type, status, verified_at, manual_override_by)
SELECT 'tax_registration', tr.id, tr.registration_type, tr.verification_status, tr.verified_at, tr.verified_by
FROM tax_registrations tr
WHERE NOT EXISTS (
  SELECT 1 FROM verifications v WHERE v.subject_type = 'tax_registration' AND v.subject_id = tr.id
);

UPDATE tax_registrations tr
SET verification_id = v.id
FROM verifications v
WHERE v.subject_type = 'tax_registration' AND v.subject_id = tr.id AND tr.verification_id IS NULL;

ALTER TABLE tax_registrations DROP COLUMN IF EXISTS verification_status;
ALTER TABLE tax_registrations DROP COLUMN IF EXISTS verified_by;
ALTER TABLE tax_registrations DROP COLUMN IF EXISTS verified_at;

-- ─── Link compliance_registrations to verifications, retire stopgap columns ─
ALTER TABLE compliance_registrations ADD COLUMN IF NOT EXISTS verification_id uuid REFERENCES verifications(id);

INSERT INTO verifications (subject_type, subject_id, verification_type, status, verified_at, manual_override_by)
SELECT 'compliance_registration', cr.id, req.code, cr.verification_status, cr.verified_at, cr.verified_by
FROM compliance_registrations cr
JOIN compliance_requirements req ON req.id = cr.requirement_id
WHERE NOT EXISTS (
  SELECT 1 FROM verifications v WHERE v.subject_type = 'compliance_registration' AND v.subject_id = cr.id
);

UPDATE compliance_registrations cr
SET verification_id = v.id
FROM verifications v
WHERE v.subject_type = 'compliance_registration' AND v.subject_id = cr.id AND cr.verification_id IS NULL;

ALTER TABLE compliance_registrations DROP COLUMN IF EXISTS verification_status;
ALTER TABLE compliance_registrations DROP COLUMN IF EXISTS verified_by;
ALTER TABLE compliance_registrations DROP COLUMN IF EXISTS verified_at;

-- ─── RLS ────────────────────────────────────────────────────────────────────
-- Verification records are reviewer-authored (manual verification decisions,
-- including provider request/response snapshots once automated verification
-- exists) -- vendors can read the outcome via their registration's
-- verification_id, but only admins write to this table directly.
ALTER TABLE verifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "verifications: readable via owning tax/compliance registration, admin all"
  ON verifications FOR SELECT
  USING (
    is_admin() OR EXISTS (
      SELECT 1 FROM tax_registrations tr
      JOIN legal_entities le ON le.id = tr.legal_entity_id
      JOIN vendor_users vu ON vu.vendor_id = le.vendor_id
      WHERE verifications.subject_type = 'tax_registration'
        AND tr.id = verifications.subject_id
        AND vu.profile_id = auth.uid() AND vu.status = 'active'
    ) OR EXISTS (
      SELECT 1 FROM compliance_registrations cr
      JOIN legal_entities le ON le.id = cr.legal_entity_id
      JOIN vendor_users vu ON vu.vendor_id = le.vendor_id
      WHERE verifications.subject_type = 'compliance_registration'
        AND cr.id = verifications.subject_id
        AND vu.profile_id = auth.uid() AND vu.status = 'active'
    )
  );

CREATE POLICY "verifications: admin manages all" ON verifications FOR ALL USING (is_admin()) WITH CHECK (is_admin());
