-- ═══════════════════════════════════════════════════════════════════════════════
-- 016_run_in_dashboard.sql
-- Run this entire file in the Supabase SQL Editor to bring the database schema
-- up to date with the current application code.
--
-- What it does:
--   1. Patches engagement_line_items  — removes the unit_price column constraint
--      (the app no longer captures rate at engagement creation time)
--   2. Adds invoices.engagement_id     — allows invoices linked directly to an
--      engagement without a contract
--   3. Adds vendor_categories RLS      — lets vendors update their own categories
--   4. Creates the attachments table   — polymorphic file-attachment store for
--      Engagements, POs, GRNs, Contracts, and Invoices
-- ═══════════════════════════════════════════════════════════════════════════════


-- ─── 1. engagement_line_items: ensure unit_price column exists ───────────────
-- The Rate field was removed from the engagement creation UI.
-- The column is kept as nullable with DEFAULT 0 for backward compatibility.
-- This block handles both cases: column already exists, or needs to be added.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'engagement_line_items'
      AND column_name  = 'unit_price'
  ) THEN
    -- Column missing entirely — add it
    ALTER TABLE engagement_line_items
      ADD COLUMN unit_price numeric NOT NULL DEFAULT 0
        CHECK (unit_price >= 0);
  ELSE
    -- Column exists but may be NOT NULL without a default — make it optional
    ALTER TABLE engagement_line_items
      ALTER COLUMN unit_price DROP NOT NULL;
    ALTER TABLE engagement_line_items
      ALTER COLUMN unit_price SET DEFAULT 0;
  END IF;
END;
$$;


-- ─── 2. engagement_line_items RLS (idempotent) ────────────────────────────────

ALTER TABLE engagement_line_items ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='engagement_line_items' AND policyname='eli: internal users select') THEN
    CREATE POLICY "eli: internal users select" ON engagement_line_items FOR SELECT TO authenticated USING (is_internal_user());
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='engagement_line_items' AND policyname='eli: internal users insert') THEN
    CREATE POLICY "eli: internal users insert" ON engagement_line_items FOR INSERT TO authenticated WITH CHECK (is_internal_user());
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='engagement_line_items' AND policyname='eli: internal users update') THEN
    CREATE POLICY "eli: internal users update" ON engagement_line_items FOR UPDATE TO authenticated USING (is_internal_user()) WITH CHECK (is_internal_user());
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='engagement_line_items' AND policyname='eli: internal users delete') THEN
    CREATE POLICY "eli: internal users delete" ON engagement_line_items FOR DELETE TO authenticated USING (is_internal_user());
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='engagement_line_items' AND policyname='eli: vendor reads invited') THEN
    CREATE POLICY "eli: vendor reads invited"
      ON engagement_line_items FOR SELECT
      USING (
        engagement_id IN (
          SELECT engagement_id FROM rfqs
          WHERE vendor_id IN (SELECT id FROM vendors WHERE profile_id = auth.uid())
        )
      );
  END IF;
END $$;


-- ─── 3. invoices: add engagement_id column (idempotent) ──────────────────────

ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS engagement_id uuid REFERENCES engagements(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_invoices_engagement ON invoices(engagement_id);


-- ─── 4. vendor_categories: self-service RLS for vendors ───────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'vendor_categories' AND policyname = 'vendor_categories: vendor inserts own'
  ) THEN
    CREATE POLICY "vendor_categories: vendor inserts own"
      ON vendor_categories FOR INSERT TO authenticated
      WITH CHECK (vendor_id IN (SELECT id FROM vendors WHERE profile_id = auth.uid()));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'vendor_categories' AND policyname = 'vendor_categories: vendor deletes own'
  ) THEN
    CREATE POLICY "vendor_categories: vendor deletes own"
      ON vendor_categories FOR DELETE TO authenticated
      USING (vendor_id IN (SELECT id FROM vendors WHERE profile_id = auth.uid()));
  END IF;
END;
$$;


