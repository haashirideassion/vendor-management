import { getSupabaseAdmin } from "./supabaseAdmin"

// Single-tenant: exactly one row exists in `organizations`. Every insert into
// an org-scoped table (engagements, rfqs, quotations, purchase_orders, grns,
// invoices, contracts) must set org_id since it's a NOT NULL column.
export async function getDefaultOrgId(): Promise<string> {
  const db: any = getSupabaseAdmin()
  const { data, error } = await db
    .from("organizations")
    .select("id")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle()

  if (error) throw error
  if (!data) throw new Error("No organization is configured")

  return data.id
}
