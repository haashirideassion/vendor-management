import { Router, Request, Response } from "express"
import { getSupabaseAdmin } from "../utils/supabaseAdmin"
import { requireAuth, AuthenticatedRequest } from "../middleware/auth"
import { resolveVendorId, resolveVendorAllowedOrgIds, requireOrg, OrgScopedRequest } from "../middleware/org"
import { writeAudit } from "../services/audit"
import { sendEmail, inviteHtml } from "../services/email.service"
import { applyTeamRoleAssignments, validateTeamsBelongToTenant, type TeamRoleAssignment } from "../services/teamAssignment.service"

const router = Router()
function db(): any { return getSupabaseAdmin() }

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// Routed through resolve_permission_as -- see invoices.ts's identical
// comment for why. This one is the highest-leverage of the five: every
// route added in the RBAC/Teams redesign (invite, update-roles, suspend,
// reinstate, revoke, resend, teams/create) already calls this single
// function, so all of them gain Entitlement + Restriction enforcement from
// this one change, with no other call site touched.
async function requireVendorManagePermission(userId: string, vendorId: string): Promise<boolean> {
  const { data } = await db().rpc("resolve_permission_as", {
    p_user_id: userId,
    p_scope: "vendor",
    p_org_id: null,
    p_vendor_id: vendorId,
    p_key: "vendor_users.manage",
  })
  return data === true
}

// POST /api/vendor-users/list — the caller's own vendor company's staff,
// with resolved vendor-scope role names.
router.post("/list", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req as AuthenticatedRequest).user.id
    const vendorId = await resolveVendorId(userId)
    if (!vendorId) return res.status(403).json({ error: "No vendor profile found for this user" })

    const { data: users, error } = await db()
      .from("vendor_users")
      .select("id, profile_id, status, is_primary, created_at, profile:profile_id(id, full_name, email)")
      .eq("vendor_id", vendorId)
    if (error) throw error

    const userIds = (users ?? []).map((u: any) => u.id)
    const profileIds = (users ?? []).map((u: any) => u.profile_id)
    const roleNamesByUser = new Map<string, string[]>()
    if (userIds.length > 0) {
      const { data: userRoles, error: urError } = await db()
        .from("vendor_user_roles")
        .select("vendor_user_id, role:role_id(name)")
        .in("vendor_user_id", userIds)
      if (urError) throw urError
      for (const row of userRoles ?? []) {
        const names = roleNamesByUser.get(row.vendor_user_id) ?? []
        names.push(row.role.name)
        roleNamesByUser.set(row.vendor_user_id, names)
      }
    }

    // New Team+Role model, shown alongside the legacy roleNames above while
    // the two systems coexist (see orgMembers.ts's /list for the same
    // pattern).
    const teamAssignmentsByProfile = new Map<string, { teamId: string; teamName: string; roleId: string; roleName: string }[]>()
    const directRoleNamesByProfile = new Map<string, string[]>()
    if (profileIds.length > 0) {
      const { data: teamRows, error: tmError } = await db()
        .from("team_members")
        .select("profile_id, role:role_id(id, name), team:team_id(id, name)")
        .in("profile_id", profileIds)
      if (tmError) throw tmError
      for (const row of teamRows ?? []) {
        const list = teamAssignmentsByProfile.get(row.profile_id) ?? []
        list.push({ teamId: row.team.id, teamName: row.team.name, roleId: row.role.id, roleName: row.role.name })
        teamAssignmentsByProfile.set(row.profile_id, list)
      }

      const { data: draRows, error: draError } = await db()
        .from("direct_role_assignments")
        .select("profile_id, role:role_id(name)")
        .eq("scope", "vendor")
        .eq("vendor_id", vendorId)
        .in("profile_id", profileIds)
      if (draError) throw draError
      for (const row of draRows ?? []) {
        const names = directRoleNamesByProfile.get(row.profile_id) ?? []
        names.push(row.role.name)
        directRoleNamesByProfile.set(row.profile_id, names)
      }
    }

    const data = (users ?? []).map((u: any) => ({
      id: u.id,
      status: u.status,
      isPrimary: u.is_primary,
      createdAt: u.created_at,
      profile: u.profile,
      roleNames: roleNamesByUser.get(u.id) ?? [],
      teamAssignments: teamAssignmentsByProfile.get(u.profile_id) ?? [],
      directRoleNames: directRoleNamesByProfile.get(u.profile_id) ?? [],
    }))
    res.json({ data })
  } catch (err: any) {
    console.error("[vendor-users/list]", err.message)
    res.status(500).json({ error: "Failed to list vendor staff" })
  }
})

// POST /api/vendor-users/org-list — read-only, for an org viewing one of
// its vendors: which of that vendor's staff can actually see/act on this
// org's purchase requests. A vendor's Admin/Manager/Finance are unrestricted
// (relevant to every client org, per resolveVendorAllowedOrgIds), so they
// always show; an Associate only shows if explicitly assigned to this org
// via vendor_user_assignments (the vendor's own "Client Access" picker).
// Reuses resolveVendorAllowedOrgIds rather than re-deriving the same
// access rule a second time.
router.post("/org-list", requireAuth, requireOrg, async (req: Request, res: Response) => {
  try {
    const { vendor_id } = req.body as { vendor_id?: string }
    const { orgId } = req as OrgScopedRequest
    if (!vendor_id) return res.status(400).json({ error: "vendor_id is required" })

    const { data: link } = await db()
      .from("organization_vendors")
      .select("vendor_id")
      .eq("org_id", orgId)
      .eq("vendor_id", vendor_id)
      .maybeSingle()
    if (!link) return res.status(404).json({ error: "Vendor not found for this organization" })

    const { data: users, error } = await db()
      .from("vendor_users")
      .select("id, status, is_primary, profile:profile_id(id, full_name, email)")
      .eq("vendor_id", vendor_id)
    if (error) throw error

    const userIds = (users ?? []).map((u: any) => u.id)
    const roleNamesByUser = new Map<string, string[]>()
    if (userIds.length > 0) {
      const { data: userRoles, error: urError } = await db()
        .from("vendor_user_roles")
        .select("vendor_user_id, role:role_id(name)")
        .in("vendor_user_id", userIds)
      if (urError) throw urError
      for (const row of userRoles ?? []) {
        const names = roleNamesByUser.get(row.vendor_user_id) ?? []
        names.push(row.role.name)
        roleNamesByUser.set(row.vendor_user_id, names)
      }
    }

    const data = []
    for (const u of (users ?? [])) {
      if (!u.profile) continue
      const allowedOrgIds = await resolveVendorAllowedOrgIds(u.profile.id, vendor_id)
      const hasAccess = allowedOrgIds === null || allowedOrgIds.includes(orgId)
      if (!hasAccess) continue
      data.push({
        id: u.id,
        status: u.status,
        isPrimary: u.is_primary,
        profile: u.profile,
        roleNames: roleNamesByUser.get(u.id) ?? [],
        accessScope: allowedOrgIds === null ? "all" as const : "assigned" as const,
      })
    }

    res.json({ data })
  } catch (err: any) {
    console.error("[vendor-users/org-list]", err.message)
    res.status(500).json({ error: "Failed to list vendor staff for this organization" })
  }
})

