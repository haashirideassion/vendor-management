import { getSupabaseAdmin } from "../utils/supabaseAdmin"

function db(): any { return getSupabaseAdmin() }

async function orgMemberRoleNames(userId: string, orgId: string): Promise<string[]> {
  const { data: member } = await db()
    .from("organization_members")
    .select("id")
    .eq("org_id", orgId)
    .eq("profile_id", userId)
    .maybeSingle()
  if (!member) return []

  const { data: rows } = await db()
    .from("org_member_roles")
    .select("role:role_id(name)")
    .eq("org_member_id", member.id)
  return (rows ?? []).map((r: any) => r.role.name)
}

// True if this org member's ONLY role is Associate (no Manager/Admin/
// Finance) -- the "needs a Manager/Admin approval step before it reaches
// the rest of the org" signal used across Purchase Requests/Contracts/GRNs/
// Categories, mirroring the same "Associate action needs approval" rule
// already built for vendor-side quotations (quotations.ts).
export async function isAssociateOnly(userId: string, orgId: string): Promise<boolean> {
  const roleNames = await orgMemberRoleNames(userId, orgId)
  return roleNames.length > 0 && roleNames.every((n) => n === "Associate")
}

// Procurement Lifecycle Enhancement, Phase 1: amount-tiered approval,
// layered ON TOP of the existing role gate above rather than replacing it.
//
// Associate-only stays an unconditional hard floor -- exactly today's
// behavior, threshold-independent. For every other role (Manager/Admin/
// custom), self-approval is unconditional UNLESS the org has explicitly
// configured a threshold (069_approval_thresholds.sql) for EVERY role this
// member holds; if even one of their roles has no configured policy row,
// that role's "unlimited" default wins and the member can self-approve
// through it, same as today. Only when all of the member's roles have an
// explicit threshold AND the amount exceeds the highest of them does this
// return gated=true.
export async function resolveApprovalGate(userId: string, orgId: string, amount?: number | null): Promise<boolean> {
  const { data: member } = await db()
    .from("organization_members").select("id").eq("org_id", orgId).eq("profile_id", userId).maybeSingle()
  if (!member) return true

  const { data: roleRows } = await db()
    .from("org_member_roles").select("role_id, role:role_id(name)").eq("org_member_id", member.id)
  const roleIds = (roleRows ?? []).map((r: any) => r.role_id)
  const roleNames = (roleRows ?? []).map((r: any) => r.role.name)
  if (roleNames.length === 0) return true
  if (roleNames.every((n: string) => n === "Associate")) return true

  if (amount === null || amount === undefined) return false

  const { data: policies } = await db()
    .from("approval_policies").select("role_id, threshold_amount").eq("org_id", orgId).in("role_id", roleIds)
  if (!policies || policies.length === 0) return false // nothing configured -- unchanged behavior

  const configuredRoleIds = new Set(policies.map((p: any) => p.role_id))
  const hasUnconfiguredRole = roleIds.some((id: string) => !configuredRoleIds.has(id))
  if (hasUnconfiguredRole) return false // that role's implicit "unlimited" wins

  if (policies.some((p: any) => p.threshold_amount === null)) return false // an explicit "unlimited" role wins

  const maxThreshold = Math.max(...policies.map((p: any) => Number(p.threshold_amount)))
  return amount > maxThreshold
}

// The gate for WHO may approve/reject a pending entity -- Manager or Admin
// only (not Finance, which is invoice-approval-only regardless of how
// broad its label sounds).
export async function isManagerOrAdmin(userId: string, orgId: string): Promise<boolean> {
  const roleNames = await orgMemberRoleNames(userId, orgId)
  return roleNames.includes("Manager") || roleNames.includes("Admin")
}

// Every active org member holding any of the given org-scope role names
// (e.g. ["Admin", "Finance"]) -- the general-purpose version of the
// Manager/Admin lookup below, reused wherever a notification needs to reach
// a specific role bundle rather than just the approval chain.
export async function findOrgRoleHolderIds(orgId: string, roleNames: string[]): Promise<string[]> {
  const ids = new Set<string>()
  for (const roleName of roleNames) {
    const { data: role } = await db().from("roles").select("id").eq("scope", "org").eq("name", roleName).single()
    if (!role) continue
    const { data: rows } = await db()
      .from("org_member_roles")
      .select("organization_members!inner(profile_id, org_id, status)")
      .eq("role_id", role.id)
      .eq("organization_members.org_id", orgId)
      .eq("organization_members.status", "active")
    for (const r of rows ?? []) ids.add(r.organization_members.profile_id)
  }
  return [...ids]
}

