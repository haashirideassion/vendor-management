import { Router, Request, Response } from "express"
import { getSupabaseAdmin } from "../utils/supabaseAdmin"
import { requireAuth, AuthenticatedRequest } from "../middleware/auth"
import { requireOrg, OrgScopedRequest } from "../middleware/org"
import { writeAudit, resolveActingAs } from "../services/audit"
import { sendEmail, inviteHtml } from "../services/email.service"
import { applyTeamRoleAssignments, validateTeamsBelongToTenant, type TeamRoleAssignment } from "../services/teamAssignment.service"

const router = Router()
function db(): any { return getSupabaseAdmin() }

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// Legacy org_role is kept populated (not dropped until the RLS cutover +
// legacy-drop migrations are verified) since is_org_admin() -- not yet cut
// over to the bundle model -- still reads it in a few RLS policies (e.g.
// organizations' own UPDATE policy). Hardcoding "org_admin" for every invite
// regardless of actual role would incorrectly grant is_org_admin()-gated
// access to a plain Associate; this derives the legacy value from whichever
// bundle is actually being assigned, using the highest tier present.
async function legacyOrgRoleFor(roleIds: string[]): Promise<string> {
  const { data: roles } = await db().from("roles").select("id, name").in("id", roleIds)
  const names = new Set((roles ?? []).map((r: any) => r.name))
  if (names.has("Admin")) return "admin"
  if (names.has("Manager")) return "manager"
  return "hr_user"
}

// Only an org's own Admin-tier member may invite members or edit their role
// assignments -- org scope has no dedicated "members.manage" permission key
// (unlike vendor scope's vendor_users.manage), so this resolves the actor's
// role names directly within this org, mirroring resolveVendorAllowedOrgIds'
// shape in middleware/org.ts.
async function isOrgAdmin(profileId: string, orgId: string): Promise<boolean> {
  const { data: member } = await db()
    .from("organization_members")
    .select("id")
    .eq("org_id", orgId)
    .eq("profile_id", profileId)
    .maybeSingle()
  if (!member) return false
  const { data: roleRows } = await db()
    .from("org_member_roles")
    .select("role:role_id(name)")
    .eq("org_member_id", member.id)
  return (roleRows ?? []).some((r: any) => r.role.name === "Admin")
}

// POST /api/org-members/list — members of the caller's org with their
// resolved role names (legacy org_member_roles) plus the new Team+Role
// assignments (team_members + direct_role_assignments) -- both shown while
// the two systems coexist; org_member_roles is still what actually drives
// permission resolution until Phase 3's centralized authorization resolver
// cuts reads over to the new tables.
router.post("/list", requireAuth, requireOrg, async (req: Request, res: Response) => {
  try {
    const { orgId } = req as OrgScopedRequest
    const { data: members, error } = await db()
      .from("organization_members")
      .select("id, profile_id, status, is_primary, created_at, profile:profile_id(id, full_name, email)")
      .eq("org_id", orgId)
    if (error) throw error

    const memberIds = (members ?? []).map((m: any) => m.id)
    const profileIds = (members ?? []).map((m: any) => m.profile_id)
    const roleNamesByMember = new Map<string, string[]>()
    if (memberIds.length > 0) {
      const { data: memberRoles, error: mrError } = await db()
        .from("org_member_roles")
        .select("org_member_id, role:role_id(name)")
        .in("org_member_id", memberIds)
      if (mrError) throw mrError
      for (const row of memberRoles ?? []) {
        const names = roleNamesByMember.get(row.org_member_id) ?? []
        names.push(row.role.name)
        roleNamesByMember.set(row.org_member_id, names)
      }
    }

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
        .eq("scope", "org")
        .eq("org_id", orgId)
        .in("profile_id", profileIds)
      if (draError) throw draError
      for (const row of draRows ?? []) {
        const names = directRoleNamesByProfile.get(row.profile_id) ?? []
        names.push(row.role.name)
        directRoleNamesByProfile.set(row.profile_id, names)
      }
    }

    const data = (members ?? []).map((m: any) => ({
      id: m.id,
      status: m.status,
      isPrimary: m.is_primary,
      createdAt: m.created_at,
      profile: m.profile,
      roleNames: roleNamesByMember.get(m.id) ?? [],
      teamAssignments: teamAssignmentsByProfile.get(m.profile_id) ?? [],
      directRoleNames: directRoleNamesByProfile.get(m.profile_id) ?? [],
    }))
    res.json({ data })
  } catch (err: any) {
    console.error("[org-members/list]", err.message)
    res.status(500).json({ error: "Failed to list organization members" })
  }
})

// POST /api/org-members/teams/list — active teams for the caller's org.
router.post("/teams/list", requireAuth, requireOrg, async (req: Request, res: Response) => {
  try {
    const { orgId } = req as OrgScopedRequest
    const { data, error } = await db()
      .from("teams")
      .select("id, name, description")
      .eq("scope", "org")
      .eq("org_id", orgId)
      .eq("active", true)
      .order("name")
    if (error) throw error
    res.json({ data })
  } catch (err: any) {
    console.error("[org-members/teams/list]", err.message)
    res.status(500).json({ error: "Failed to list teams" })
  }
})

// POST /api/org-members/teams/create — Org Admin only. Teams are a pure
// organizational grouping ("where you work") -- creating one grants no
// permissions by itself, so this only needs the same Admin gate as invite,
// not a dedicated permission key.
router.post("/teams/create", requireAuth, requireOrg, async (req: Request, res: Response) => {
  const { orgId } = req as OrgScopedRequest
  const actorId = (req as AuthenticatedRequest).user.id
  const { name, description } = req.body as { name?: string; description?: string }
  if (!name?.trim()) return res.status(400).json({ error: "name is required" })
  if (!(await isOrgAdmin(actorId, orgId))) {
    return res.status(403).json({ error: "Only an organization Admin can create teams" })
  }
  try {
    const { data, error } = await db()
      .from("teams")
      .insert({ scope: "org", org_id: orgId, name: name.trim(), description: description?.trim() || null })
      .select("id, name, description")
      .single()
    if (error) throw error
    await writeAudit({
      entityType: "team", entityId: data.id, action: "team_created",
      newValue: { name: name.trim() }, performedBy: actorId, orgId,
      actingAs: await resolveActingAs(actorId, orgId),
    })
    res.status(201).json({ data })
  } catch (err: any) {
    console.error("[org-members/teams/create]", err.message)
    res.status(500).json({ error: err.message || "Failed to create team" })
  }
})

