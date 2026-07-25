import { getSupabaseAdmin } from "./supabaseAdmin"

function db(): any { return getSupabaseAdmin() }

function baseFrom(name: string): string {
  const alnum = name.replace(/[^a-zA-Z0-9]/g, "").toUpperCase()
  return (alnum.slice(0, 6) || "ORG")
}

function randomSuffix(): string {
  return Math.random().toString(36).slice(2, 6).toUpperCase()
}

// Short, human-typeable, immutable code derived from the org's name plus a
// random suffix -- retries on the rare collision rather than reserving a
// sequence up front. Never reused/reassigned once set (callers only invoke
// this once, at the one point in that org's lifecycle where it gets a code).
export async function generateUniqueOrgCode(name: string): Promise<string> {
  const base = baseFrom(name)
  for (let attempt = 0; attempt < 8; attempt++) {
    const code = `${base}-${randomSuffix()}`
    const { data } = await db().from("organizations").select("id").eq("org_code", code).maybeSingle()
    if (!data) return code
  }
  throw new Error("Failed to generate a unique organisation code")
}

export async function generateUniqueGroupCode(name: string): Promise<string> {
  const base = baseFrom(name)
  for (let attempt = 0; attempt < 8; attempt++) {
    const code = `${base}-${randomSuffix()}`
    const { data } = await db().from("organization_groups").select("id").eq("code", code).maybeSingle()
    if (!data) return code
  }
  throw new Error("Failed to generate a unique group code")
}