// POST /api/vendor-users/client-orgs — the caller's vendor's client orgs
// (organization_vendors), the source list for the Associate assignment
// multi-select.
router.post("/client-orgs", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req as AuthenticatedRequest).user.id
    const vendorId = await resolveVendorId(userId)
    if (!vendorId) return res.status(403).json({ error: "No vendor profile found for this user" })

    const { data, error } = await db()
      .from("organization_vendors")
      .select("organization:org_id(id, name, slug, status)")
      .eq("vendor_id", vendorId)
    if (error) throw error

    const orgs = (data ?? [])
      .filter((row: any) => row.organization?.status === "active")
      .map((row: any) => row.organization)
    res.json({ data: orgs })
  } catch (err: any) {
    console.error("[vendor-users/client-orgs]", err.message)
    res.status(500).json({ error: "Failed to list client organizations" })
  }
})

// POST /api/vendor-users/my-permissions — the CALLER's own resolved
// vendor-scope permission key set (vendor_users -> vendor_user_roles ->
// role_permissions), mirroring /api/access/context's org-side
// {permissions: string[]} shape so the vendor-side UI can gate actions on
// permission keys instead of hardcoded role-name string checks. Also
// returns roleNames (e.g. ["Admin"]) -- the real vendor-scope bundle name,
// for UI display (UserDropdown) instead of the generic legacy profiles.role
// "Vendor" bucket.
router.post("/my-permissions", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req as AuthenticatedRequest).user.id
    const vendorId = await resolveVendorId(userId)
    if (!vendorId) return res.json({ data: { permissions: [], roleNames: [] } })

    const { data: vendorUser, error: vuError } = await db()
      .from("vendor_users")
      .select("id")
      .eq("vendor_id", vendorId)
      .eq("profile_id", userId)
      .maybeSingle()
    if (vuError) throw vuError
    if (!vendorUser) return res.json({ data: { permissions: [], roleNames: [] } })

    const { data: userRoles, error: urError } = await db()
      .from("vendor_user_roles")
      .select("role_id, role:role_id(name)")
      .eq("vendor_user_id", vendorUser.id)
    if (urError) throw urError

    const roleNames = [...new Set((userRoles ?? []).map((r: any) => r.role.name))]
    const roleIds = [...new Set((userRoles ?? []).map((r: any) => r.role_id))]
    if (roleIds.length === 0) return res.json({ data: { permissions: [], roleNames } })

    const { data: rolePerms, error: rpError } = await db()
      .from("role_permissions")
      .select("permission:permission_id(key)")
      .in("role_id", roleIds)
    if (rpError) throw rpError

    const permissions = [...new Set((rolePerms ?? []).map((r: any) => r.permission.key))]
    res.json({ data: { permissions, roleNames } })
  } catch (err: any) {
    console.error("[vendor-users/my-permissions]", err.message)
    res.status(500).json({ error: "Failed to load permissions" })
  }
})

router.post("/assignable-roles", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req as AuthenticatedRequest).user.id
    const vendorId = await resolveVendorId(userId)
    if (!vendorId) return res.status(403).json({ error: "No vendor profile found for this user" })

    // Admin is excluded -- it's the vendor's own account owner, established
    // at signup, not a role assigned to invited staff or reassigned here.
    // Includes this vendor's own custom roles (Phase 7a) alongside system
    // roles -- assignment needs no separate UI for custom roles.
    const { data, error } = await db()
      .from("roles")
      .select("id, name, description, is_system")
      .eq("scope", "vendor")
      .neq("name", "Admin")
      .or(`is_system.eq.true,owner_vendor_id.eq.${vendorId}`)
      .order("name")
    if (error) throw error
    res.json({ data: { roles: data } })
  } catch (err: any) {
    console.error("[vendor-users/assignable-roles]", err.message)
    res.status(500).json({ error: "Failed to load assignable roles" })
  }
})

// POST /api/vendor-users/roles/assignable-permissions
router.post("/roles/assignable-permissions", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req as AuthenticatedRequest).user.id
    const vendorId = await resolveVendorId(userId)
    if (!vendorId) return res.status(403).json({ error: "No vendor profile found for this user" })

    const { data: vendorRoles, error: rolesError } = await db().from("roles").select("id").eq("scope", "vendor")
    if (rolesError) throw rolesError
    const roleIds = (vendorRoles ?? []).map((r: any) => r.id)
    if (roleIds.length === 0) return res.json({ data: [] })

    const { data: rolePerms, error } = await db()
      .from("role_permissions")
      .select("permission:permission_id(id, key, module, action, description)")
      .in("role_id", roleIds)
    if (error) throw error

    const seen = new Map<string, any>()
    for (const row of rolePerms ?? []) seen.set(row.permission.id, row.permission)
    res.json({ data: [...seen.values()].sort((a, b) => a.key.localeCompare(b.key)) })
  } catch (err: any) {
    console.error("[vendor-users/roles/assignable-permissions]", err.message)
    res.status(500).json({ error: "Failed to load permission catalog" })
  }
})

