import { getSupabaseAdmin } from "../utils/supabaseAdmin"

function db(): any { return getSupabaseAdmin() }

// Mirrors resolveVendorAllowedOrgIds' null-vs-empty-array shape
// (middleware/org.ts): null means "no restriction, sees everything their
// role otherwise allows"; an array (possibly empty) means "restricted to
// exactly these legal entities."
export async function resolveOrgMemberLegalEntityScope(orgMemberId: string): Promise<string[] | null> {
  const { data, error } = await db().rpc("resolve_org_member_legal_entity_scope", { p_org_member_id: orgMemberId })
  if (error) throw error
  return data ?? null
}

// Translates a legal-entity scope into the vendor_ids that have at least
// one legal entity in the allowed set -- a vendor is visible if ANY of its
// legal entities falls within the caller's allowed scope, not only if
// every one of them does.
export async function vendorIdsForLegalEntities(legalEntityIds: string[]): Promise<string[]> {
  if (legalEntityIds.length === 0) return []
  const { data, error } = await db().from("legal_entities").select("vendor_id").in("id", legalEntityIds)
  if (error) throw error
  return [...new Set<string>((data ?? []).map((r: any) => r.vendor_id))]
}