// POST /api/org-members/assignable-roles — org-scope roles this org's invite
// UI can offer, plus the org's role_mode so the frontend knows whether to
// show a picker at all (solo orgs don't).
router.post("/assignable-roles", requireAuth, requireOrg, async (req: Request, res: Response) => {
  try {
    const { orgId } = req as OrgScopedRequest
    const { data: org, error: orgError } = await db().from("organizations").select("role_mode").eq("id", orgId).single()
    if (orgError) throw orgError

    // Admin is excluded -- it's the org's own account owner, established at
    // signup/superadmin-creation, not a role assigned to invited staff or
    // reassigned here. Includes this org's own custom roles (Phase 7a)
    // alongside the system roles -- assignment (invite/edit-roles) needs no
    // separate UI for custom roles, they just show up in the same picker.
    const { data: roles, error } = await db()
      .from("roles")
      .select("id, name, description, is_system")
      .eq("scope", "org")
      .neq("name", "Admin")
      .or(`is_system.eq.true,owner_org_id.eq.${orgId}`)
      .order("name")
    if (error) throw error

    res.json({ data: { roleMode: org.role_mode, roles } })
  } catch (err: any) {
    console.error("[org-members/assignable-roles]", err.message)
    res.status(500).json({ error: "Failed to load assignable roles" })
  }
})

// POST /api/org-members/roles/assignable-permissions — the permission
// catalog a custom org-scope role can be composed from: every permission
// currently used by at least one org-scope role, as a proxy for "makes
// sense at org scope" (permissions have no scope column of their own).
router.post("/roles/assignable-permissions", requireAuth, requireOrg, async (req: Request, res: Response) => {
  try {
    const { data: orgRoles, error: rolesError } = await db().from("roles").select("id").eq("scope", "org")
    if (rolesError) throw rolesError
    const roleIds = (orgRoles ?? []).map((r: any) => r.id)
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
    console.error("[org-members/roles/assignable-permissions]", err.message)
    res.status(500).json({ error: "Failed to load permission catalog" })
  }
})

// POST /api/org-members/roles/create-custom — {name, description?, permissionIds}
router.post("/roles/create-custom", requireAuth, requireOrg, async (req: Request, res: Response) => {
  const { orgId } = req as OrgScopedRequest
  const actorId = (req as AuthenticatedRequest).user.id
  const { name, description, permissionIds } = req.body as { name?: string; description?: string; permissionIds?: string[] }
  if (!name?.trim()) return res.status(400).json({ error: "name is required" })
  if (!Array.isArray(permissionIds) || permissionIds.length === 0) {
    return res.status(400).json({ error: "At least one permission must be selected" })
  }
  if (!(await isOrgAdmin(actorId, orgId))) {
    return res.status(403).json({ error: "Only an organization Admin can create custom roles" })
  }
  try {
    const { data: role, error } = await db()
      .from("roles")
      .insert({ name: name.trim(), scope: "org", description: description?.trim() || null, is_system: false, owner_org_id: orgId })
      .select("id, name, description")
      .single()
    if (error) throw error

    const { error: rpError } = await db()
      .from("role_permissions")
      .insert(permissionIds.map((permissionId) => ({ role_id: role.id, permission_id: permissionId })))
    if (rpError) throw rpError

    await writeAudit({
      entityType: "role", entityId: role.id, action: "custom_role_created",
      newValue: { name: name.trim(), permission_ids: permissionIds }, performedBy: actorId, orgId,
      actingAs: await resolveActingAs(actorId, orgId),
    })
    res.status(201).json({ data: role })
  } catch (err: any) {
    console.error("[org-members/roles/create-custom]", err.message)
    res.status(500).json({ error: err.message || "Failed to create custom role" })
  }
})

// POST /api/org-members/roles/delete-custom — {roleId}. Blocked while the
// role is still assigned to anyone -- reassign those people first rather
// than silently orphaning their permissions.
router.post("/roles/delete-custom", requireAuth, requireOrg, async (req: Request, res: Response) => {
  const { orgId } = req as OrgScopedRequest
  const actorId = (req as AuthenticatedRequest).user.id
  const { roleId } = req.body as { roleId?: string }
  if (!roleId) return res.status(400).json({ error: "roleId is required" })
  if (!(await isOrgAdmin(actorId, orgId))) {
    return res.status(403).json({ error: "Only an organization Admin can delete custom roles" })
  }
  try {
    const { data: role } = await db().from("roles").select("id, is_system, owner_org_id").eq("id", roleId).maybeSingle()
    if (!role) return res.status(404).json({ error: "Role not found" })
    if (role.is_system || role.owner_org_id !== orgId) {
      return res.status(403).json({ error: "This role does not belong to your organization or is a system role" })
    }

    const [{ count: memberRoleCount }, { count: teamCount }, { count: draCount }] = await Promise.all([
      db().from("org_member_roles").select("*", { count: "exact", head: true }).eq("role_id", roleId),
      db().from("team_members").select("*", { count: "exact", head: true }).eq("role_id", roleId),
      db().from("direct_role_assignments").select("*", { count: "exact", head: true }).eq("role_id", roleId),
    ])
    if ((memberRoleCount ?? 0) > 0 || (teamCount ?? 0) > 0 || (draCount ?? 0) > 0) {
      return res.status(400).json({ error: "This role is still assigned to one or more people — reassign them first" })
    }

    const { error } = await db().from("roles").delete().eq("id", roleId)
    if (error) throw error

    await writeAudit({
      entityType: "role", entityId: roleId, action: "custom_role_deleted",
      newValue: {}, performedBy: actorId, orgId, actingAs: await resolveActingAs(actorId, orgId),
    })
    res.json({ data: { roleId } })
  } catch (err: any) {
    console.error("[org-members/roles/delete-custom]", err.message)
    res.status(500).json({ error: err.message || "Failed to delete custom role" })
  }
})