// POST /api/vendor-users/roles/create-custom — {name, description?, permissionIds}
router.post("/roles/create-custom", requireAuth, async (req: Request, res: Response) => {
  const actorId = (req as AuthenticatedRequest).user.id
  const { name, description, permissionIds } = req.body as { name?: string; description?: string; permissionIds?: string[] }
  if (!name?.trim()) return res.status(400).json({ error: "name is required" })
  if (!Array.isArray(permissionIds) || permissionIds.length === 0) {
    return res.status(400).json({ error: "At least one permission must be selected" })
  }

  const vendorId = await resolveVendorId(actorId)
  if (!vendorId) return res.status(403).json({ error: "No vendor profile found for this user" })
  if (!(await requireVendorManagePermission(actorId, vendorId))) {
    return res.status(403).json({ error: "You do not have permission to manage vendor staff" })
  }
  try {
    const { data: role, error } = await db()
      .from("roles")
      .insert({ name: name.trim(), scope: "vendor", description: description?.trim() || null, is_system: false, owner_vendor_id: vendorId })
      .select("id, name, description")
      .single()
    if (error) throw error

    const { error: rpError } = await db()
      .from("role_permissions")
      .insert(permissionIds.map((permissionId) => ({ role_id: role.id, permission_id: permissionId })))
    if (rpError) throw rpError

    await writeAudit({
      entityType: "role", entityId: role.id, action: "custom_role_created",
      newValue: { name: name.trim(), permission_ids: permissionIds }, performedBy: actorId, orgId: null,
    })
    res.status(201).json({ data: role })
  } catch (err: any) {
    console.error("[vendor-users/roles/create-custom]", err.message)
    res.status(500).json({ error: err.message || "Failed to create custom role" })
  }
})

// POST /api/vendor-users/roles/delete-custom — {roleId}
router.post("/roles/delete-custom", requireAuth, async (req: Request, res: Response) => {
  const actorId = (req as AuthenticatedRequest).user.id
  const { roleId } = req.body as { roleId?: string }
  if (!roleId) return res.status(400).json({ error: "roleId is required" })

  const vendorId = await resolveVendorId(actorId)
  if (!vendorId) return res.status(403).json({ error: "No vendor profile found for this user" })
  if (!(await requireVendorManagePermission(actorId, vendorId))) {
    return res.status(403).json({ error: "You do not have permission to manage vendor staff" })
  }
  try {
    const { data: role } = await db().from("roles").select("id, is_system, owner_vendor_id").eq("id", roleId).maybeSingle()
    if (!role) return res.status(404).json({ error: "Role not found" })
    if (role.is_system || role.owner_vendor_id !== vendorId) {
      return res.status(403).json({ error: "This role does not belong to your vendor or is a system role" })
    }

    const [{ count: userRoleCount }, { count: teamCount }, { count: draCount }] = await Promise.all([
      db().from("vendor_user_roles").select("*", { count: "exact", head: true }).eq("role_id", roleId),
      db().from("team_members").select("*", { count: "exact", head: true }).eq("role_id", roleId),
      db().from("direct_role_assignments").select("*", { count: "exact", head: true }).eq("role_id", roleId),
    ])
    if ((userRoleCount ?? 0) > 0 || (teamCount ?? 0) > 0 || (draCount ?? 0) > 0) {
      return res.status(400).json({ error: "This role is still assigned to one or more people — reassign them first" })
    }

    const { error } = await db().from("roles").delete().eq("id", roleId)
    if (error) throw error

    await writeAudit({ entityType: "role", entityId: roleId, action: "custom_role_deleted", newValue: {}, performedBy: actorId, orgId: null })
    res.json({ data: { roleId } })
  } catch (err: any) {
    console.error("[vendor-users/roles/delete-custom]", err.message)
    res.status(500).json({ error: err.message || "Failed to delete custom role" })
  }
})

// POST /api/vendor-users/teams/list — active teams for the caller's vendor.
router.post("/teams/list", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req as AuthenticatedRequest).user.id
    const vendorId = await resolveVendorId(userId)
    if (!vendorId) return res.status(403).json({ error: "No vendor profile found for this user" })

    const { data, error } = await db()
      .from("teams")
      .select("id, name, description")
      .eq("scope", "vendor")
      .eq("vendor_id", vendorId)
      .eq("active", true)
      .order("name")
    if (error) throw error
    res.json({ data })
  } catch (err: any) {
    console.error("[vendor-users/teams/list]", err.message)
    res.status(500).json({ error: "Failed to list teams" })
  }
})

// POST /api/vendor-users/teams/create — same permission gate as invite.
router.post("/teams/create", requireAuth, async (req: Request, res: Response) => {
  const actorId = (req as AuthenticatedRequest).user.id
  const { name, description } = req.body as { name?: string; description?: string }
  if (!name?.trim()) return res.status(400).json({ error: "name is required" })

  const vendorId = await resolveVendorId(actorId)
  if (!vendorId) return res.status(403).json({ error: "No vendor profile found for this user" })
  if (!(await requireVendorManagePermission(actorId, vendorId))) {
    return res.status(403).json({ error: "You do not have permission to manage vendor staff" })
  }
  try {
    const { data, error } = await db()
      .from("teams")
      .insert({ scope: "vendor", vendor_id: vendorId, name: name.trim(), description: description?.trim() || null })
      .select("id, name, description")
      .single()
    if (error) throw error
    await writeAudit({
      entityType: "team", entityId: data.id, action: "team_created",
      newValue: { name: name.trim() }, performedBy: actorId, orgId: null,
    })
    res.status(201).json({ data })
  } catch (err: any) {
    console.error("[vendor-users/teams/create]", err.message)
    res.status(500).json({ error: err.message || "Failed to create team" })
  }
})