// Vendor-scope equivalent of findOrgRoleHolderIds -- every vendor_users
// member (for this vendor) holding any of the given vendor-scope role names.
export async function findVendorRoleHolderIds(vendorId: string, roleNames: string[]): Promise<string[]> {
  const ids = new Set<string>()
  for (const roleName of roleNames) {
    const { data: role } = await db().from("roles").select("id").eq("scope", "vendor").eq("name", roleName).single()
    if (!role) continue
    const { data: rows } = await db()
      .from("vendor_user_roles")
      .select("vendor_users!inner(profile_id, vendor_id)")
      .eq("role_id", role.id)
      .eq("vendor_users.vendor_id", vendorId)
    for (const r of rows ?? []) ids.add(r.vendor_users.profile_id)
  }
  return [...ids]
}

// Every active Manager in the org, falling back to every active Admin if the
// org has no Manager (solo-mode orgs, or a tiered org that just hasn't
// invited one yet) -- matches the confirmed "Manager, or Admin if absent"
// approval-routing rule.
export async function findApproverIds(orgId: string): Promise<string[]> {
  const managerIds = await findOrgRoleHolderIds(orgId, ["Manager"])
  if (managerIds.length > 0) return managerIds
  return findOrgRoleHolderIds(orgId, ["Admin"])
}

// Shared notification-insert helper -- checks the result's `error` (the
// previous inline insert in notifyApprovers never did, so a CHECK-constraint
// violation on an unrecognized `type` silently dropped the notification with
// no error page and no log line).
export async function notifyUsers(userIds: string[], opts: {
  type: string; title: string; message: string; moduleReferenceId?: string | null
}): Promise<void> {
  if (userIds.length === 0) return
  const { error } = await db().from("notifications").insert(
    userIds.map((id) => ({
      user_id: id,
      type: opts.type,
      title: opts.title,
      message: opts.message,
      module_reference_id: opts.moduleReferenceId ?? null,
      is_read: false,
    }))
  )
  if (error) console.error("[notifications] insert failed:", error.message)
}

async function notifyApprovers(orgId: string, opts: {
  entityId: string; entityLabel: string; entityTitle: string; notifType: string
}): Promise<void> {
  const approverIds = await findApproverIds(orgId)
  await notifyUsers(approverIds, {
    type: opts.notifType,
    title: `${opts.entityLabel} pending your approval`,
    message: `"${opts.entityTitle}" needs your review before it can proceed.`,
    moduleReferenceId: opts.entityId,
  })
}

// Called once, right after an entity row is created. Always inserts an
// approval_requests row (so every entity has a consistent, visible approval
// history via /api/approvals/by-entity, whether or not it was actually
// gated) -- if the creator is Associate-only, the row is left 'pending' and
// approvers are notified; otherwise it's inserted already 'approved' with
// the creator as their own reviewer (self-evident: they had the authority to
// skip the gate). Returns whether the entity itself should start at
// 'pending_approval' (gated) or its normal starting status (not gated) --
// the caller applies that to the entity row itself, since the normal
// starting status differs per entity type.
export async function gateOnCreate(opts: {
  entityType: "purchase_request" | "contract" | "grn" | "category" | "service_confirmation"
  entityId: string
  requestedBy: string
  orgId: string
  amount?: number | null
  notes?: string | null
  entityLabel: string
  entityTitle: string
  notifType: string
}): Promise<{ gated: boolean }> {
  const gated = await resolveApprovalGate(opts.requestedBy, opts.orgId, opts.amount)
  const nowIso = new Date().toISOString()

  const { error } = await db().from("approval_requests").insert({
    entity_type: opts.entityType,
    entity_id: opts.entityId,
    requested_by: opts.requestedBy,
    amount: opts.amount ?? null,
    notes: opts.notes ?? null,
    org_id: opts.orgId,
    status: gated ? "pending" : "approved",
    reviewed_by: gated ? null : opts.requestedBy,
    reviewed_at: gated ? null : nowIso,
  })
  if (error) throw error

  if (gated) {
    await notifyApprovers(opts.orgId, {
      entityId: opts.entityId,
      entityLabel: opts.entityLabel,
      entityTitle: opts.entityTitle,
      notifType: opts.notifType,
    })
  }

  return { gated }
}