// POST /api/org-members/invite — the first invite path for an ALREADY-
// EXISTING org (distinct from superadmin's create-with-admin, which creates
// an org and its first admin together). Solo-mode orgs get the full union of
// all three org-scope roles regardless of what's requested; tiered orgs use
// the roleIds provided.
router.post("/invite", requireAuth, requireOrg, async (req: Request, res: Response) => {
  const { email, fullName, roleIds, assignments } = req.body as {
    email?: string; fullName?: string; roleIds?: string[]
    assignments?: { teamId: string | null; roleId: string }[]
  }
  const { orgId } = req as OrgScopedRequest
  const actorId = (req as AuthenticatedRequest).user.id

  if (!email?.trim() || !fullName?.trim()) {
    return res.status(400).json({ error: "email and fullName are required" })
  }
  const normalizedEmail = email.trim().toLowerCase()
  if (!EMAIL_RE.test(normalizedEmail)) {
    return res.status(400).json({ error: "email is not a valid email address" })
  }
  if (!(await isOrgAdmin(actorId, orgId))) {
    return res.status(403).json({ error: "Only an organization Admin can invite members" })
  }

  let profileId: string | null = null
  let createdNewAuthUser = false
  let memberId: string | null = null

  try {
    const { data: org, error: orgError } = await db().from("organizations").select("role_mode, name").eq("id", orgId).single()
    if (orgError) throw orgError

    // finalAssignments drives the new Team+Role model (team_members /
    // direct_role_assignments); finalRoleIds is the deduped role set that
    // still drives the legacy org_member_roles insert below, unchanged --
    // dual-written until Phase 3's centralized authorization resolver reads
    // exclusively from the new tables. Solo-mode orgs bypass the new model
    // entirely (a 1-person org has no use for teams) and keep today's exact
    // "grant every org role, no team" behavior.
    let finalRoleIds: string[]
    let finalAssignments: { teamId: string | null; roleId: string }[]
    if (org.role_mode === "solo") {
      const { data: allOrgRoles, error: rolesError } = await db().from("roles").select("id").eq("scope", "org")
      if (rolesError) throw rolesError
      finalRoleIds = (allOrgRoles ?? []).map((r: any) => r.id)
      finalAssignments = finalRoleIds.map((roleId) => ({ teamId: null, roleId }))
    } else if (Array.isArray(assignments) && assignments.length > 0) {
      finalAssignments = assignments
      finalRoleIds = [...new Set(assignments.map((a) => a.roleId))]
    } else {
      finalRoleIds = roleIds ?? []
      finalAssignments = finalRoleIds.map((roleId) => ({ teamId: null, roleId }))
    }
    if (finalRoleIds.length === 0) {
      return res.status(400).json({ error: "At least one role must be assigned" })
    }

    const { data: existingProfile } = await db().from("profiles").select("id").eq("email", normalizedEmail).maybeSingle()

    let inviteSent = false
    if (existingProfile) {
      profileId = existingProfile.id
    } else {
      const { data: invited, error: inviteError } = await db().auth.admin.generateLink({
        type: "invite",
        email: normalizedEmail,
        options: {
          redirectTo: `${process.env.FRONTEND_URL}/accept-invite`,
          data: { full_name: fullName.trim(), role: "admin" },
        },
      })
      if (inviteError) throw inviteError
      createdNewAuthUser = true
      profileId = invited.user.id
      inviteSent = true
      // No manual profiles insert here -- on_auth_user_created fires
      // synchronously and creates the row (same pattern as
      // superadmin.ts's create-with-admin).
      await sendEmail({
        to: normalizedEmail,
        subject: `You've been invited to join ${org.name} on CogniVend`,
        html: inviteHtml({ fullName: fullName.trim(), entityName: org.name, entityLabel: "a team member", inviteLink: invited.properties.action_link }),
      })
    }

    // A profile can hold a second organization_members row at a different
    // org only when that org shares a Group with an org they're already
    // attached to (034_org_cross_group_membership.sql) -- checked here for
    // a clean 400 instead of letting the DB trigger's exception surface as
    // a 500.
    const { data: canAddMembership, error: canAddError } = await db().rpc("can_add_org_membership_as", {
      p_profile_id: profileId,
      p_target_org_id: orgId,
    })
    if (canAddError) throw canAddError
    if (canAddMembership !== true) {
      return res.status(400).json({
        error: "This person is already an active member of another organization outside this organization's Group",
      })
    }

    const legacyOrgRole = await legacyOrgRoleFor(finalRoleIds)

    const { data: newMember, error: memberError } = await db()
      .from("organization_members")
      .insert({ org_id: orgId, profile_id: profileId, org_role: legacyOrgRole, status: "invited", is_primary: false })
      .select("id")
      .single()
    if (memberError) throw memberError
    memberId = newMember.id

    const { error: rolesInsertError } = await db()
      .from("org_member_roles")
      .insert(finalRoleIds.map((roleId: string) => ({ org_member_id: memberId, role_id: roleId })))
    if (rolesInsertError) throw rolesInsertError

    // New Team+Role model, dual-written alongside org_member_roles above --
    // additive only (replace: false), nothing to remove for a brand-new
    // member. Team ids validated against this org first -- a client-
    // supplied teamId from another org must never silently succeed.
    const requestedTeamIds = [...new Set(finalAssignments.filter((a) => a.teamId).map((a) => a.teamId as string))]
    if (!(await validateTeamsBelongToTenant("org", orgId, requestedTeamIds))) {
      return res.status(400).json({ error: "One or more teams do not belong to this organization" })
    }
    await applyTeamRoleAssignments({ scope: "org", tenantId: orgId, profileId: profileId!, assignments: finalAssignments, replace: false })

    await writeAudit({
      entityType: "organization_member",
      entityId: memberId!,
      action: "member_invited",
      newValue: { email: normalizedEmail, full_name: fullName.trim(), role_ids: finalRoleIds, invite_sent: inviteSent },
      performedBy: actorId,
      orgId,
      actingAs: await resolveActingAs(actorId, orgId),
    })

    res.status(201).json({ data: { memberId, email: normalizedEmail, inviteSent } })
  } catch (err: any) {
    console.error("[org-members/invite]", err.message)
    try {
      if (memberId) await db().from("organization_members").delete().eq("id", memberId)
      if (profileId && createdNewAuthUser) {
        await db().from("profiles").delete().eq("id", profileId)
        await db().auth.admin.deleteUser(profileId)
      }
    } catch (cleanupErr: any) {
      console.error("[org-members/invite] cleanup failed", cleanupErr.message)
    }
    res.status(500).json({ error: err.message || "Failed to invite member" })
  }
})