// POST /api/vendor-users/invite — Admin/Manager (vendor_users.manage) only.
router.post("/invite", requireAuth, async (req: Request, res: Response) => {
  const { email, fullName, roleIds, assignments } = req.body as {
    email?: string; fullName?: string; roleIds?: string[]; assignments?: TeamRoleAssignment[]
  }
  const actorId = (req as AuthenticatedRequest).user.id

  const finalAssignments: TeamRoleAssignment[] = Array.isArray(assignments) && assignments.length > 0
    ? assignments
    : (roleIds ?? []).map((roleId) => ({ teamId: null, roleId }))
  const finalRoleIds = [...new Set(finalAssignments.map((a) => a.roleId))]

  if (!email?.trim() || !fullName?.trim() || finalRoleIds.length === 0) {
    return res.status(400).json({ error: "email, fullName, and at least one roleId are required" })
  }
  const normalizedEmail = email.trim().toLowerCase()
  if (!EMAIL_RE.test(normalizedEmail)) {
    return res.status(400).json({ error: "email is not a valid email address" })
  }

  const vendorId = await resolveVendorId(actorId)
  if (!vendorId) return res.status(403).json({ error: "No vendor profile found for this user" })
  if (!(await requireVendorManagePermission(actorId, vendorId))) {
    return res.status(403).json({ error: "You do not have permission to manage vendor staff" })
  }

  let profileId: string | null = null
  let createdNewAuthUser = false
  let vendorUserId: string | null = null

  try {
    const { data: existingProfile } = await db().from("profiles").select("id").eq("email", normalizedEmail).maybeSingle()

    let inviteSent = false
    if (existingProfile) {
      profileId = existingProfile.id
    } else {
      const { data: vendor } = await db().from("vendors").select("company_name").eq("id", vendorId).single()

      const { data: invited, error: inviteError } = await db().auth.admin.generateLink({
        type: "invite",
        email: normalizedEmail,
        options: {
          redirectTo: `${process.env.FRONTEND_URL}/accept-invite`,
          data: { full_name: fullName.trim(), role: "vendor" },
        },
      })
      if (inviteError) throw inviteError
      createdNewAuthUser = true
      profileId = invited.user.id
      inviteSent = true
      await sendEmail({
        to: normalizedEmail,
        subject: `You've been invited to join ${vendor?.company_name ?? "your vendor team"} on CogniVend`,
        html: inviteHtml({ fullName: fullName.trim(), entityName: vendor?.company_name ?? "your vendor team", entityLabel: "a team member", inviteLink: invited.properties.action_link }),
      })
    }

    const { data: newVendorUser, error: vuError } = await db()
      .from("vendor_users")
      .insert({ vendor_id: vendorId, profile_id: profileId, status: "invited", is_primary: false })
      .select("id")
      .single()
    if (vuError) throw vuError
    vendorUserId = newVendorUser.id

    const { error: rolesError } = await db()
      .from("vendor_user_roles")
      .insert(finalRoleIds.map((roleId) => ({ vendor_user_id: vendorUserId, role_id: roleId })))
    if (rolesError) throw rolesError

    // New Team+Role model, dual-written alongside vendor_user_roles above --
    // additive only, nothing to remove for a brand-new staff member.
    const requestedTeamIds = [...new Set(finalAssignments.filter((a) => a.teamId).map((a) => a.teamId as string))]
    if (!(await validateTeamsBelongToTenant("vendor", vendorId, requestedTeamIds))) {
      return res.status(400).json({ error: "One or more teams do not belong to this vendor" })
    }
    await applyTeamRoleAssignments({ scope: "vendor", tenantId: vendorId, profileId: profileId!, assignments: finalAssignments, replace: false })

    await writeAudit({
      entityType: "vendor_user",
      entityId: vendorUserId!,
      action: "vendor_user_invited",
      newValue: { email: normalizedEmail, full_name: fullName.trim(), role_ids: finalRoleIds, invite_sent: inviteSent },
      performedBy: actorId,
      orgId: null,
    })

    res.status(201).json({ data: { vendorUserId, email: normalizedEmail, inviteSent } })
  } catch (err: any) {
    console.error("[vendor-users/invite]", err.message)
    try {
      if (vendorUserId) await db().from("vendor_users").delete().eq("id", vendorUserId)
      if (profileId && createdNewAuthUser) {
        await db().from("profiles").delete().eq("id", profileId)
        await db().auth.admin.deleteUser(profileId)
      }
    } catch (cleanupErr: any) {
      console.error("[vendor-users/invite] cleanup failed", cleanupErr.message)
    }
    res.status(500).json({ error: err.message || "Failed to invite vendor staff" })
  }
})