-- ─── 5. attachments table ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS attachments (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type    text        NOT NULL,
  entity_id      uuid        NOT NULL,
  file_name      text        NOT NULL,
  original_name  text        NOT NULL,
  file_extension text        NOT NULL,
  mime_type      text        NOT NULL,
  file_size      bigint      NOT NULL,
  storage_path   text        NOT NULL UNIQUE,
  uploaded_by    uuid        NOT NULL REFERENCES profiles(id),
  created_at     timestamptz NOT NULL DEFAULT now(),
  is_deleted     boolean     NOT NULL DEFAULT false,

  CONSTRAINT chk_entity_type CHECK (
    entity_type IN ('engagement','purchase_order','grn','contract','invoice')
  ),
  CONSTRAINT chk_file_size CHECK (file_size > 0 AND file_size <= 20971520)
);

CREATE INDEX IF NOT EXISTS idx_attachments_entity
  ON attachments (entity_type, entity_id) WHERE NOT is_deleted;

CREATE INDEX IF NOT EXISTS idx_attachments_uploaded_by
  ON attachments (uploaded_by);

ALTER TABLE attachments ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='attachments' AND policyname='Admins manage all attachments') THEN
    CREATE POLICY "Admins manage all attachments"
      ON attachments FOR ALL
      USING (is_admin()) WITH CHECK (is_admin());
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='attachments' AND policyname='Internal users read attachments') THEN
    CREATE POLICY "Internal users read attachments"
      ON attachments FOR SELECT
      USING (NOT is_deleted AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role <> 'vendor'));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='attachments' AND policyname='Internal users insert attachments') THEN
    CREATE POLICY "Internal users insert attachments"
      ON attachments FOR INSERT
      WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role <> 'vendor'));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='attachments' AND policyname='Internal users soft-delete attachments') THEN
    CREATE POLICY "Internal users soft-delete attachments"
      ON attachments FOR UPDATE
      USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role <> 'vendor'))
      WITH CHECK (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='attachments' AND policyname='Vendors read own invoice attachments') THEN
    CREATE POLICY "Vendors read own invoice attachments"
      ON attachments FOR SELECT
      USING (
        entity_type = 'invoice' AND NOT is_deleted
        AND EXISTS (
          SELECT 1 FROM invoices i JOIN vendors v ON v.id = i.vendor_id
          WHERE i.id = entity_id AND v.profile_id = auth.uid()
        )
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='attachments' AND policyname='Vendors insert own invoice attachments') THEN
    CREATE POLICY "Vendors insert own invoice attachments"
      ON attachments FOR INSERT
      WITH CHECK (
        entity_type = 'invoice' AND uploaded_by = auth.uid()
        AND EXISTS (
          SELECT 1 FROM invoices i JOIN vendors v ON v.id = i.vendor_id
          WHERE i.id = entity_id AND v.profile_id = auth.uid()
        )
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='attachments' AND policyname='Vendors read engagement attachments') THEN
    CREATE POLICY "Vendors read engagement attachments"
      ON attachments FOR SELECT
      USING (
        entity_type = 'engagement' AND NOT is_deleted
        AND EXISTS (
          SELECT 1 FROM engagement_vendors ev JOIN vendors v ON v.id = ev.vendor_id
          WHERE ev.engagement_id = entity_id AND v.profile_id = auth.uid()
        )
      );
  END IF;
END $$;


-- ─── 6. Storage bucket policies (vendor-documents, attachments/ prefix) ───────

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='storage' AND tablename='objects'
      AND policyname='Internal users manage attachment storage'
  ) THEN
    CREATE POLICY "Internal users manage attachment storage"
      ON storage.objects FOR ALL TO authenticated
      USING    (bucket_id='vendor-documents' AND name LIKE 'attachments/%' AND EXISTS (SELECT 1 FROM profiles WHERE id=auth.uid() AND role<>'vendor'))
      WITH CHECK (bucket_id='vendor-documents' AND name LIKE 'attachments/%' AND EXISTS (SELECT 1 FROM profiles WHERE id=auth.uid() AND role<>'vendor'));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='storage' AND tablename='objects'
      AND policyname='Vendors manage invoice attachment storage'
  ) THEN
    CREATE POLICY "Vendors manage invoice attachment storage"
      ON storage.objects FOR ALL TO authenticated
      USING    (bucket_id='vendor-documents' AND name LIKE 'attachments/invoice/%' AND EXISTS (SELECT 1 FROM profiles WHERE id=auth.uid() AND role='vendor'))
      WITH CHECK (bucket_id='vendor-documents' AND name LIKE 'attachments/invoice/%' AND EXISTS (SELECT 1 FROM profiles WHERE id=auth.uid() AND role='vendor'));
  END IF;
END $$;