// POST /api/org-members/update-roles — replace a member's role assignment.
router.post("/update-roles", requireAuth, requireOrg, async (req: Request, res: Response) => {
  try {
    const { memberId, roleIds, assignments } = req.body as {
      memberId?: string; roleIds?: string[]; assignments?: TeamRoleAssignment[]
    }
    const { orgId } = req as OrgScopedRequest
    const actorId = (req as AuthenticatedRequest).user.id
    if (!memberId || !Array.isArray(roleIds) || roleIds.length === 0) {
      return res.status(400).json({ error: "memberId and at least one roleId are required" })
    }
    if (!(await isOrgAdmin(actorId, orgId))) {
      return res.status(403).json({ error: "Only an organization Admin can edit member roles" })
    }

    const { data: member, error: memberError } = await db()
      .from("organization_members")
      .select("id, profile_id")
      .eq("id", memberId)
      .eq("org_id", orgId)
      .maybeSingle()
    if (memberError) throw memberError
    if (!member) return res.status(404).json({ error: "Member not found in this organization" })

    const legacyOrgRole = await legacyOrgRoleFor(roleIds)

    const { error: deleteError } = await db().from("org_member_roles").delete().eq("org_member_id", memberId)
    if (deleteError) throw deleteError

    const { error: insertError } = await db()
      .from("org_member_roles")
      .insert(roleIds.map((roleId) => ({ org_member_id: memberId, role_id: roleId })))
    if (insertError) throw insertError

    await db().from("organization_members").update({ org_role: legacyOrgRole }).eq("id", memberId)

    // New Team+Role model -- full replace when assignments[] is supplied
    // (matches this route's existing "replace a member's role assignment"
    // semantics for org_member_roles above); untouched if the caller only
    // sent the legacy roleIds shape.
    if (Array.isArray(assignments)) {
      const requestedTeamIds = [...new Set(assignments.filter((a) => a.teamId).map((a) => a.teamId as string))]
      if (!(await validateTeamsBelongToTenant("org", orgId, requestedTeamIds))) {
        return res.status(400).json({ error: "One or more teams do not belong to this organization" })
      }
      await applyTeamRoleAssignments({ scope: "org", tenantId: orgId, profileId: member.profile_id, assignments, replace: true })
    }

    await writeAudit({
      entityType: "organization_member",
      entityId: memberId,
      action: "member_roles_updated",
      newValue: { role_ids: roleIds },
      performedBy: actorId,
      orgId,
      actingAs: await resolveActingAs(actorId, orgId),
    })

    res.json({ data: { memberId, roleIds } })
  } catch (err: any) {
    console.error("[org-members/update-roles]", err.message)
    res.status(500).json({ error: "Failed to update member roles" })
  }
})

// POST /api/org-members/suspend — deactivate an active member. Cannot
// suspend yourself (avoids an Admin locking themselves out).
router.post("/suspend", requireAuth, requireOrg, async (req: Request, res: Response) => {
  try {
    const { memberId } = req.body as { memberId?: string }
    const { orgId } = req as OrgScopedRequest
    const actorId = (req as AuthenticatedRequest).user.id
    if (!memberId) return res.status(400).json({ error: "memberId is required" })
    if (!(await isOrgAdmin(actorId, orgId))) {
      return res.status(403).json({ error: "Only an organization Admin can suspend members" })
    }

    const { data: member, error: memberError } = await db()
      .from("organization_members").select("id, profile_id, status").eq("id", memberId).eq("org_id", orgId).maybeSingle()
    if (memberError) throw memberError
    if (!member) return res.status(404).json({ error: "Member not found in this organization" })
    if (member.profile_id === actorId) return res.status(400).json({ error: "You cannot suspend yourself" })
    if (member.status !== "active") return res.status(400).json({ error: "Only an active member can be suspended" })

    const { error: updateError } = await db().from("organization_members").update({ status: "suspended" }).eq("id", memberId)
    if (updateError) throw updateError

    await writeAudit({
      entityType: "organization_member", entityId: memberId, action: "member_suspended",
      newValue: {}, performedBy: actorId, orgId, actingAs: await resolveActingAs(actorId, orgId),
    })
    res.json({ data: { memberId, status: "suspended" } })
  } catch (err: any) {
    console.error("[org-members/suspend]", err.message)
    res.status(500).json({ error: "Failed to suspend member" })
  }
})

// POST /api/org-members/reinstate — restore a suspended member to active.
router.post("/reinstate", requireAuth, requireOrg, async (req: Request, res: Response) => {
  try {
    const { memberId } = req.body as { memberId?: string }
    const { orgId } = req as OrgScopedRequest
    const actorId = (req as AuthenticatedRequest).user.id
    if (!memberId) return res.status(400).json({ error: "memberId is required" })
    if (!(await isOrgAdmin(actorId, orgId))) {
      return res.status(403).json({ error: "Only an organization Admin can reinstate members" })
    }

    const { data: member, error: memberError } = await db()
      .from("organization_members").select("id, status").eq("id", memberId).eq("org_id", orgId).maybeSingle()
    if (memberError) throw memberError
    if (!member) return res.status(404).json({ error: "Member not found in this organization" })
    if (member.status !== "suspended") return res.status(400).json({ error: "Only a suspended member can be reinstated" })

    const { error: updateError } = await db().from("organization_members").update({ status: "active" }).eq("id", memberId)
    if (updateError) throw updateError

    await writeAudit({
      entityType: "organization_member", entityId: memberId, action: "member_reinstated",
      newValue: {}, performedBy: actorId, orgId, actingAs: await resolveActingAs(actorId, orgId),
    })
    res.json({ data: { memberId, status: "active" } })
  } catch (err: any) {
    console.error("[org-members/reinstate]", err.message)
    res.status(500).json({ error: "Failed to reinstate member" })
  }
})

// POST /api/org-members/revoke — cancel a pending (never-accepted) invite.
// Only valid from status='invited' -- an already-active member is
// deactivated via /suspend instead, never revoked. Removes the membership
// row and the Team+Role assignments made at invite time; deliberately does
// NOT delete the underlying profiles/auth.users record, since that profile
// may be legitimate for other reasons (e.g. an existing account being
// invited into a second org) -- only /invite's own failure-path cleanup
// (immediately after creation, same request) is safe to fully delete.
router.post("/revoke", requireAuth, requireOrg, async (req: Request, res: Response) => {
  try {
    const { memberId } = req.body as { memberId?: string }
    const { orgId } = req as OrgScopedRequest
    const actorId = (req as AuthenticatedRequest).user.id
    if (!memberId) return res.status(400).json({ error: "memberId is required" })
    if (!(await isOrgAdmin(actorId, orgId))) {
      return res.status(403).json({ error: "Only an organization Admin can revoke invitations" })
    }

    const { data: member, error: memberError } = await db()
      .from("organization_members").select("id, profile_id, status").eq("id", memberId).eq("org_id", orgId).maybeSingle()
    if (memberError) throw memberError
    if (!member) return res.status(404).json({ error: "Member not found in this organization" })
    if (member.status !== "invited") return res.status(400).json({ error: "Only a pending invitation can be revoked" })

    const { data: memberTeams } = await db().from("teams").select("id").eq("org_id", orgId).eq("scope", "org")
    const teamIds = (memberTeams ?? []).map((t: any) => t.id)
    if (teamIds.length > 0) {
      await db().from("team_members").delete().eq("profile_id", member.profile_id).in("team_id", teamIds)
    }
    await db().from("direct_role_assignments").delete().eq("scope", "org").eq("org_id", orgId).eq("profile_id", member.profile_id)
    await db().from("organization_members").delete().eq("id", memberId) // cascades org_member_roles

    await writeAudit({
      entityType: "organization_member", entityId: memberId, action: "member_invite_revoked",
      newValue: {}, performedBy: actorId, orgId, actingAs: await resolveActingAs(actorId, orgId),
    })
    res.json({ data: { memberId } })
  } catch (err: any) {
    console.error("[org-members/revoke]", err.message)
    res.status(500).json({ error: "Failed to revoke invitation" })
  }
})

