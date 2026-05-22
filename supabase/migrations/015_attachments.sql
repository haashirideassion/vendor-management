-- 015_attachments.sql
-- Polymorphic attachment table for Engagements, POs, GRNs, Contracts, and Invoices.
-- Files are stored in the existing 'vendor-documents' bucket under the 'attachments/' prefix.

-- ─── Table ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS attachments (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type    text        NOT NULL,
  entity_id      uuid        NOT NULL,
  file_name      text        NOT NULL,        -- sanitised display name
  original_name  text        NOT NULL,        -- original name as provided by the browser
  file_extension text        NOT NULL,        -- lower-case, no leading dot
  mime_type      text        NOT NULL,
  file_size      bigint      NOT NULL,        -- bytes
  storage_path   text        NOT NULL UNIQUE, -- path inside 'vendor-documents' bucket
  uploaded_by    uuid        NOT NULL REFERENCES profiles(id),
  created_at     timestamptz NOT NULL DEFAULT now(),
  is_deleted     boolean     NOT NULL DEFAULT false,

  CONSTRAINT chk_entity_type CHECK (
    entity_type IN ('engagement', 'purchase_order', 'grn', 'contract', 'invoice')
  ),
  CONSTRAINT chk_file_size CHECK (file_size > 0 AND file_size <= 20971520) -- 20 MB
);

CREATE INDEX IF NOT EXISTS idx_attachments_entity
  ON attachments (entity_type, entity_id)
  WHERE NOT is_deleted;

CREATE INDEX IF NOT EXISTS idx_attachments_uploaded_by
  ON attachments (uploaded_by);

-- ─── Row Level Security ────────────────────────────────────────────────────────

ALTER TABLE attachments ENABLE ROW LEVEL SECURITY;

-- Full access for admin/super_admin
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'attachments'
    AND policyname = 'Admins manage all attachments'
  ) THEN
    CREATE POLICY "Admins manage all attachments"
      ON attachments FOR ALL
      USING    (is_admin())
      WITH CHECK (is_admin());
  END IF;
END $$;

-- Internal non-vendor roles: SELECT and INSERT
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'attachments'
    AND policyname = 'Internal users read attachments'
  ) THEN
    CREATE POLICY "Internal users read attachments"
      ON attachments FOR SELECT
      USING (
        NOT is_deleted
        AND EXISTS (
          SELECT 1 FROM profiles
          WHERE id = auth.uid() AND role <> 'vendor'
        )
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'attachments'
    AND policyname = 'Internal users insert attachments'
  ) THEN
    CREATE POLICY "Internal users insert attachments"
      ON attachments FOR INSERT
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM profiles
          WHERE id = auth.uid() AND role <> 'vendor'
        )
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'attachments'
    AND policyname = 'Internal users soft-delete attachments'
  ) THEN
    CREATE POLICY "Internal users soft-delete attachments"
      ON attachments FOR UPDATE
      USING (
        EXISTS (
          SELECT 1 FROM profiles
          WHERE id = auth.uid() AND role <> 'vendor'
        )
      )
      WITH CHECK (true);
  END IF;
END $$;

-- Vendors: read their own invoice attachments
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'attachments'
    AND policyname = 'Vendors read own invoice attachments'
  ) THEN
    CREATE POLICY "Vendors read own invoice attachments"
      ON attachments FOR SELECT
      USING (
        entity_type = 'invoice'
        AND NOT is_deleted
        AND EXISTS (
          SELECT 1 FROM invoices i
          JOIN vendors v ON v.id = i.vendor_id
          WHERE i.id = entity_id
            AND v.profile_id = auth.uid()
        )
      );
  END IF;
END $$;

-- Vendors: insert attachments for their own invoices
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'attachments'
    AND policyname = 'Vendors insert own invoice attachments'
  ) THEN
    CREATE POLICY "Vendors insert own invoice attachments"
      ON attachments FOR INSERT
      WITH CHECK (
        entity_type = 'invoice'
        AND uploaded_by = auth.uid()
        AND EXISTS (
          SELECT 1 FROM invoices i
          JOIN vendors v ON v.id = i.vendor_id
          WHERE i.id = entity_id
            AND v.profile_id = auth.uid()
        )
      );
  END IF;
END $$;

-- Vendors: read engagement attachments for engagements they belong to
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'attachments'
    AND policyname = 'Vendors read engagement attachments'
  ) THEN
    CREATE POLICY "Vendors read engagement attachments"
      ON attachments FOR SELECT
      USING (
        entity_type = 'engagement'
        AND NOT is_deleted
        AND EXISTS (
          SELECT 1 FROM engagement_vendors ev
          JOIN vendors v ON v.id = ev.vendor_id
          WHERE ev.engagement_id = entity_id
            AND v.profile_id = auth.uid()
        )
      );
  END IF;
END $$;

-- ─── Storage bucket policies (vendor-documents bucket, attachments/ prefix) ───
-- These allow authenticated users to upload/read files under 'attachments/'.
-- NOTE: The 'vendor-documents' bucket must already exist in Supabase Storage.

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'Internal users manage attachment storage'
  ) THEN
    CREATE POLICY "Internal users manage attachment storage"
      ON storage.objects FOR ALL
      TO authenticated
      USING (
        bucket_id = 'vendor-documents'
        AND name LIKE 'attachments/%'
        AND EXISTS (
          SELECT 1 FROM profiles WHERE id = auth.uid() AND role <> 'vendor'
        )
      )
      WITH CHECK (
        bucket_id = 'vendor-documents'
        AND name LIKE 'attachments/%'
        AND EXISTS (
          SELECT 1 FROM profiles WHERE id = auth.uid() AND role <> 'vendor'
        )
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'Vendors manage invoice attachment storage'
  ) THEN
    CREATE POLICY "Vendors manage invoice attachment storage"
      ON storage.objects FOR ALL
      TO authenticated
      USING (
        bucket_id = 'vendor-documents'
        AND name LIKE 'attachments/invoice/%'
        AND EXISTS (
          SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'vendor'
        )
      )
      WITH CHECK (
        bucket_id = 'vendor-documents'
        AND name LIKE 'attachments/invoice/%'
        AND EXISTS (
          SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'vendor'
        )
      );
  END IF;
END $$;