// POST /api/vendor-users/update-roles
router.post("/update-roles", requireAuth, async (req: Request, res: Response) => {
  try {
    const { vendorUserId, roleIds, assignments } = req.body as {
      vendorUserId?: string; roleIds?: string[]; assignments?: TeamRoleAssignment[]
    }
    const actorId = (req as AuthenticatedRequest).user.id
    if (!vendorUserId || !Array.isArray(roleIds) || roleIds.length === 0) {
      return res.status(400).json({ error: "vendorUserId and at least one roleId are required" })
    }

    const vendorId = await resolveVendorId(actorId)
    if (!vendorId) return res.status(403).json({ error: "No vendor profile found for this user" })
    if (!(await requireVendorManagePermission(actorId, vendorId))) {
      return res.status(403).json({ error: "You do not have permission to manage vendor staff" })
    }

    const { data: vendorUser, error: vuError } = await db()
      .from("vendor_users")
      .select("id, profile_id")
      .eq("id", vendorUserId)
      .eq("vendor_id", vendorId)
      .maybeSingle()
    if (vuError) throw vuError
    if (!vendorUser) return res.status(404).json({ error: "Staff member not found for this vendor" })

    const { error: deleteError } = await db().from("vendor_user_roles").delete().eq("vendor_user_id", vendorUserId)
    if (deleteError) throw deleteError

    const { error: insertError } = await db()
      .from("vendor_user_roles")
      .insert(roleIds.map((roleId) => ({ vendor_user_id: vendorUserId, role_id: roleId })))
    if (insertError) throw insertError

    // New Team+Role model -- full replace when assignments[] is supplied,
    // matching this route's existing full-replace semantics for
    // vendor_user_roles above.
    if (Array.isArray(assignments)) {
      const requestedTeamIds = [...new Set(assignments.filter((a) => a.teamId).map((a) => a.teamId as string))]
      if (!(await validateTeamsBelongToTenant("vendor", vendorId, requestedTeamIds))) {
        return res.status(400).json({ error: "One or more teams do not belong to this vendor" })
      }
      await applyTeamRoleAssignments({ scope: "vendor", tenantId: vendorId, profileId: vendorUser.profile_id, assignments, replace: true })
    }

    await writeAudit({
      entityType: "vendor_user",
      entityId: vendorUserId,
      action: "vendor_user_roles_updated",
      newValue: { role_ids: roleIds },
      performedBy: actorId,
      orgId: null,
    })

    res.json({ data: { vendorUserId, roleIds } })
  } catch (err: any) {
    console.error("[vendor-users/update-roles]", err.message)
    res.status(500).json({ error: "Failed to update staff roles" })
  }
})

// POST /api/vendor-users/assignments/list — client-org assignments for one
// staff member (used to pre-populate the multi-select).
router.post("/assignments/list", requireAuth, async (req: Request, res: Response) => {
  try {
    const { userId: targetUserId } = req.body as { userId?: string }
    const actorId = (req as AuthenticatedRequest).user.id
    if (!targetUserId) return res.status(400).json({ error: "userId is required" })

    const vendorId = await resolveVendorId(actorId)
    if (!vendorId) return res.status(403).json({ error: "No vendor profile found for this user" })

    // targetUserId is a vendor_users.id (that's what /vendor-users/list hands
    // the frontend), but vendor_user_assignments.user_id is a profiles.id
    // FK -- resolve it here, scoped to the caller's own vendor so this can't
    // be used to probe another vendor's staff.
    const { data: targetVendorUser, error: targetError } = await db()
      .from("vendor_users")
      .select("profile_id")
      .eq("id", targetUserId)
      .eq("vendor_id", vendorId)
      .maybeSingle()
    if (targetError) throw targetError
    if (!targetVendorUser) return res.status(404).json({ error: "Staff member not found" })

    const { data, error } = await db()
      .from("vendor_user_assignments")
      .select("organization_id")
      .eq("vendor_id", vendorId)
      .eq("user_id", targetVendorUser.profile_id)
    if (error) throw error

    res.json({ data: (data ?? []).map((r: any) => r.organization_id) })
  } catch (err: any) {
    console.error("[vendor-users/assignments/list]", err.message)
    res.status(500).json({ error: "Failed to load client assignments" })
  }
})

// POST /api/vendor-users/assignments/set — Admin/Manager only. Replaces the
// full assignment set for one staff member with the given org id list (an
// empty list means "no explicit assignments" -- for an Associate that means
// seeing nothing until assigned; the precedence rule itself lives in
// whichever screen reads these, not here).
router.post("/assignments/set", requireAuth, async (req: Request, res: Response) => {
  try {
    const { userId: targetUserId, organizationIds } = req.body as { userId?: string; organizationIds?: string[] }
    const actorId = (req as AuthenticatedRequest).user.id
    if (!targetUserId || !Array.isArray(organizationIds)) {
      return res.status(400).json({ error: "userId and organizationIds are required" })
    }

    const vendorId = await resolveVendorId(actorId)
    if (!vendorId) return res.status(403).json({ error: "No vendor profile found for this user" })
    if (!(await requireVendorManagePermission(actorId, vendorId))) {
      return res.status(403).json({ error: "You do not have permission to manage client assignments" })
    }

    // Same resolution as /assignments/list: targetUserId is a vendor_users.id,
    // but vendor_user_assignments.user_id is a profiles.id FK.
    const { data: targetVendorUser, error: targetError } = await db()
      .from("vendor_users")
      .select("profile_id")
      .eq("id", targetUserId)
      .eq("vendor_id", vendorId)
      .maybeSingle()
    if (targetError) throw targetError
    if (!targetVendorUser) return res.status(404).json({ error: "Staff member not found" })
    const targetProfileId = targetVendorUser.profile_id

    const dedupedOrgIds = [...new Set(organizationIds)]

    const { error: deleteError } = await db()
      .from("vendor_user_assignments")
      .delete()
      .eq("vendor_id", vendorId)
      .eq("user_id", targetProfileId)
    if (deleteError) throw deleteError

    if (dedupedOrgIds.length > 0) {
      const { error: insertError } = await db()
        .from("vendor_user_assignments")
        .insert(dedupedOrgIds.map((organizationId) => ({ vendor_id: vendorId, user_id: targetProfileId, organization_id: organizationId })))
      if (insertError) throw insertError
    }

    await writeAudit({
      entityType: "vendor_user",
      entityId: targetUserId,
      action: "vendor_user_assignments_updated",
      newValue: { organization_ids: dedupedOrgIds },
      performedBy: actorId,
      orgId: null,
    })

    res.json({ data: { userId: targetUserId, organizationIds: dedupedOrgIds } })
  } catch (err: any) {
    console.error("[vendor-users/assignments/set]", err.message)
    res.status(500).json({ error: "Failed to update client assignments" })
  }
})

