import { Router, Request, Response } from "express"
import { getSupabaseAdmin } from "../utils/supabaseAdmin"
import { requireAuth, AuthenticatedRequest } from "../middleware/auth"
import { resolveGroupContext } from "../services/groups"

const router = Router()
function db(): any { return getSupabaseAdmin() }

// POST /api/access/context — the single payload the frontend resolves every
// access/permission decision from, so no screen re-derives this logic on its
// own. Per-org: {access, isLocalMember, roleNames, permissions} unioning
// direct organization_members rows with orgs reached only via standing
// group_admin access (015_group_functions.sql). Per-group: {primaryResolution}
// via resolveGroupContext (neutral/primary/dangling/no_memberships).
//
// Vendors get an empty payload -- they have no organization_members or
// group_members rows; their access model is vendor_users/vendor_user_roles
// instead, not covered by this endpoint.
router.post("/context", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req as AuthenticatedRequest).user.id

    // ── Direct memberships ────────────────────────────────────────────────
    const { data: memberRows, error: memberError } = await db()
      .from("organization_members")
      .select("id, is_primary, organization:org_id(id, name, slug, org_code, status, role_mode, approval_threshold, base_currency, requires_onboarding_approval)")
      .eq("profile_id", userId)
    if (memberError) throw memberError

    const activeMemberRows = (memberRows ?? []).filter((r: any) => r.organization?.status === "active")
    const memberOrgIds = new Set(activeMemberRows.map((r: any) => r.organization.id))
    const memberIds = activeMemberRows.map((r: any) => r.id)

    const roleNamesByMember = new Map<string, string[]>()
    const permissionKeysByMember = new Map<string, Set<string>>()

    if (memberIds.length > 0) {
      const { data: memberRoles, error: mrError } = await db()
        .from("org_member_roles")
        .select("org_member_id, role_id, role:role_id(name)")
        .in("org_member_id", memberIds)
      if (mrError) throw mrError

      const roleIds = [...new Set((memberRoles ?? []).map((r: any) => r.role_id))]
      const permissionKeysByRole = new Map<string, string[]>()
      if (roleIds.length > 0) {
        const { data: rolePerms, error: rpError } = await db()
          .from("role_permissions")
          .select("role_id, permission:permission_id(key)")
          .in("role_id", roleIds)
        if (rpError) throw rpError
        for (const row of rolePerms ?? []) {
          const keys = permissionKeysByRole.get(row.role_id) ?? []
          keys.push(row.permission.key)
          permissionKeysByRole.set(row.role_id, keys)
        }
      }

      for (const row of memberRoles ?? []) {
        const names = roleNamesByMember.get(row.org_member_id) ?? []
        names.push(row.role.name)
        roleNamesByMember.set(row.org_member_id, names)

        const keys = permissionKeysByMember.get(row.org_member_id) ?? new Set<string>()
        for (const key of permissionKeysByRole.get(row.role_id) ?? []) keys.add(key)
        permissionKeysByMember.set(row.org_member_id, keys)
      }
    }

    // ── Active group_admin grants + the orgs they reach ─────────────────────
    const { data: groupMemberRows, error: gmError } = await db()
      .from("group_members")
      .select("group_id, group:group_id(id, name, parent_group_id, status)")
      .eq("user_id", userId)
      .eq("role", "group_admin")
      .is("effective_to", null)
    if (gmError) throw gmError

    const activeGroups = (groupMemberRows ?? []).filter((r: any) => r.group?.status === "active")

    // Full CRUD parity (confirmed decision) means a group_admin is treated
    // like they hold the org-scope Admin bundle in every org they reach that
    // way -- they hold no org_member_roles row of their own there, so there's
    // no per-org bundle to look up.
    const { data: adminRole } = await db().from("roles").select("id").eq("scope", "org").eq("name", "Admin").maybeSingle()
    let groupAdminPermissionKeys: string[] = []
    if (adminRole) {
      const { data: adminPerms } = await db()
        .from("role_permissions")
        .select("permission:permission_id(key)")
        .eq("role_id", adminRole.id)
      groupAdminPermissionKeys = (adminPerms ?? []).map((r: any) => r.permission.key)
    }

    const groupAdminOrgIds = new Set<string>()
    for (const g of activeGroups) {
      const { data: subtreeOrgs } = await db().rpc("org_ids_for_group_as_of", {
        p_group_id: g.group_id,
        p_as_of: new Date().toISOString(),
      })
      for (const row of subtreeOrgs ?? []) groupAdminOrgIds.add(row.organization_id)
    }

    const newOrgIds = [...groupAdminOrgIds].filter((id) => !memberOrgIds.has(id))
    let groupAdminOrgs: any[] = []
    if (newOrgIds.length > 0) {
      const { data: orgs } = await db()
        .from("organizations")
        .select("id, name, slug, org_code, status, role_mode, approval_threshold, base_currency, requires_onboarding_approval")
        .in("id", newOrgIds)
        .eq("status", "active")
      groupAdminOrgs = orgs ?? []
    }

    // Orgs created via self-service /api/auth/register-organization
    // (requires_onboarding_approval) stay gated out of every module except
    // Org Onboarding itself until their submission is approved -- pre-
    // existing/superadmin-created orgs default to false and are unaffected.
    const gatedOrgIds = [
      ...activeMemberRows.map((r: any) => r.organization),
      ...groupAdminOrgs,
    ].filter((o: any) => o.requires_onboarding_approval).map((o: any) => o.id)
    const approvedOrgIds = new Set<string>()
    // "Submitted" here means the org has completed at least one submission --
    // status 'submitted' (currently pending review) or 'approved' both count,
    // since a fully-approved org is trivially past that point too. A rejected
    // submission reopens the draft as 'draft' (036's confirmed design, no
    // separate terminal 'rejected' state survives review), so it's correctly
    // NOT in this set -- back to the pre-submission nav state until resubmitted.
    const submittedOrgIds = new Set<string>()
    if (gatedOrgIds.length > 0) {
      const { data: drafts, error: draftsError } = await db()
        .from("org_onboarding_drafts")
        .select("org_id, status")
        .in("org_id", gatedOrgIds)
      if (draftsError) throw draftsError
      for (const d of drafts ?? []) {
        if (d.status === "approved") approvedOrgIds.add(d.org_id)
        if (d.status === "submitted" || d.status === "approved") submittedOrgIds.add(d.org_id)
      }
    }
    const isModulesLocked = (org: { id: string; requires_onboarding_approval: boolean }) =>
      org.requires_onboarding_approval && !approvedOrgIds.has(org.id)
    const isOnboardingSubmitted = (org: { id: string }) => submittedOrgIds.has(org.id)

    const orgs = [
      ...activeMemberRows.map((row: any) => ({
        id: row.organization.id,
        name: row.organization.name,
        slug: row.organization.slug,
        orgCode: row.organization.org_code,
        access: "member",
        isLocalMember: true,
        isPrimary: row.is_primary,
        roleNames: roleNamesByMember.get(row.id) ?? [],
        permissions: Array.from(permissionKeysByMember.get(row.id) ?? []),
        roleMode: row.organization.role_mode,
        approvalThreshold: row.organization.approval_threshold,
        baseCurrency: row.organization.base_currency,
        modulesLocked: isModulesLocked(row.organization),
        onboardingSubmitted: isOnboardingSubmitted(row.organization),
        requiresOnboardingApproval: !!row.organization.requires_onboarding_approval,
      })),
      ...groupAdminOrgs.map((org: any) => ({
        id: org.id,
        name: org.name,
        slug: org.slug,
        orgCode: org.org_code,
        access: "group_admin",
        isLocalMember: false,
        isPrimary: false,
        roleNames: ["Group Admin"],
        permissions: groupAdminPermissionKeys,
        roleMode: org.role_mode,
        approvalThreshold: org.approval_threshold,
        baseCurrency: org.base_currency,
        modulesLocked: isModulesLocked(org),
        onboardingSubmitted: isOnboardingSubmitted(org),
        requiresOnboardingApproval: !!org.requires_onboarding_approval,
      })),
    ]

    const groups = await Promise.all(
      activeGroups.map(async (g: any) => ({
        id: g.group.id,
        name: g.group.name,
        parentGroupId: g.group.parent_group_id,
        primaryResolution: await resolveGroupContext(g.group_id),
      }))
    )

    res.json({ data: { orgs, groups } })
  } catch (err: any) {
    console.error("[access/context]", err.message)
    res.status(500).json({ error: "Failed to resolve access context" })
  }
})

export default router
