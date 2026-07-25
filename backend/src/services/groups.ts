import { getSupabaseAdmin } from "../utils/supabaseAdmin"
import { writeAudit } from "./audit"

function db(): any { return getSupabaseAdmin() }

export class ServiceError extends Error {
  code: string
  details?: unknown
  constructor(code: string, message: string, details?: unknown) {
    super(message)
    this.code = code
    this.details = details
  }
}

// ─── Primary-org resolution (group-level "flagship org", not the personal
// organization_members.is_primary flag) ─────────────────────────────────────
export type PrimaryResolution =
  | { kind: "neutral" }
  | { kind: "primary"; orgId: string }
  | { kind: "dangling"; configuredOrgId: string }
  | { kind: "no_memberships" }

async function activeOrgsInSubtree(groupId: string): Promise<string[]> {
  const { data, error } = await db().rpc("org_ids_for_group_as_of", {
    p_group_id: groupId,
    p_as_of: new Date().toISOString(),
  })
  if (error) throw error
  const orgIds = (data ?? []).map((row: any) => row.organization_id)
  if (orgIds.length === 0) return []

  const { data: orgs, error: orgsError } = await db()
    .from("organizations")
    .select("id")
    .in("id", orgIds)
    .eq("status", "active")
  if (orgsError) throw orgsError
  return (orgs ?? []).map((o: any) => o.id)
}

// Distinct from "never set" (which logs nothing): a configured primary_org_id
// that's no longer valid is a data-integrity signal, rate-limited to once
// per group per day so a busy group overview doesn't flood audit_log.
async function logDanglingPrimary(groupId: string, configuredOrgId: string): Promise<void> {
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const { data: recent } = await db()
    .from("audit_log")
    .select("id")
    .eq("entity_type", "organization_group")
    .eq("entity_id", groupId)
    .eq("action", "group_primary_org_dangling")
    .gte("created_at", oneDayAgo)
    .limit(1)
    .maybeSingle()
  if (recent) return

  console.warn(`[groups] dangling primary_org_id ${configuredOrgId} on group ${groupId}`)
  await writeAudit({
    entityType: "organization_group",
    entityId: groupId,
    action: "group_primary_org_dangling",
    newValue: { configured_org_id: configuredOrgId },
    performedBy: null,
    orgId: configuredOrgId,
  })
}

// The single resolver behind the group overview / switcher: never auto-picks
// an org when primary_org_id is unset, distinguishes a dangling configured
// primary (logged) from a never-set one (not logged), and surfaces a
// dedicated empty state when the caller has no active orgs to see in this
// group's tree at all -- never a blank page or 500.
export async function resolveGroupContext(groupId: string): Promise<PrimaryResolution> {
  const { data: group, error } = await db()
    .from("organization_groups")
    .select("primary_org_id")
    .eq("id", groupId)
    .maybeSingle()
  if (error) throw error
  if (!group) throw new ServiceError("GROUP_NOT_FOUND", "Group not found")

  const activeOrgIds = await activeOrgsInSubtree(groupId)
  if (activeOrgIds.length === 0) return { kind: "no_memberships" }

  if (!group.primary_org_id) return { kind: "neutral" }

  if (!activeOrgIds.includes(group.primary_org_id)) {
    await logDanglingPrimary(groupId, group.primary_org_id)
    return { kind: "dangling", configuredOrgId: group.primary_org_id }
  }

  // primary_org_id must specifically be a DIRECT active member of THIS
  // group (matching the enforce_group_primary_org trigger's own invariant),
  // not merely present somewhere in the subtree.
  const { data: directMember } = await db()
    .from("group_organizations")
    .select("id")
    .eq("group_id", groupId)
    .eq("organization_id", group.primary_org_id)
    .is("effective_to", null)
    .eq("status", "active")
    .maybeSingle()
  if (!directMember) {
    await logDanglingPrimary(groupId, group.primary_org_id)
    return { kind: "dangling", configuredOrgId: group.primary_org_id }
  }

  return { kind: "primary", orgId: group.primary_org_id }
}