// POST /api/vendor-users/suspend — deactivate an active staff member.
// Cannot suspend yourself (avoids locking yourself out).
router.post("/suspend", requireAuth, async (req: Request, res: Response) => {
  try {
    const { vendorUserId } = req.body as { vendorUserId?: string }
    const actorId = (req as AuthenticatedRequest).user.id
    if (!vendorUserId) return res.status(400).json({ error: "vendorUserId is required" })

    const vendorId = await resolveVendorId(actorId)
    if (!vendorId) return res.status(403).json({ error: "No vendor profile found for this user" })
    if (!(await requireVendorManagePermission(actorId, vendorId))) {
      return res.status(403).json({ error: "You do not have permission to manage vendor staff" })
    }

    const { data: vendorUser, error: vuError } = await db()
      .from("vendor_users").select("id, profile_id, status").eq("id", vendorUserId).eq("vendor_id", vendorId).maybeSingle()
    if (vuError) throw vuError
    if (!vendorUser) return res.status(404).json({ error: "Staff member not found for this vendor" })
    if (vendorUser.profile_id === actorId) return res.status(400).json({ error: "You cannot suspend yourself" })
    if (vendorUser.status !== "active") return res.status(400).json({ error: "Only an active staff member can be suspended" })

    const { error: updateError } = await db().from("vendor_users").update({ status: "suspended" }).eq("id", vendorUserId)
    if (updateError) throw updateError

    await writeAudit({ entityType: "vendor_user", entityId: vendorUserId, action: "vendor_user_suspended", newValue: {}, performedBy: actorId, orgId: null })
    res.json({ data: { vendorUserId, status: "suspended" } })
  } catch (err: any) {
    console.error("[vendor-users/suspend]", err.message)
    res.status(500).json({ error: "Failed to suspend staff member" })
  }
})

// POST /api/vendor-users/reinstate — restore a suspended staff member to active.
router.post("/reinstate", requireAuth, async (req: Request, res: Response) => {
  try {
    const { vendorUserId } = req.body as { vendorUserId?: string }
    const actorId = (req as AuthenticatedRequest).user.id
    if (!vendorUserId) return res.status(400).json({ error: "vendorUserId is required" })

    const vendorId = await resolveVendorId(actorId)
    if (!vendorId) return res.status(403).json({ error: "No vendor profile found for this user" })
    if (!(await requireVendorManagePermission(actorId, vendorId))) {
      return res.status(403).json({ error: "You do not have permission to manage vendor staff" })
    }

    const { data: vendorUser, error: vuError } = await db()
      .from("vendor_users").select("id, status").eq("id", vendorUserId).eq("vendor_id", vendorId).maybeSingle()
    if (vuError) throw vuError
    if (!vendorUser) return res.status(404).json({ error: "Staff member not found for this vendor" })
    if (vendorUser.status !== "suspended") return res.status(400).json({ error: "Only a suspended staff member can be reinstated" })

    const { error: updateError } = await db().from("vendor_users").update({ status: "active" }).eq("id", vendorUserId)
    if (updateError) throw updateError

    await writeAudit({ entityType: "vendor_user", entityId: vendorUserId, action: "vendor_user_reinstated", newValue: {}, performedBy: actorId, orgId: null })
    res.json({ data: { vendorUserId, status: "active" } })
  } catch (err: any) {
    console.error("[vendor-users/reinstate]", err.message)
    res.status(500).json({ error: "Failed to reinstate staff member" })
  }
})

// POST /api/vendor-users/revoke — cancel a pending (never-accepted) invite.
// Only valid from status='invited' -- see orgMembers.ts's /revoke for the
// same reasoning on not deleting the underlying profile/auth user.
router.post("/revoke", requireAuth, async (req: Request, res: Response) => {
  try {
    const { vendorUserId } = req.body as { vendorUserId?: string }
    const actorId = (req as AuthenticatedRequest).user.id
    if (!vendorUserId) return res.status(400).json({ error: "vendorUserId is required" })

    const vendorId = await resolveVendorId(actorId)
    if (!vendorId) return res.status(403).json({ error: "No vendor profile found for this user" })
    if (!(await requireVendorManagePermission(actorId, vendorId))) {
      return res.status(403).json({ error: "You do not have permission to manage vendor staff" })
    }

    const { data: vendorUser, error: vuError } = await db()
      .from("vendor_users").select("id, profile_id, status").eq("id", vendorUserId).eq("vendor_id", vendorId).maybeSingle()
    if (vuError) throw vuError
    if (!vendorUser) return res.status(404).json({ error: "Staff member not found for this vendor" })
    if (vendorUser.status !== "invited") return res.status(400).json({ error: "Only a pending invitation can be revoked" })

    const { data: vendorTeams } = await db().from("teams").select("id").eq("vendor_id", vendorId).eq("scope", "vendor")
    const teamIds = (vendorTeams ?? []).map((t: any) => t.id)
    if (teamIds.length > 0) {
      await db().from("team_members").delete().eq("profile_id", vendorUser.profile_id).in("team_id", teamIds)
    }
    await db().from("direct_role_assignments").delete().eq("scope", "vendor").eq("vendor_id", vendorId).eq("profile_id", vendorUser.profile_id)
    await db().from("vendor_users").delete().eq("id", vendorUserId) // cascades vendor_user_roles

    await writeAudit({ entityType: "vendor_user", entityId: vendorUserId, action: "vendor_user_invite_revoked", newValue: {}, performedBy: actorId, orgId: null })
    res.json({ data: { vendorUserId } })
  } catch (err: any) {
    console.error("[vendor-users/revoke]", err.message)
    res.status(500).json({ error: "Failed to revoke invitation" })
  }
})

