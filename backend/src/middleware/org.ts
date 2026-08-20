import { Response, NextFunction, Request } from "express"
import { getSupabaseAdmin } from "../utils/supabaseAdmin"
import { AuthenticatedRequest } from "./auth"

function db(): any { return getSupabaseAdmin() }

// Vendors can now have more than one staff login (vendor_users), so this can
// no longer assume a single result the way the old vendors.profile_id
// lookup could. Prefers the caller's primary vendor_users row; falls back
// to the first active one if no primary is set. A user active at more than
// one vendor company would need an explicit "active vendor" selector (like
// X-Org-Id) to disambiguate -- not needed yet, since nothing creates that
// situation today.
export async function resolveVendorId(userId: string): Promise<string | null> {
  const { data } = await db()
    .from("vendor_users")
    .select("vendor_id, is_primary")
    .eq("profile_id", userId)
    .eq("status", "active")
  if (!data || data.length === 0) return null
  return (data.find((row: any) => row.is_primary) ?? data[0]).vendor_id
}

export type OrgAccess = "member" | "group_admin" | "none"

export interface AccessContext {
  access: OrgAccess
  orgStatus: string | null
  /** True if this org was created via self-service /api/auth/register-
   *  organization and its onboarding submission isn't approved yet -- every
   *  module except Org Onboarding itself is off-limits until it is. Always
   *  false for orgs that predate this feature or were superadmin-created. */
  modulesLocked: boolean
}

// The single resolver behind isOrgMember/requireOrg/resolveListScope: an org
// is reachable either by direct organization_members membership, or by
// being a group_admin whose group tree (walking parent_group_id through
// every ancestor) contains it -- is_group_admin_for_org_as(),
// 015_group_functions.sql -- with full CRUD parity either way, per the
// confirmed "standing delegated admin, not read-only" decision. Called via
// RPC with an explicit p_user_id because Express runs under the service-role
// key, where auth.uid() is NULL and the RLS-facing wrapper would always
// return false.
//
// Preserves the original isOrgMember's exact semantics for the membership
// path: existence of an organization_members row is enough (its own
// invited/active/suspended status isn't checked, only the org's is) --
// changing that would be a behavior change beyond this refactor's scope.
export async function resolveAccessContext(userId: string, orgId: string): Promise<AccessContext> {
  const { data: org } = await db().from("organizations").select("status, requires_onboarding_approval").eq("id", orgId).maybeSingle()
  if (!org || org.status !== "active") return { access: "none", orgStatus: org?.status ?? null, modulesLocked: false }

  let modulesLocked = false
  if (org.requires_onboarding_approval) {
    const { data: draft } = await db().from("org_onboarding_drafts").select("status").eq("org_id", orgId).maybeSingle()
    modulesLocked = draft?.status !== "approved"
  }

  const { data: member } = await db()
    .from("organization_members")
    .select("id")
    .eq("org_id", orgId)
    .eq("profile_id", userId)
    .maybeSingle()
  if (member) return { access: "member", orgStatus: org.status, modulesLocked }

  const { data: isGroupAdmin } = await db().rpc("is_group_admin_for_org_as", { p_user_id: userId, p_org_id: orgId })
  if (isGroupAdmin === true) return { access: "group_admin", orgStatus: org.status, modulesLocked }

  return { access: "none", orgStatus: org.status, modulesLocked: false }
}

export async function isOrgMember(userId: string, orgId: string): Promise<boolean> {
  return (await resolveAccessContext(userId, orgId)).access !== "none"
}

