// One-off migration: move existing attachment files from the old
// `attachments/{entityType}/{entityId}/...` storage path to the new
// org-scoped `org/{orgId}/{entityType}/{entityId}/...` path, and update the
// matching attachments.storage_path row so nothing gets orphaned.
//
// Run once, after 012_org_scoped_storage.sql has NOT yet been applied to the
// live bucket policies (this script itself doesn't need the new policies —
// it uses the service-role key, which bypasses storage RLS entirely).
//
// Usage: npx tsx backend/scripts/migrate-attachment-paths.ts

import "dotenv/config"
import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const ENTITY_TABLE: Record<string, string> = {
  engagement: "engagements",
  purchase_order: "purchase_orders",
  grn: "grns",
  contract: "contracts",
  invoice: "invoices",
}

async function main() {
  const { data: rows, error } = await supabase
    .from("attachments")
    .select("id, entity_type, entity_id, storage_path")
    .like("storage_path", "attachments/%")

  if (error) throw error
  if (!rows || rows.length === 0) {
    console.log("No attachments with the old path structure found. Nothing to do.")
    return
  }

  console.log(`Found ${rows.length} attachment(s) to migrate.`)

  for (const row of rows) {
    const table = ENTITY_TABLE[row.entity_type]
    if (!table) {
      console.error(`  ✗ ${row.id}: unknown entity_type "${row.entity_type}", skipping`)
      continue
    }

    const { data: entity, error: entityErr } = await supabase
      .from(table)
      .select("org_id")
      .eq("id", row.entity_id)
      .single()

    if (entityErr || !entity) {
      console.error(`  ✗ ${row.id}: could not resolve org_id (${entityErr?.message}), skipping`)
      continue
    }

    const oldPath = row.storage_path as string
    const fileName = oldPath.split("/").pop()
    const newPath = `org/${entity.org_id}/${row.entity_type}/${row.entity_id}/${fileName}`

    const { error: moveErr } = await supabase.storage
      .from("vendor-documents")
      .move(oldPath, newPath)

    if (moveErr) {
      console.error(`  ✗ ${row.id}: storage move failed (${moveErr.message})`)
      continue
    }

    const { error: updateErr } = await supabase
      .from("attachments")
      .update({ storage_path: newPath })
      .eq("id", row.id)

    if (updateErr) {
      console.error(`  ✗ ${row.id}: moved in storage but DB update failed (${updateErr.message}) -- fix manually: ${newPath}`)
      continue
    }

    console.log(`  ✓ ${row.id}: ${oldPath} -> ${newPath}`)
  }

  console.log("Done.")
}

main().catch((err) => {
  console.error("Migration failed:", err)
  process.exit(1)
})