// POST /api/vendor-users/resend — re-send the invite email for a still-
// pending staff member.
router.post("/resend", requireAuth, async (req: Request, res: Response) => {
  try {
    const { vendorUserId } = req.body as { vendorUserId?: string }
    const actorId = (req as AuthenticatedRequest).user.id
    if (!vendorUserId) return res.status(400).json({ error: "vendorUserId is required" })

    const vendorId = await resolveVendorId(actorId)
    if (!vendorId) return res.status(403).json({ error: "No vendor profile found for this user" })
    if (!(await requireVendorManagePermission(actorId, vendorId))) {
      return res.status(403).json({ error: "You do not have permission to manage vendor staff" })
    }

    const { data: vendorUser, error: vuError } = await db()
      .from("vendor_users")
      .select("id, status, profile:profile_id(email, full_name)")
      .eq("id", vendorUserId).eq("vendor_id", vendorId).maybeSingle()
    if (vuError) throw vuError
    if (!vendorUser) return res.status(404).json({ error: "Staff member not found for this vendor" })
    if (vendorUser.status !== "invited") return res.status(400).json({ error: "Only a pending invitation can be resent" })

    const { data: vendor } = await db().from("vendors").select("company_name").eq("id", vendorId).single()

    const { data: relinked, error: linkError } = await db().auth.admin.generateLink({
      type: "invite",
      email: vendorUser.profile.email,
      options: {
        redirectTo: `${process.env.FRONTEND_URL}/accept-invite`,
        data: { full_name: vendorUser.profile.full_name, role: "vendor" },
      },
    })
    if (linkError) throw linkError
    await sendEmail({
      to: vendorUser.profile.email,
      subject: `Reminder: you've been invited to join ${vendor?.company_name ?? "your vendor team"} on CogniVend`,
      html: inviteHtml({ fullName: vendorUser.profile.full_name, entityName: vendor?.company_name ?? "your vendor team", entityLabel: "a team member", inviteLink: relinked.properties.action_link }),
    })

    await writeAudit({ entityType: "vendor_user", entityId: vendorUserId, action: "vendor_user_invite_resent", newValue: {}, performedBy: actorId, orgId: null })
    res.json({ data: { vendorUserId, resent: true } })
  } catch (err: any) {
    console.error("[vendor-users/resend]", err.message)
    res.status(500).json({ error: "Failed to resend invitation" })
  }
})

// POST /api/vendor-users/restrictions/list — {vendorUserId}. Mirrors
// org-members.ts's /restrictions/list -- see its comment for the design.
router.post("/restrictions/list", requireAuth, async (req: Request, res: Response) => {
  try {
    const { vendorUserId } = req.body as { vendorUserId?: string }
    const actorId = (req as AuthenticatedRequest).user.id
    if (!vendorUserId) return res.status(400).json({ error: "vendorUserId is required" })

    const vendorId = await resolveVendorId(actorId)
    if (!vendorId) return res.status(403).json({ error: "No vendor profile found for this user" })
    if (!(await requireVendorManagePermission(actorId, vendorId))) {
      return res.status(403).json({ error: "You do not have permission to manage vendor staff" })
    }

    const { data: vendorUser, error: vuError } = await db()
      .from("vendor_users").select("id, profile_id").eq("id", vendorUserId).eq("vendor_id", vendorId).maybeSingle()
    if (vuError) throw vuError
    if (!vendorUser) return res.status(404).json({ error: "Staff member not found for this vendor" })

    const { data: roleRows, error: roleError } = await db()
      .from("vendor_user_roles").select("role_id").eq("vendor_user_id", vendorUserId)
    if (roleError) throw roleError
    const roleIds = [...new Set((roleRows ?? []).map((r: any) => r.role_id))]

    const permissionMap = new Map<string, any>()
    if (roleIds.length > 0) {
      const { data: rolePerms, error: rpError } = await db()
        .from("role_permissions")
        .select("permission:permission_id(id, key, module, action, description)")
        .in("role_id", roleIds)
      if (rpError) throw rpError
      for (const row of rolePerms ?? []) {
        permissionMap.set(row.permission.id, row.permission)
      }
    }
    const effectivePermissions = [...permissionMap.values()].sort((a, b) => a.key.localeCompare(b.key))

    const { data: restrictions, error: restrictionError } = await db()
      .from("user_permission_restrictions")
      .select("id, permission_id, reason, set_by, set_at")
      .eq("scope", "vendor").eq("vendor_id", vendorId).eq("profile_id", vendorUser.profile_id)
    if (restrictionError) throw restrictionError

    res.json({ data: { effectivePermissions, restrictions: restrictions ?? [] } })
  } catch (err: any) {
    console.error("[vendor-users/restrictions/list]", err.message)
    res.status(500).json({ error: "Failed to load restrictions" })
  }
})

// POST /api/vendor-users/restrictions/set — {vendorUserId, permissionId, restricted, reason?}
router.post("/restrictions/set", requireAuth, async (req: Request, res: Response) => {
  try {
    const { vendorUserId, permissionId, restricted, reason } = req.body as {
      vendorUserId?: string; permissionId?: string; restricted?: boolean; reason?: string
    }
    const actorId = (req as AuthenticatedRequest).user.id
    if (!vendorUserId || !permissionId || typeof restricted !== "boolean") {
      return res.status(400).json({ error: "vendorUserId, permissionId, and restricted are required" })
    }

    const vendorId = await resolveVendorId(actorId)
    if (!vendorId) return res.status(403).json({ error: "No vendor profile found for this user" })
    if (!(await requireVendorManagePermission(actorId, vendorId))) {
      return res.status(403).json({ error: "You do not have permission to manage vendor staff" })
    }

    const { data: vendorUser, error: vuError } = await db()
      .from("vendor_users").select("id, profile_id").eq("id", vendorUserId).eq("vendor_id", vendorId).maybeSingle()
    if (vuError) throw vuError
    if (!vendorUser) return res.status(404).json({ error: "Staff member not found for this vendor" })

    if (restricted) {
      const { data: existing } = await db()
        .from("user_permission_restrictions")
        .select("id").eq("scope", "vendor").eq("vendor_id", vendorId).eq("profile_id", vendorUser.profile_id).eq("permission_id", permissionId).maybeSingle()
      if (!existing) {
        const { error } = await db().from("user_permission_restrictions").insert({
          scope: "vendor", vendor_id: vendorId, profile_id: vendorUser.profile_id, permission_id: permissionId,
          reason: reason || null, set_by: actorId,
        })
        if (error) throw error
      }
    } else {
      const { error } = await db()
        .from("user_permission_restrictions")
        .delete().eq("scope", "vendor").eq("vendor_id", vendorId).eq("profile_id", vendorUser.profile_id).eq("permission_id", permissionId)
      if (error) throw error
    }

    await writeAudit({
      entityType: "vendor_user", entityId: vendorUserId,
      action: restricted ? "permission_restriction_added" : "permission_restriction_removed",
      newValue: { permission_id: permissionId, reason: reason || null },
      performedBy: actorId, orgId: null,
    })
    res.json({ data: { vendorUserId, permissionId, restricted } })
  } catch (err: any) {
    console.error("[vendor-users/restrictions/set]", err.message)
    res.status(500).json({ error: err.message || "Failed to update restriction" })
  }
})