// Precedence rule (Phase 3.5/3.6): if ANY vendor_user_assignments rows exist
// for this (vendor, user) pair, the user is restricted to exactly those org
// ids regardless of role. Otherwise falls back to the role default --
// Admin/Manager see all the vendor's client orgs (organization_vendors),
// Associate sees none until explicitly assigned. Returns null for "no
// restriction, see everything" so callers can distinguish that from
// "restricted to zero orgs" ([]).
export async function resolveVendorAllowedOrgIds(userId: string, vendorId: string): Promise<string[] | null> {
  const { data: assignments } = await db()
    .from("vendor_user_assignments")
    .select("organization_id")
    .eq("vendor_id", vendorId)
    .eq("user_id", userId)
  if (assignments && assignments.length > 0) {
    return assignments.map((a: any) => a.organization_id)
  }

  const { data: vendorUser } = await db()
    .from("vendor_users")
    .select("id")
    .eq("vendor_id", vendorId)
    .eq("profile_id", userId)
    .maybeSingle()
  if (!vendorUser) return [] // not even a recognized vendor_users row -- restrict to nothing

  const { data: roleRows } = await db()
    .from("vendor_user_roles")
    .select("role:role_id(name)")
    .eq("vendor_user_id", vendorUser.id)
  const roleNames = new Set((roleRows ?? []).map((r: any) => r.role.name))
  // The "sees nothing until explicitly assigned" restriction below is an
  // Associate-specific concept (the "Client Access" picker in
  // VendorTeam.tsx only ever shows for Associates) -- Finance (added in
  // 040_finance_role.sql, after this function was written) needs the same
  // full read visibility as Admin/Manager to see which contracts/
  // purchase requests it can raise or approve invoices against.
  if (roleNames.has("Admin") || roleNames.has("Manager") || roleNames.has("Finance")) return null // unrestricted

  return [] // Associate (or no recognized role) with no explicit assignments -- sees nothing yet
}

export type ListScope =
  | { mode: "vendor"; vendorId: string; allowedOrgIds: string[] | null }
  | { mode: "org"; orgId: string; access: OrgAccess }
  | { error: { status: number; message: string } }

// For endpoints shared between internal staff and vendors (e.g. purchase requests,
// invoices, contracts /list): vendors are scoped to their own vendor row,
// internal users are scoped to X-Org-Id + organization_members/group access.
// Vendors are NOT rows in organization_members, so requireOrg cannot sit in
// front of these shared routes.
export async function resolveListScope(req: Request): Promise<ListScope> {
  const { id: userId, role } = (req as AuthenticatedRequest).user

  if (role === "vendor") {
    const vendorId = await resolveVendorId(userId)
    if (!vendorId) return { error: { status: 403, message: "No vendor profile found for this user" } }
    const allowedOrgIds = await resolveVendorAllowedOrgIds(userId, vendorId)
    return { mode: "vendor", vendorId, allowedOrgIds }
  }

  const orgId = req.headers["x-org-id"]
  if (!orgId || typeof orgId !== "string") {
    return { error: { status: 400, message: "X-Org-Id header is required" } }
  }
  const ctx = await resolveAccessContext(userId, orgId)
  if (ctx.access === "none") {
    return { error: { status: 403, message: "You are not a member of this organization, or it is not active" } }
  }
  return { mode: "org", orgId, access: ctx.access }
}

export interface OrgScopedRequest extends AuthenticatedRequest {
  orgId: string
  orgAccess: OrgAccess
}

// Resolves the active org from the X-Org-Id header and validates the caller
// can reach it (direct member or group_admin). Only for internal-only
// routes -- vendor users are not rows in organization_members (they relate
// to orgs via organization_vendors instead), so this middleware must not sit
// in front of any route a vendor also calls.
export async function requireOrg(req: Request, res: Response, next: NextFunction) {
  const orgId = req.headers["x-org-id"]
  const userId = (req as AuthenticatedRequest).user?.id

  if (!orgId || typeof orgId !== "string") {
    res.status(400).json({ error: "X-Org-Id header is required" })
    return
  }
  if (!userId) {
    res.status(401).json({ error: "Not authenticated" })
    return
  }

  try {
    const ctx = await resolveAccessContext(userId, orgId)
    if (ctx.access === "none") {
      res.status(403).json({ error: "You are not a member of this organization, or it is not active" })
      return
    }

    // Every module except Org Onboarding itself is off-limits until a newly
    // self-registered org's submission is approved (038_org_onboarding_gate.sql).
    if (ctx.modulesLocked && !req.baseUrl.startsWith("/api/org-onboarding")) {
      res.status(403).json({
        error: "This organisation must complete and be approved for onboarding before using this module",
        code: "ONBOARDING_NOT_APPROVED",
      })
      return
    }

    ;(req as OrgScopedRequest).orgId = orgId
    ;(req as OrgScopedRequest).orgAccess = ctx.access
    next()
  } catch (err: any) {
    console.error("[requireOrg]", err.message)
    res.status(500).json({ error: "Failed to verify organization membership" })
  }
}