// POST /api/org-members/resend — re-send the invite email for a still-
// pending member (a new signed link, in case the original expired or was
// lost -- Supabase's invite token itself carries its own expiry).
router.post("/resend", requireAuth, requireOrg, async (req: Request, res: Response) => {
  try {
    const { memberId } = req.body as { memberId?: string }
    const { orgId } = req as OrgScopedRequest
    const actorId = (req as AuthenticatedRequest).user.id
    if (!memberId) return res.status(400).json({ error: "memberId is required" })
    if (!(await isOrgAdmin(actorId, orgId))) {
      return res.status(403).json({ error: "Only an organization Admin can resend invitations" })
    }

    const { data: member, error: memberError } = await db()
      .from("organization_members")
      .select("id, status, profile:profile_id(email, full_name)")
      .eq("id", memberId).eq("org_id", orgId).maybeSingle()
    if (memberError) throw memberError
    if (!member) return res.status(404).json({ error: "Member not found in this organization" })
    if (member.status !== "invited") return res.status(400).json({ error: "Only a pending invitation can be resent" })

    const { data: org } = await db().from("organizations").select("name").eq("id", orgId).single()

    const { data: relinked, error: linkError } = await db().auth.admin.generateLink({
      type: "invite",
      email: member.profile.email,
      options: {
        redirectTo: `${process.env.FRONTEND_URL}/accept-invite`,
        data: { full_name: member.profile.full_name, role: "admin" },
      },
    })
    if (linkError) throw linkError
    await sendEmail({
      to: member.profile.email,
      subject: `Reminder: you've been invited to join ${org.name} on CogniVend`,
      html: inviteHtml({ fullName: member.profile.full_name, entityName: org.name, entityLabel: "a team member", inviteLink: relinked.properties.action_link }),
    })

    await writeAudit({
      entityType: "organization_member", entityId: memberId, action: "member_invite_resent",
      newValue: {}, performedBy: actorId, orgId, actingAs: await resolveActingAs(actorId, orgId),
    })
    res.json({ data: { memberId, resent: true } })
  } catch (err: any) {
    console.error("[org-members/resend]", err.message)
    res.status(500).json({ error: "Failed to resend invitation" })
  }
})

// POST /api/org-members/restrictions/list — {memberId}. Returns this
// member's currently-effective permissions (derived from their assigned
// roles, same org_member_roles join /list already uses) alongside any
// existing subtractive restrictions -- the Admin picks which of the
// person's OWN current permissions to restrict; this is never a grant
// surface (Section 4 of the RBAC spec: restrictions can only narrow the
// baseline, never extend it).
router.post("/restrictions/list", requireAuth, requireOrg, async (req: Request, res: Response) => {
  try {
    const { memberId } = req.body as { memberId?: string }
    const { orgId } = req as OrgScopedRequest
    const actorId = (req as AuthenticatedRequest).user.id
    if (!memberId) return res.status(400).json({ error: "memberId is required" })
    if (!(await isOrgAdmin(actorId, orgId))) {
      return res.status(403).json({ error: "Only an organization Admin can view or set restrictions" })
    }

    const { data: member, error: memberError } = await db()
      .from("organization_members").select("id, profile_id").eq("id", memberId).eq("org_id", orgId).maybeSingle()
    if (memberError) throw memberError
    if (!member) return res.status(404).json({ error: "Member not found in this organization" })

    const { data: roleRows, error: roleError } = await db()
      .from("org_member_roles").select("role_id").eq("org_member_id", memberId)
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
      .eq("scope", "org").eq("org_id", orgId).eq("profile_id", member.profile_id)
    if (restrictionError) throw restrictionError

    res.json({ data: { effectivePermissions, restrictions: restrictions ?? [] } })
  } catch (err: any) {
    console.error("[org-members/restrictions/list]", err.message)
    res.status(500).json({ error: "Failed to load restrictions" })
  }
})

// POST /api/org-members/restrictions/set — {memberId, permissionId, restricted, reason?}
router.post("/restrictions/set", requireAuth, requireOrg, async (req: Request, res: Response) => {
  try {
    const { memberId, permissionId, restricted, reason } = req.body as {
      memberId?: string; permissionId?: string; restricted?: boolean; reason?: string
    }
    const { orgId } = req as OrgScopedRequest
    const actorId = (req as AuthenticatedRequest).user.id
    if (!memberId || !permissionId || typeof restricted !== "boolean") {
      return res.status(400).json({ error: "memberId, permissionId, and restricted are required" })
    }
    if (!(await isOrgAdmin(actorId, orgId))) {
      return res.status(403).json({ error: "Only an organization Admin can set restrictions" })
    }

    const { data: member, error: memberError } = await db()
      .from("organization_members").select("id, profile_id").eq("id", memberId).eq("org_id", orgId).maybeSingle()
    if (memberError) throw memberError
    if (!member) return res.status(404).json({ error: "Member not found in this organization" })

    if (restricted) {
      const { data: existing } = await db()
        .from("user_permission_restrictions")
        .select("id").eq("scope", "org").eq("org_id", orgId).eq("profile_id", member.profile_id).eq("permission_id", permissionId).maybeSingle()
      if (!existing) {
        const { error } = await db().from("user_permission_restrictions").insert({
          scope: "org", org_id: orgId, profile_id: member.profile_id, permission_id: permissionId,
          reason: reason || null, set_by: actorId,
        })
        if (error) throw error
      }
    } else {
      const { error } = await db()
        .from("user_permission_restrictions")
        .delete().eq("scope", "org").eq("org_id", orgId).eq("profile_id", member.profile_id).eq("permission_id", permissionId)
      if (error) throw error
    }

    await writeAudit({
      entityType: "organization_member", entityId: memberId,
      action: restricted ? "permission_restriction_added" : "permission_restriction_removed",
      newValue: { permission_id: permissionId, reason: reason || null },
      performedBy: actorId, orgId, actingAs: await resolveActingAs(actorId, orgId),
    })
    res.json({ data: { memberId, permissionId, restricted } })
  } catch (err: any) {
    console.error("[org-members/restrictions/set]", err.message)
    res.status(500).json({ error: err.message || "Failed to update restriction" })
  }
})

