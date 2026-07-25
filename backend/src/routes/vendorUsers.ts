import { Router, Request, Response } from "express"
import { getSupabaseAdmin } from "../utils/supabaseAdmin"
import { requireAuth, AuthenticatedRequest } from "../middleware/auth"
import { resolveVendorId } from "../middleware/org"
import { writeAudit } from "../services/audit"

const router = Router()
function db(): any { return getSupabaseAdmin() }

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

async function requireVendorManagePermission(userId: string, vendorId: string): Promise<boolean> {
  const { data } = await db().rpc("has_vendor_permission_as", {
    p_user_id: userId,
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
      .select("id, status, is_primary, profile:profile_id(id, full_name, email)")
      .eq("vendor_id", vendorId)
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

    const data = (users ?? []).map((u: any) => ({
      id: u.id,
      status: u.status,
      isPrimary: u.is_primary,
      profile: u.profile,
      roleNames: roleNamesByUser.get(u.id) ?? [],
    }))
    res.json({ data })
  } catch (err: any) {
    console.error("[vendor-users/list]", err.message)
    res.status(500).json({ error: "Failed to list vendor staff" })
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

router.post("/assignable-roles", requireAuth, async (_req: Request, res: Response) => {
  try {
    // Admin is excluded -- it's the vendor's own account owner, established
    // at signup, not a role assigned to invited staff or reassigned here.
    const { data, error } = await db().from("roles").select("id, name, description").eq("scope", "vendor").neq("name", "Admin").order("name")
    if (error) throw error
    res.json({ data: { roles: data } })
  } catch (err: any) {
    console.error("[vendor-users/assignable-roles]", err.message)
    res.status(500).json({ error: "Failed to load assignable roles" })
  }
})

// POST /api/vendor-users/invite — Admin/Manager (vendor_users.manage) only.
router.post("/invite", requireAuth, async (req: Request, res: Response) => {
  const { email, fullName, roleIds } = req.body as { email?: string; fullName?: string; roleIds?: string[] }
  const actorId = (req as AuthenticatedRequest).user.id

  if (!email?.trim() || !fullName?.trim() || !Array.isArray(roleIds) || roleIds.length === 0) {
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
      const { data: invited, error: inviteError } = await db().auth.admin.inviteUserByEmail(normalizedEmail, {
        redirectTo: `${process.env.FRONTEND_URL}/accept-invite`,
        data: { full_name: fullName.trim(), role: "vendor" },
      })
      if (inviteError) throw inviteError
      createdNewAuthUser = true
      profileId = invited.user.id
      inviteSent = true
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
      .insert(roleIds.map((roleId) => ({ vendor_user_id: vendorUserId, role_id: roleId })))
    if (rolesError) throw rolesError

    await writeAudit({
      entityType: "vendor_user",
      entityId: vendorUserId!,
      action: "vendor_user_invited",
      newValue: { email: normalizedEmail, full_name: fullName.trim(), role_ids: roleIds, invite_sent: inviteSent },
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
    const { vendorUserId, roleIds } = req.body as { vendorUserId?: string; roleIds?: string[] }
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
      .select("id")
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

    const { data, error } = await db()
      .from("vendor_user_assignments")
      .select("organization_id")
      .eq("vendor_id", vendorId)
      .eq("user_id", targetUserId)
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

    const dedupedOrgIds = [...new Set(organizationIds)]

    const { error: deleteError } = await db()
      .from("vendor_user_assignments")
      .delete()
      .eq("vendor_id", vendorId)
      .eq("user_id", targetUserId)
    if (deleteError) throw deleteError

    if (dedupedOrgIds.length > 0) {
      const { error: insertError } = await db()
        .from("vendor_user_assignments")
        .insert(dedupedOrgIds.map((organizationId) => ({ vendor_id: vendorId, user_id: targetUserId, organization_id: organizationId })))
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

export default router