// ─── Group merge ────────────────────────────────────────────────────────────
// Absorbed group's primary_org_id is discarded outright (never copied over);
// if the merge affects the surviving group's primary (its org no longer has
// an active direct membership in the surviving group post-merge), it's
// nulled -- never inherited from either side.
export async function mergeGroups(survivingGroupId: string, absorbedGroupId: string, actorId: string): Promise<void> {
  if (survivingGroupId === absorbedGroupId) {
    throw new ServiceError("SAME_GROUP", "Cannot merge a group into itself")
  }

  const { error: reparentError } = await db()
    .from("organization_groups")
    .update({ parent_group_id: survivingGroupId })
    .eq("parent_group_id", absorbedGroupId)
  if (reparentError) throw reparentError

  const { data: activeMemberships, error: memError } = await db()
    .from("group_organizations")
    .select("organization_id, relationship_type, effective_from")
    .eq("group_id", absorbedGroupId)
    .is("effective_to", null)
    .eq("status", "active")
  if (memError) throw memError

  for (const membership of activeMemberships ?? []) {
    const { error: endError } = await db().rpc("end_group_organization", {
      p_group_id: absorbedGroupId,
      p_organization_id: membership.organization_id,
    })
    if (endError) throw endError

    // A plain insert (not rebind_group_organization) preserves the original
    // effective_from on the surviving group, since there's no prior open row
    // there to close first.
    const { error: insertError } = await db().from("group_organizations").insert({
      group_id: survivingGroupId,
      organization_id: membership.organization_id,
      relationship_type: membership.relationship_type,
      effective_from: membership.effective_from,
    })
    if (insertError) throw insertError
  }

  const { data: survivingGroup } = await db()
    .from("organization_groups")
    .select("primary_org_id")
    .eq("id", survivingGroupId)
    .maybeSingle()

  if (survivingGroup?.primary_org_id) {
    const { data: stillMember } = await db()
      .from("group_organizations")
      .select("id")
      .eq("group_id", survivingGroupId)
      .eq("organization_id", survivingGroup.primary_org_id)
      .is("effective_to", null)
      .eq("status", "active")
      .maybeSingle()
    if (!stillMember) {
      await db().from("organization_groups").update({ primary_org_id: null }).eq("id", survivingGroupId)
    }
  }

  // Now empty of active members/sub-groups (moved above), so the dissolution
  // guard trigger (015_group_functions.sql) allows this status change.
  const { error: dissolveError } = await db()
    .from("organization_groups")
    .update({ status: "merged" })
    .eq("id", absorbedGroupId)
  if (dissolveError) throw dissolveError

  await writeAudit({
    entityType: "organization_group",
    entityId: absorbedGroupId,
    action: "group_merged",
    newValue: { merged_into: survivingGroupId },
    performedBy: actorId,
    orgId: survivingGroup?.primary_org_id ?? null,
  })
}

// ─── Deletion / reassignment safeguards ────────────────────────────────────
// Backed up by DB triggers (015_group_functions.sql) that raise on the same
// conditions -- this service layer exists to turn that into a structured,
// friendly 409 rather than a raw constraint-violation error.
export async function removeOrgFromGroup(
  groupId: string,
  organizationId: string,
  successorOrgId: string | undefined,
  actorId: string
): Promise<void> {
  const { data: group, error } = await db()
    .from("organization_groups")
    .select("primary_org_id")
    .eq("id", groupId)
    .maybeSingle()
  if (error) throw error
  if (!group) throw new ServiceError("GROUP_NOT_FOUND", "Group not found")

  if (group.primary_org_id === organizationId) {
    if (!successorOrgId) {
      const { data: remaining } = await db()
        .from("group_organizations")
        .select("organization_id")
        .eq("group_id", groupId)
        .is("effective_to", null)
        .eq("status", "active")
        .neq("organization_id", organizationId)
      throw new ServiceError(
        "PRIMARY_ORG_REMOVAL_BLOCKED",
        "Cannot remove the group's primary org without choosing a successor",
        { requiresSuccessor: true, candidates: (remaining ?? []).map((r: any) => r.organization_id) }
      )
    }

    const { data: successorMember } = await db()
      .from("group_organizations")
      .select("id")
      .eq("group_id", groupId)
      .eq("organization_id", successorOrgId)
      .is("effective_to", null)
      .eq("status", "active")
      .maybeSingle()
    if (!successorMember) {
      throw new ServiceError("INVALID_SUCCESSOR", "The chosen successor is not an active member of this group")
    }

    const { error: primaryError } = await db()
      .from("organization_groups")
      .update({ primary_org_id: successorOrgId })
      .eq("id", groupId)
    if (primaryError) throw primaryError
  }

  const { error: endError } = await db().rpc("end_group_organization", { p_group_id: groupId, p_organization_id: organizationId })
  if (endError) throw endError

  await writeAudit({
    entityType: "organization_group",
    entityId: groupId,
    action: "org_removed_from_group",
    newValue: { organization_id: organizationId, successor_org_id: successorOrgId ?? null },
    performedBy: actorId,
    orgId: organizationId,
  })
}