// POST /api/org-members/roles/delegate — {memberId, roleId, validUntil, reason?}
// Grants a role the person does NOT already hold, expiring at validUntil.
// org_member_roles' primary key is (org_member_id, role_id) -- a person can
// only have one row per role, so this only applies to a role they don't
// already hold; extending/modifying an existing permanent grant is what
// /update-roles is for, not this endpoint.
router.post("/roles/delegate", requireAuth, requireOrg, async (req: Request, res: Response) => {
  try {
    const { memberId, roleId, validUntil, reason } = req.body as {
      memberId?: string; roleId?: string; validUntil?: string; reason?: string
    }
    const { orgId } = req as OrgScopedRequest
    const actorId = (req as AuthenticatedRequest).user.id
    if (!memberId || !roleId || !validUntil) {
      return res.status(400).json({ error: "memberId, roleId, and validUntil are required" })
    }
    if (new Date(validUntil).getTime() <= Date.now()) {
      return res.status(400).json({ error: "validUntil must be in the future" })
    }
    if (!(await isOrgAdmin(actorId, orgId))) {
      return res.status(403).json({ error: "Only an organization Admin can delegate temporary access" })
    }

    const { data: member } = await db().from("organization_members").select("id").eq("id", memberId).eq("org_id", orgId).maybeSingle()
    if (!member) return res.status(404).json({ error: "Member not found in this organization" })

    const { data: existing } = await db().from("org_member_roles").select("org_member_id").eq("org_member_id", memberId).eq("role_id", roleId).maybeSingle()
    if (existing) {
      return res.status(400).json({ error: "This member already holds this role — edit their roles directly instead of delegating it" })
    }

    const { error } = await db().from("org_member_roles").insert({
      org_member_id: memberId, role_id: roleId, valid_from: new Date().toISOString(), valid_until: validUntil,
    })
    if (error) throw error

    await writeAudit({
      entityType: "organization_member", entityId: memberId, action: "role_delegated",
      newValue: { role_id: roleId, valid_until: validUntil, reason: reason || null },
      performedBy: actorId, orgId, actingAs: await resolveActingAs(actorId, orgId),
    })
    res.status(201).json({ data: { memberId, roleId, validUntil } })
  } catch (err: any) {
    console.error("[org-members/roles/delegate]", err.message)
    res.status(500).json({ error: err.message || "Failed to delegate role" })
  }
})

// POST /api/org-members/roles/revoke-delegation — {memberId, roleId}. Early
// revocation before expiry -- only ever removes a row that actually has a
// valid_until set, never a permanent role assignment.
router.post("/roles/revoke-delegation", requireAuth, requireOrg, async (req: Request, res: Response) => {
  try {
    const { memberId, roleId } = req.body as { memberId?: string; roleId?: string }
    const { orgId } = req as OrgScopedRequest
    const actorId = (req as AuthenticatedRequest).user.id
    if (!memberId || !roleId) return res.status(400).json({ error: "memberId and roleId are required" })
    if (!(await isOrgAdmin(actorId, orgId))) {
      return res.status(403).json({ error: "Only an organization Admin can revoke delegated access" })
    }

    const { data: member } = await db().from("organization_members").select("id").eq("id", memberId).eq("org_id", orgId).maybeSingle()
    if (!member) return res.status(404).json({ error: "Member not found in this organization" })

    const { error } = await db()
      .from("org_member_roles").delete().eq("org_member_id", memberId).eq("role_id", roleId).not("valid_until", "is", null)
    if (error) throw error

    await writeAudit({
      entityType: "organization_member", entityId: memberId, action: "role_delegation_revoked",
      newValue: { role_id: roleId }, performedBy: actorId, orgId, actingAs: await resolveActingAs(actorId, orgId),
    })
    res.json({ data: { memberId, roleId } })
  } catch (err: any) {
    console.error("[org-members/roles/revoke-delegation]", err.message)
    res.status(500).json({ error: err.message || "Failed to revoke delegated access" })
  }
})

// POST /api/org-members/roles/delegations-list — {memberId}. Currently
// active or future-dated delegated (valid_until IS NOT NULL) role
// assignments for this member.
router.post("/roles/delegations-list", requireAuth, requireOrg, async (req: Request, res: Response) => {
  try {
    const { memberId } = req.body as { memberId?: string }
    const { orgId } = req as OrgScopedRequest
    if (!memberId) return res.status(400).json({ error: "memberId is required" })

    const { data: member } = await db().from("organization_members").select("id").eq("id", memberId).eq("org_id", orgId).maybeSingle()
    if (!member) return res.status(404).json({ error: "Member not found in this organization" })

    const { data, error } = await db()
      .from("org_member_roles")
      .select("role:role_id(id, name), valid_from, valid_until")
      .eq("org_member_id", memberId)
      .not("valid_until", "is", null)
      .order("valid_until")
    if (error) throw error

    res.json({ data })
  } catch (err: any) {
    console.error("[org-members/roles/delegations-list]", err.message)
    res.status(500).json({ error: "Failed to load delegated access" })
  }
})

// POST /api/org-members/legal-entity-scope/options — every Legal Entity
// belonging to a vendor this org has an active relationship with, the
// source list for the scope picker (mirrors VendorTeam's client-org
// multi-select for Associates).
router.post("/legal-entity-scope/options", requireAuth, requireOrg, async (req: Request, res: Response) => {
  try {
    const { orgId } = req as OrgScopedRequest
    const { data: links, error: linkError } = await db()
      .from("organization_vendors").select("vendor_id").eq("org_id", orgId)
    if (linkError) throw linkError
    const vendorIds = [...new Set((links ?? []).map((l: any) => l.vendor_id))]
    if (vendorIds.length === 0) return res.json({ data: [] })

    const { data, error } = await db()
      .from("legal_entities")
      .select("id, legal_name, registered_country, is_default, vendor:vendor_id(company_name)")
      .in("vendor_id", vendorIds)
      .order("registered_country")
    if (error) throw error

    res.json({
      data: (data ?? []).map((e: any) => ({
        id: e.id,
        label: `${e.vendor.company_name} — ${e.legal_name || e.registered_country}${e.is_default ? "" : ` (${e.registered_country})`}`,
      })),
    })
  } catch (err: any) {
    console.error("[org-members/legal-entity-scope/options]", err.message)
    res.status(500).json({ error: "Failed to load legal entities" })
  }
})