// POST /api/vendor-users/roles/delegate — {vendorUserId, roleId, validUntil, reason?}
// Mirrors org-members.ts's /roles/delegate -- see its comment for the design.
router.post("/roles/delegate", requireAuth, async (req: Request, res: Response) => {
  try {
    const { vendorUserId, roleId, validUntil, reason } = req.body as {
      vendorUserId?: string; roleId?: string; validUntil?: string; reason?: string
    }
    const actorId = (req as AuthenticatedRequest).user.id
    if (!vendorUserId || !roleId || !validUntil) {
      return res.status(400).json({ error: "vendorUserId, roleId, and validUntil are required" })
    }
    if (new Date(validUntil).getTime() <= Date.now()) {
      return res.status(400).json({ error: "validUntil must be in the future" })
    }

    const vendorId = await resolveVendorId(actorId)
    if (!vendorId) return res.status(403).json({ error: "No vendor profile found for this user" })
    if (!(await requireVendorManagePermission(actorId, vendorId))) {
      return res.status(403).json({ error: "You do not have permission to manage vendor staff" })
    }

    const { data: vendorUser } = await db().from("vendor_users").select("id").eq("id", vendorUserId).eq("vendor_id", vendorId).maybeSingle()
    if (!vendorUser) return res.status(404).json({ error: "Staff member not found for this vendor" })

    const { data: existing } = await db().from("vendor_user_roles").select("vendor_user_id").eq("vendor_user_id", vendorUserId).eq("role_id", roleId).maybeSingle()
    if (existing) {
      return res.status(400).json({ error: "This staff member already holds this role — edit their roles directly instead of delegating it" })
    }

    const { error } = await db().from("vendor_user_roles").insert({
      vendor_user_id: vendorUserId, role_id: roleId, valid_from: new Date().toISOString(), valid_until: validUntil,
    })
    if (error) throw error

    await writeAudit({
      entityType: "vendor_user", entityId: vendorUserId, action: "role_delegated",
      newValue: { role_id: roleId, valid_until: validUntil, reason: reason || null },
      performedBy: actorId, orgId: null,
    })
    res.status(201).json({ data: { vendorUserId, roleId, validUntil } })
  } catch (err: any) {
    console.error("[vendor-users/roles/delegate]", err.message)
    res.status(500).json({ error: err.message || "Failed to delegate role" })
  }
})

// POST /api/vendor-users/roles/revoke-delegation — {vendorUserId, roleId}
router.post("/roles/revoke-delegation", requireAuth, async (req: Request, res: Response) => {
  try {
    const { vendorUserId, roleId } = req.body as { vendorUserId?: string; roleId?: string }
    const actorId = (req as AuthenticatedRequest).user.id
    if (!vendorUserId || !roleId) return res.status(400).json({ error: "vendorUserId and roleId are required" })

    const vendorId = await resolveVendorId(actorId)
    if (!vendorId) return res.status(403).json({ error: "No vendor profile found for this user" })
    if (!(await requireVendorManagePermission(actorId, vendorId))) {
      return res.status(403).json({ error: "You do not have permission to manage vendor staff" })
    }

    const { data: vendorUser } = await db().from("vendor_users").select("id").eq("id", vendorUserId).eq("vendor_id", vendorId).maybeSingle()
    if (!vendorUser) return res.status(404).json({ error: "Staff member not found for this vendor" })

    const { error } = await db()
      .from("vendor_user_roles").delete().eq("vendor_user_id", vendorUserId).eq("role_id", roleId).not("valid_until", "is", null)
    if (error) throw error

    await writeAudit({
      entityType: "vendor_user", entityId: vendorUserId, action: "role_delegation_revoked",
      newValue: { role_id: roleId }, performedBy: actorId, orgId: null,
    })
    res.json({ data: { vendorUserId, roleId } })
  } catch (err: any) {
    console.error("[vendor-users/roles/revoke-delegation]", err.message)
    res.status(500).json({ error: err.message || "Failed to revoke delegated access" })
  }
})

// POST /api/vendor-users/roles/delegations-list — {vendorUserId}
router.post("/roles/delegations-list", requireAuth, async (req: Request, res: Response) => {
  try {
    const { vendorUserId } = req.body as { vendorUserId?: string }
    const actorId = (req as AuthenticatedRequest).user.id
    if (!vendorUserId) return res.status(400).json({ error: "vendorUserId is required" })

    const vendorId = await resolveVendorId(actorId)
    if (!vendorId) return res.status(403).json({ error: "No vendor profile found for this user" })

    const { data: vendorUser } = await db().from("vendor_users").select("id").eq("id", vendorUserId).eq("vendor_id", vendorId).maybeSingle()
    if (!vendorUser) return res.status(404).json({ error: "Staff member not found for this vendor" })

    const { data, error } = await db()
      .from("vendor_user_roles")
      .select("role:role_id(id, name), valid_from, valid_until")
      .eq("vendor_user_id", vendorUserId)
      .not("valid_until", "is", null)
      .order("valid_until")
    if (error) throw error

    res.json({ data })
  } catch (err: any) {
    console.error("[vendor-users/roles/delegations-list]", err.message)
    res.status(500).json({ error: "Failed to load delegated access" })
  }
})

export default router
