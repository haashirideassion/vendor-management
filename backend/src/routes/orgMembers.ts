import { Router, Request, Response } from "express"
import { getSupabaseAdmin } from "../utils/supabaseAdmin"
import { requireAuth, AuthenticatedRequest } from "../middleware/auth"
import { requireOrg, OrgScopedRequest } from "../middleware/org"
import { writeAudit, resolveActingAs } from "../services/audit"

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
// resolved role names.
router.post("/list", requireAuth, requireOrg, async (req: Request, res: Response) => {
  try {
    const { orgId } = req as OrgScopedRequest
    const { data: members, error } = await db()
      .from("organization_members")
      .select("id, status, is_primary, profile:profile_id(id, full_name, email)")
      .eq("org_id", orgId)
    if (error) throw error

    const memberIds = (members ?? []).map((m: any) => m.id)
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

    const data = (members ?? []).map((m: any) => ({
      id: m.id,
      status: m.status,
      isPrimary: m.is_primary,
      profile: m.profile,
      roleNames: roleNamesByMember.get(m.id) ?? [],
    }))
    res.json({ data })
  } catch (err: any) {
    console.error("[org-members/list]", err.message)
    res.status(500).json({ error: "Failed to list organization members" })
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
    // reassigned here.
    const { data: roles, error } = await db().from("roles").select("id, name, description").eq("scope", "org").neq("name", "Admin").order("name")
    if (error) throw error

    res.json({ data: { roleMode: org.role_mode, roles } })
  } catch (err: any) {
    console.error("[org-members/assignable-roles]", err.message)
    res.status(500).json({ error: "Failed to load assignable roles" })
  }
})

// POST /api/org-members/invite — the first invite path for an ALREADY-
// EXISTING org (distinct from superadmin's create-with-admin, which creates
// an org and its first admin together). Solo-mode orgs get the full union of
// all three org-scope roles regardless of what's requested; tiered orgs use
// the roleIds provided.
router.post("/invite", requireAuth, requireOrg, async (req: Request, res: Response) => {
  const { email, fullName, roleIds } = req.body as { email?: string; fullName?: string; roleIds?: string[] }
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
    const { data: org, error: orgError } = await db().from("organizations").select("role_mode").eq("id", orgId).single()
    if (orgError) throw orgError

    let finalRoleIds = roleIds ?? []
    if (org.role_mode === "solo") {
      const { data: allOrgRoles, error: rolesError } = await db().from("roles").select("id").eq("scope", "org")
      if (rolesError) throw rolesError
      finalRoleIds = (allOrgRoles ?? []).map((r: any) => r.id)
    }
    if (finalRoleIds.length === 0) {
      return res.status(400).json({ error: "At least one role must be assigned" })
    }

    const { data: existingProfile } = await db().from("profiles").select("id").eq("email", normalizedEmail).maybeSingle()

    let inviteSent = false
    if (existingProfile) {
      profileId = existingProfile.id
    } else {
      const { data: invited, error: inviteError } = await db().auth.admin.inviteUserByEmail(normalizedEmail, {
        redirectTo: `${process.env.FRONTEND_URL}/accept-invite`,
        data: { full_name: fullName.trim(), role: "admin" },
      })
      if (inviteError) throw inviteError
      createdNewAuthUser = true
      profileId = invited.user.id
      inviteSent = true
      // No manual profiles insert here -- on_auth_user_created fires
      // synchronously and creates the row (same pattern as
      // superadmin.ts's create-with-admin).
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
    const { memberId, roleIds } = req.body as { memberId?: string; roleIds?: string[] }
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
      .select("id")
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

export default router