// POST /api/org-members/legal-entity-scope/list — {memberId}
router.post("/legal-entity-scope/list", requireAuth, requireOrg, async (req: Request, res: Response) => {
  try {
    const { memberId } = req.body as { memberId?: string }
    const { orgId } = req as OrgScopedRequest
    if (!memberId) return res.status(400).json({ error: "memberId is required" })

    const { data: member } = await db().from("organization_members").select("id").eq("id", memberId).eq("org_id", orgId).maybeSingle()
    if (!member) return res.status(404).json({ error: "Member not found in this organization" })

    const { data, error } = await db()
      .from("org_member_legal_entity_scope").select("legal_entity_id").eq("org_member_id", memberId)
    if (error) throw error
    res.json({ data: (data ?? []).map((r: any) => r.legal_entity_id) })
  } catch (err: any) {
    console.error("[org-members/legal-entity-scope/list]", err.message)
    res.status(500).json({ error: "Failed to load legal entity scope" })
  }
})

// POST /api/org-members/legal-entity-scope/set — {memberId, legalEntityIds}
// Full replace -- an empty array means "restricted to nothing" (deliberate,
// distinct from never having set a scope at all, which means unrestricted).
router.post("/legal-entity-scope/set", requireAuth, requireOrg, async (req: Request, res: Response) => {
  try {
    const { memberId, legalEntityIds } = req.body as { memberId?: string; legalEntityIds?: string[] }
    const { orgId } = req as OrgScopedRequest
    const actorId = (req as AuthenticatedRequest).user.id
    if (!memberId || !Array.isArray(legalEntityIds)) {
      return res.status(400).json({ error: "memberId and legalEntityIds are required" })
    }
    if (!(await isOrgAdmin(actorId, orgId))) {
      return res.status(403).json({ error: "Only an organization Admin can set legal entity scope" })
    }

    const { data: member } = await db().from("organization_members").select("id").eq("id", memberId).eq("org_id", orgId).maybeSingle()
    if (!member) return res.status(404).json({ error: "Member not found in this organization" })

    const { error: deleteError } = await db().from("org_member_legal_entity_scope").delete().eq("org_member_id", memberId)
    if (deleteError) throw deleteError

    if (legalEntityIds.length > 0) {
      const { error: insertError } = await db()
        .from("org_member_legal_entity_scope")
        .insert(legalEntityIds.map((legalEntityId) => ({ org_member_id: memberId, legal_entity_id: legalEntityId })))
      if (insertError) throw insertError
    }

    await writeAudit({
      entityType: "organization_member", entityId: memberId, action: "legal_entity_scope_updated",
      newValue: { legal_entity_ids: legalEntityIds }, performedBy: actorId, orgId, actingAs: await resolveActingAs(actorId, orgId),
    })
    res.json({ data: { memberId, legalEntityIds } })
  } catch (err: any) {
    console.error("[org-members/legal-entity-scope/set]", err.message)
    res.status(500).json({ error: err.message || "Failed to update legal entity scope" })
  }
})

// POST /api/org-members/approval-policy/list — every org-scope role
// (system + this org's own custom roles) with its current threshold, if
// any has been explicitly configured. NULL threshold_amount in the response
// distinguishes "no policy row at all" (unlimited by default, today's
// unchanged behavior) from an explicit "unlimited" choice -- both render
// the same in the UI (blank field), but only an Admin actively saving a
// number creates a row.
router.post("/approval-policy/list", requireAuth, requireOrg, async (req: Request, res: Response) => {
  try {
    const { orgId } = req as OrgScopedRequest
    const { data: roles, error: rolesError } = await db()
      .from("roles")
      .select("id, name")
      .eq("scope", "org")
      .neq("name", "Admin")
      .or(`is_system.eq.true,owner_org_id.eq.${orgId}`)
      .order("name")
    if (rolesError) throw rolesError

    const { data: policies, error: policiesError } = await db()
      .from("approval_policies").select("role_id, threshold_amount").eq("org_id", orgId)
    if (policiesError) throw policiesError
    const thresholdByRole = new Map((policies ?? []).map((p: any) => [p.role_id, p.threshold_amount]))

    res.json({
      data: (roles ?? []).map((r: any) => ({
        roleId: r.id, roleName: r.name,
        thresholdAmount: thresholdByRole.has(r.id) ? thresholdByRole.get(r.id) : null,
        configured: thresholdByRole.has(r.id),
      })),
    })
  } catch (err: any) {
    console.error("[org-members/approval-policy/list]", err.message)
    res.status(500).json({ error: "Failed to load approval policy" })
  }
})

// POST /api/org-members/approval-policy/set — {roleId, thresholdAmount}.
// thresholdAmount: null means "explicitly unlimited" (still creates a row,
// distinct from never having configured this role at all); omit the row
// entirely by calling with clear=true to revert to the unconfigured default.
router.post("/approval-policy/set", requireAuth, requireOrg, async (req: Request, res: Response) => {
  try {
    const { roleId, thresholdAmount, clear } = req.body as { roleId?: string; thresholdAmount?: number | null; clear?: boolean }
    const { orgId } = req as OrgScopedRequest
    const actorId = (req as AuthenticatedRequest).user.id
    if (!roleId) return res.status(400).json({ error: "roleId is required" })
    if (!(await isOrgAdmin(actorId, orgId))) {
      return res.status(403).json({ error: "Only an organization Admin can set approval thresholds" })
    }

    if (clear) {
      const { error } = await db().from("approval_policies").delete().eq("org_id", orgId).eq("role_id", roleId)
      if (error) throw error
    } else {
      const { data: existing } = await db().from("approval_policies").select("id").eq("org_id", orgId).eq("role_id", roleId).maybeSingle()
      if (existing) {
        const { error } = await db().from("approval_policies")
          .update({ threshold_amount: thresholdAmount ?? null, set_by: actorId, set_at: new Date().toISOString() })
          .eq("id", existing.id)
        if (error) throw error
      } else {
        const { error } = await db().from("approval_policies").insert({
          org_id: orgId, role_id: roleId, threshold_amount: thresholdAmount ?? null, set_by: actorId,
        })
        if (error) throw error
      }
    }

    await writeAudit({
      entityType: "approval_policy", entityId: roleId, action: clear ? "approval_policy_cleared" : "approval_policy_set",
      newValue: { threshold_amount: thresholdAmount ?? null }, performedBy: actorId, orgId, actingAs: await resolveActingAs(actorId, orgId),
    })
    res.json({ data: { roleId, thresholdAmount: clear ? null : (thresholdAmount ?? null) } })
  } catch (err: any) {
    console.error("[org-members/approval-policy/set]", err.message)
    res.status(500).json({ error: err.message || "Failed to update approval policy" })
  }
})

