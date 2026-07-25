import { Router, Request, Response } from "express"
import { getSupabaseAdmin } from "../utils/supabaseAdmin"
import { requireAuth, AuthenticatedRequest } from "../middleware/auth"

const router = Router()
function db(): any { return getSupabaseAdmin() }

// POST /api/organizations/my — orgs the caller is a member of, with their
// resolved role names, permission keys, and org config. Vendors aren't
// organization_members rows (they relate to orgs via organization_vendors
// instead), so this always returns [] for them.
//
// org_role is gone (RBAC bundle cutover) -- role/permission resolution now
// goes through org_member_roles -> role_permissions -> permissions. Uses two
// single-hop embeds rather than one 3-level-nested embed, matching the
// depth already proven elsewhere in this codebase (e.g. the organization:
// org_id(...) embed just below) rather than an untested deeper nesting.
router.post("/my", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req as AuthenticatedRequest).user?.id
    if (!userId) return res.status(401).json({ error: "Not authenticated" })

    const { data, error } = await db()
      .from("organization_members")
      .select("id, is_primary, organization:org_id(id, name, slug, status, role_mode, approval_threshold)")
      .eq("profile_id", userId)

    if (error) throw error

    // Suspended/archived orgs are excluded entirely -- they shouldn't be
    // selectable in the org switcher at all, not just blocked at request time.
    const activeRows = (data ?? []).filter((row: any) => row.organization && row.organization.status === "active")
    const memberIds = activeRows.map((row: any) => row.id)

    const roleNamesByMember = new Map<string, string[]>()
    const permissionKeysByMember = new Map<string, Set<string>>()

    if (memberIds.length > 0) {
      const { data: memberRoles, error: mrError } = await db()
        .from("org_member_roles")
        .select("org_member_id, role_id, role:role_id(name)")
        .in("org_member_id", memberIds)
      if (mrError) throw mrError

      const roleIds = [...new Set((memberRoles ?? []).map((row: any) => row.role_id))]
      let permissionKeysByRole = new Map<string, string[]>()
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

    const orgs = activeRows.map((row: any) => ({
      id: row.organization.id,
      name: row.organization.name,
      slug: row.organization.slug,
      isPrimary: row.is_primary,
      roleNames: roleNamesByMember.get(row.id) ?? [],
      permissions: Array.from(permissionKeysByMember.get(row.id) ?? []),
      roleMode: row.organization.role_mode,
      approvalThreshold: row.organization.approval_threshold,
    }))

    res.json({ data: orgs })
  } catch (err: any) {
    console.error("[organizations/my]", err.message)
    res.status(500).json({ error: "Failed to list organizations" })
  }
})

// POST /api/organizations/search — lets a vendor look up an active
// organisation by name to request a relationship with it (VendorProfile.tsx's
// "Add Organisation"). Deliberately minimal fields (id/name/slug only) --
// no financial/internal data -- and active orgs only, same as the org
// switcher's own filtering.
router.post("/search", requireAuth, async (req: Request, res: Response) => {
  try {
    const { query } = req.body as { query?: string }
    if (!query?.trim() || query.trim().length < 2) {
      return res.json({ data: [] })
    }

    const { data, error } = await db()
      .from("organizations")
      .select("id, name, slug")
      .eq("status", "active")
      .ilike("name", `%${query.trim()}%`)
      .order("name", { ascending: true })
      .limit(10)
    if (error) throw error

    res.json({ data: data ?? [] })
  } catch (err: any) {
    console.error("[organizations/search]", err.message)
    res.status(500).json({ error: "Failed to search organizations" })
  }
})

// POST /api/organizations/lookup-code — exact-match lookup by org_code, used
// by vendor onboarding (Step1CompanyInfo's Org Code field) and the "Add
// Organisation" dialog's code-entry path to resolve a specific org before
// requesting a relationship with it. Same minimal-fields, active-only shape
// as /search.
router.post("/lookup-code", requireAuth, async (req: Request, res: Response) => {
  try {
    const { code } = req.body as { code?: string }
    if (!code?.trim()) return res.json({ data: null })

    const { data, error } = await db()
      .from("organizations")
      .select("id, name, slug")
      .eq("status", "active")
      .eq("org_code", code.trim().toUpperCase())
      .maybeSingle()
    if (error) throw error

    res.json({ data: data ?? null })
  } catch (err: any) {
    console.error("[organizations/lookup-code]", err.message)
    res.status(500).json({ error: "Failed to look up organisation code" })
  }
})

export default router