export interface DissolveGroupPlan {
  orgReassignments?: { organizationId: string; targetGroupId: string }[]
  subGroupReassignments?: { subGroupId: string; targetGroupId: string | null }[]
}

// Dissolving a group with active member orgs or sub-groups is blocked until
// every one of them is explicitly reassigned -- promoted to the parent
// (targetGroupId = the dissolving group's own parent, or null for a
// top-level promotion) or moved to a sibling. No silent cascade: every
// orphan must appear in the plan by name, or this throws before touching
// anything.
export async function dissolveGroup(groupId: string, plan: DissolveGroupPlan | undefined, actorId: string): Promise<void> {
  const { data: group, error } = await db()
    .from("organization_groups")
    .select("id")
    .eq("id", groupId)
    .maybeSingle()
  if (error) throw error
  if (!group) throw new ServiceError("GROUP_NOT_FOUND", "Group not found")

  const { data: activeOrgs } = await db()
    .from("group_organizations")
    .select("organization_id")
    .eq("group_id", groupId)
    .is("effective_to", null)
    .eq("status", "active")
  const { data: subGroups } = await db()
    .from("organization_groups")
    .select("id")
    .eq("parent_group_id", groupId)
    .eq("status", "active")

  const orgIds: string[] = (activeOrgs ?? []).map((r: any) => r.organization_id)
  const subGroupIds: string[] = (subGroups ?? []).map((r: any) => r.id)

  if ((orgIds.length > 0 || subGroupIds.length > 0) && !plan) {
    throw new ServiceError(
      "GROUP_NOT_EMPTY",
      "Group still has active member orgs or sub-groups; reassign them first",
      { orgs: orgIds, subGroups: subGroupIds }
    )
  }

  for (const organizationId of orgIds) {
    const target = plan?.orgReassignments?.find((r) => r.organizationId === organizationId)?.targetGroupId
    if (!target) {
      throw new ServiceError("MISSING_REASSIGNMENT", `Organization ${organizationId} has no reassignment target in the plan`)
    }
    const { error: rebindError } = await db().rpc("rebind_group_organization", {
      p_group_id: target,
      p_organization_id: organizationId,
    })
    if (rebindError) throw rebindError
    const { error: endError } = await db().rpc("end_group_organization", { p_group_id: groupId, p_organization_id: organizationId })
    if (endError) throw endError
  }

  for (const subGroupId of subGroupIds) {
    const reassignment = plan?.subGroupReassignments?.find((r) => r.subGroupId === subGroupId)
    if (!reassignment) {
      throw new ServiceError("MISSING_REASSIGNMENT", `Sub-group ${subGroupId} has no reassignment target in the plan`)
    }
    const { error: reparentError } = await db()
      .from("organization_groups")
      .update({ parent_group_id: reassignment.targetGroupId })
      .eq("id", subGroupId)
    if (reparentError) throw reparentError
  }

  const { error: dissolveError } = await db()
    .from("organization_groups")
    .update({ status: "archived" })
    .eq("id", groupId)
  if (dissolveError) throw dissolveError

  await writeAudit({
    entityType: "organization_group",
    entityId: groupId,
    action: "group_dissolved",
    newValue: { reassigned_orgs: orgIds, reassigned_sub_groups: subGroupIds },
    performedBy: actorId,
    orgId: null,
  })
}
