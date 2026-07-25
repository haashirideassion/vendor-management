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
// the rest of the org" signal used across Engagements/Contracts/GRNs/
// Categories, mirroring the same "Associate action needs approval" rule
// already built for vendor-side quotations (quotations.ts).
export async function isAssociateOnly(userId: string, orgId: string): Promise<boolean> {
  const roleNames = await orgMemberRoleNames(userId, orgId)
  return roleNames.length > 0 && roleNames.every((n) => n === "Associate")
}

// The gate for WHO may approve/reject a pending entity -- Manager or Admin
// only (not Finance, which is invoice-approval-only regardless of how
// broad its label sounds).
export async function isManagerOrAdmin(userId: string, orgId: string): Promise<boolean> {
  const roleNames = await orgMemberRoleNames(userId, orgId)
  return roleNames.includes("Manager") || roleNames.includes("Admin")
}

// Every active Manager in the org, falling back to every active Admin if the
// org has no Manager (solo-mode orgs, or a tiered org that just hasn't
// invited one yet) -- matches the confirmed "Manager, or Admin if absent"
// approval-routing rule.
export async function findApproverIds(orgId: string): Promise<string[]> {
  async function idsForRole(roleName: string): Promise<string[]> {
    const { data: role } = await db().from("roles").select("id").eq("scope", "org").eq("name", roleName).single()
    if (!role) return []
    const { data: rows } = await db()
      .from("org_member_roles")
      .select("organization_members!inner(profile_id, org_id, status)")
      .eq("role_id", role.id)
      .eq("organization_members.org_id", orgId)
      .eq("organization_members.status", "active")
    return (rows ?? []).map((r: any) => r.organization_members.profile_id)
  }

  const managerIds = await idsForRole("Manager")
  if (managerIds.length > 0) return [...new Set(managerIds)]
  return [...new Set(await idsForRole("Admin"))]
}

async function notifyApprovers(orgId: string, opts: {
  entityId: string; entityLabel: string; entityTitle: string; notifType: string
}): Promise<void> {
  const approverIds = await findApproverIds(orgId)
  if (approverIds.length === 0) return

  await db().from("notifications").insert(
    approverIds.map((id) => ({
      user_id: id,
      type: opts.notifType,
      title: `${opts.entityLabel} pending your approval`,
      message: `"${opts.entityTitle}" needs your review before it can proceed.`,
      module_reference_id: opts.entityId,
      is_read: false,
    }))
  )
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
  entityType: "engagement" | "contract" | "grn" | "category"
  entityId: string
  requestedBy: string
  orgId: string
  amount?: number | null
  notes?: string | null
  entityLabel: string
  entityTitle: string
  notifType: string
}): Promise<{ gated: boolean }> {
  const gated = await isAssociateOnly(opts.requestedBy, opts.orgId)
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