// POST /api/org-members/match-tolerance/get — this org's 3-way match
// tolerance, if configured. No row means today's unchanged zero-tolerance
// default (perform_three_way_match, migration 073).
router.post("/match-tolerance/get", requireAuth, requireOrg, async (req: Request, res: Response) => {
  try {
    const { orgId } = req as OrgScopedRequest
    const { data, error } = await db()
      .from("match_tolerance_settings")
      .select("tolerance_type, tolerance_value")
      .eq("org_id", orgId)
      .maybeSingle()
    if (error) throw error
    res.json({
      data: data ?? { tolerance_type: "amount", tolerance_value: 0 },
      configured: !!data,
    })
  } catch (err: any) {
    console.error("[org-members/match-tolerance/get]", err.message)
    res.status(500).json({ error: "Failed to load match tolerance" })
  }
})

// POST /api/org-members/match-tolerance/set — {toleranceType, toleranceValue}.
router.post("/match-tolerance/set", requireAuth, requireOrg, async (req: Request, res: Response) => {
  try {
    const { toleranceType, toleranceValue } = req.body as { toleranceType?: string; toleranceValue?: number }
    const { orgId } = req as OrgScopedRequest
    const actorId = (req as AuthenticatedRequest).user.id
    if (!toleranceType || !["amount", "percentage"].includes(toleranceType)) {
      return res.status(400).json({ error: "toleranceType must be 'amount' or 'percentage'" })
    }
    if (toleranceValue === undefined || toleranceValue === null || Number(toleranceValue) < 0) {
      return res.status(400).json({ error: "toleranceValue must be >= 0" })
    }
    if (!(await isOrgAdmin(actorId, orgId))) {
      return res.status(403).json({ error: "Only an organization Admin can set the match tolerance" })
    }

    const { data: existing } = await db().from("match_tolerance_settings").select("id").eq("org_id", orgId).maybeSingle()
    if (existing) {
      const { error } = await db().from("match_tolerance_settings")
        .update({ tolerance_type: toleranceType, tolerance_value: toleranceValue, set_by: actorId, set_at: new Date().toISOString() })
        .eq("id", existing.id)
      if (error) throw error
    } else {
      const { error } = await db().from("match_tolerance_settings").insert({
        org_id: orgId, tolerance_type: toleranceType, tolerance_value: toleranceValue, set_by: actorId,
      })
      if (error) throw error
    }

    await writeAudit({
      entityType: "match_tolerance_settings", entityId: orgId, action: "match_tolerance_set",
      newValue: { tolerance_type: toleranceType, tolerance_value: toleranceValue },
      performedBy: actorId, orgId, actingAs: await resolveActingAs(actorId, orgId),
    })
    res.json({ data: { tolerance_type: toleranceType, tolerance_value: toleranceValue } })
  } catch (err: any) {
    console.error("[org-members/match-tolerance/set]", err.message)
    res.status(500).json({ error: err.message || "Failed to update match tolerance" })
  }
})

// POST /api/org-members/contract-approval-thresholds/get — this org's Stage 7
// value-tier thresholds, if configured. No row means the default 500k/2M
// tiers (contractApprovals.ts's resolveTier).
router.post("/contract-approval-thresholds/get", requireAuth, requireOrg, async (req: Request, res: Response) => {
  try {
    const { orgId } = req as OrgScopedRequest
    const { data, error } = await db()
      .from("contract_approval_thresholds")
      .select("medium_threshold, high_threshold")
      .eq("org_id", orgId)
      .maybeSingle()
    if (error) throw error
    res.json({
      data: data ?? { medium_threshold: 500000, high_threshold: 2000000 },
      configured: !!data,
    })
  } catch (err: any) {
    console.error("[org-members/contract-approval-thresholds/get]", err.message)
    res.status(500).json({ error: "Failed to load contract approval thresholds" })
  }
})

// POST /api/org-members/contract-approval-thresholds/set — {mediumThreshold, highThreshold}.
router.post("/contract-approval-thresholds/set", requireAuth, requireOrg, async (req: Request, res: Response) => {
  try {
    const { mediumThreshold, highThreshold } = req.body as { mediumThreshold?: number; highThreshold?: number }
    const { orgId } = req as OrgScopedRequest
    const actorId = (req as AuthenticatedRequest).user.id
    if (mediumThreshold === undefined || mediumThreshold === null || Number(mediumThreshold) < 0) {
      return res.status(400).json({ error: "mediumThreshold must be >= 0" })
    }
    if (highThreshold === undefined || highThreshold === null || Number(highThreshold) < Number(mediumThreshold)) {
      return res.status(400).json({ error: "highThreshold must be >= mediumThreshold" })
    }
    if (!(await isOrgAdmin(actorId, orgId))) {
      return res.status(403).json({ error: "Only an organization Admin can set the contract approval thresholds" })
    }

    const { data: existing } = await db().from("contract_approval_thresholds").select("id").eq("org_id", orgId).maybeSingle()
    if (existing) {
      const { error } = await db().from("contract_approval_thresholds")
        .update({ medium_threshold: mediumThreshold, high_threshold: highThreshold, set_by: actorId, set_at: new Date().toISOString() })
        .eq("id", existing.id)
      if (error) throw error
    } else {
      const { error } = await db().from("contract_approval_thresholds").insert({
        org_id: orgId, medium_threshold: mediumThreshold, high_threshold: highThreshold, set_by: actorId,
      })
      if (error) throw error
    }

    await writeAudit({
      entityType: "contract_approval_thresholds", entityId: orgId, action: "contract_approval_thresholds_set",
      newValue: { medium_threshold: mediumThreshold, high_threshold: highThreshold },
      performedBy: actorId, orgId, actingAs: await resolveActingAs(actorId, orgId),
    })
    res.json({ data: { medium_threshold: mediumThreshold, high_threshold: highThreshold } })
  } catch (err: any) {
    console.error("[org-members/contract-approval-thresholds/set]", err.message)
    res.status(500).json({ error: err.message || "Failed to update contract approval thresholds" })
  }
})

export default router
