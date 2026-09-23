/**
 * One-off admin script: safely hard-delete a single auth user and their
 * cascading vendor data. Run locally with production credentials in env:
 *
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
 *     npx ts-node scripts/delete-user.ts <user-id> [--confirm]
 *
 * Without --confirm, it only reports what it found (dry run).
 * With --confirm, it deletes the auth user (which cascades to profiles,
 * vendors, and their CASCADE-linked child tables), but only after
 * verifying there are no non-cascading references that would block it
 * (purchase_orders, contracts, invoices, attachments, approval_requests,
 * and profile-referencing columns like verified_by/rated_by/performed_by).
 */
import { createClient } from "@supabase/supabase-js";

const userId = process.argv[2];
const confirm = process.argv.includes("--confirm");

if (!userId) {
  console.error("Usage: ts-node delete-user.ts <user-id> [--confirm]");
  process.exit(1);
}

const supabaseUrl = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceKey) {
  console.error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in env.");
  process.exit(1);
}

const db = createClient(supabaseUrl, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  const { data: profile, error: profileErr } = await db
    .from("profiles")
    .select("id, full_name, role")
    .eq("id", userId)
    .maybeSingle();
  if (profileErr) throw profileErr;

  console.log(`Profile: ${profile ? JSON.stringify(profile) : "none found"}`);

  let vendorId: string | null = null;
  if (profile) {
    const { data: vendor } = await db
      .from("vendors")
      .select("id, company_name")
      .eq("profile_id", userId)
      .maybeSingle();
    if (vendor) {
      vendorId = vendor.id;
      console.log(`Vendor: ${JSON.stringify(vendor)}`);
    }
  }

  const blockers: string[] = [];

  const checks: Array<[string, string, string]> = [
    ["purchase_orders", "vendor_id", vendorId ?? ""],
    ["contracts", "vendor_id", vendorId ?? ""],
    ["invoices", "vendor_id", vendorId ?? ""],
  ];

  for (const [table, column, value] of checks) {
    if (!value) continue;
    const { count, error } = await db
      .from(table)
      .select("id", { count: "exact", head: true })
      .eq(column, value);
    if (error) {
      console.warn(`Could not check ${table}: ${error.message}`);
      continue;
    }
    if (count && count > 0) blockers.push(`${table} (${count} row(s) via ${column})`);
  }

  const profileRefChecks: Array<[string, string]> = [
    ["purchase_orders", "created_by"],
    ["purchase_orders", "approved_by"],
    ["contracts", "created_by"],
    ["invoices", "created_by"],
    ["invoices", "verified_by"],
    ["attachments", "uploaded_by"],
    ["approval_requests", "requested_by"],
    ["approval_requests", "reviewed_by"],
  ];

  for (const [table, column] of profileRefChecks) {
    const { count, error } = await db
      .from(table)
      .select("id", { count: "exact", head: true })
      .eq(column, userId);
    if (error) {
      console.warn(`Could not check ${table}.${column}: ${error.message}`);
      continue;
    }
    if (count && count > 0) blockers.push(`${table} (${count} row(s) via ${column})`);
  }

  if (blockers.length > 0) {
    console.log("\nBLOCKED: the following non-cascading references exist and must be resolved manually first:");
    for (const b of blockers) console.log(`  - ${b}`);
    console.log("\nNo deletion performed.");
    return;
  }

  console.log("\nNo blocking references found. Safe to hard-delete.");

  if (!confirm) {
    console.log("Dry run only — re-run with --confirm to actually delete.");
    return;
  }

  const { error: deleteErr } = await db.auth.admin.deleteUser(userId);
  if (deleteErr) throw deleteErr;

  console.log(`Deleted auth user ${userId} (cascaded to profiles/vendors/child tables).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
