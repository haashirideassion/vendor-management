import { Router, Request, Response } from "express"
import { getSupabaseAdmin } from "../utils/supabaseAdmin"
import { requireAuth, AuthenticatedRequest } from "../middleware/auth"
import { removeOrgFromGroup, ServiceError } from "../services/groups"
import { writeAudit } from "../services/audit"

const router = Router()
function db(): any { return getSupabaseAdmin() }

// In-context (non-superadmin) group management: a group_admin managing a
// group they're either directly granted on, or reachable via an ancestor
// group -- mirrors the same ancestor-walk reach used for org access
// (is_group_admin_for_org_as), so a top-level group admin can manage every
// group in their tree, not just the one they were granted on directly.
async function canManageGroup(userId: string, groupId: string): Promise<boolean> {
  const { data, error } = await db().rpc("is_group_admin_for_group_as", {
    p_user_id: userId,
    p_group_id: groupId,
  })
  if (error) throw error
  return !!data
}

// POST /api/groups/lookup-code — exact-match lookup by group code, used by
// vendor onboarding (Step1CompanyInfo's Group Code field) and org onboarding
// (Step2Establishment's Group Code field for is_group_company). Open to any
// authenticated user, same as organizations/lookup-code -- minimal fields,
// active groups only.
router.post("/lookup-code", requireAuth, async (req: Request, res: Response) => {
  try {
    const { code } = req.body as { code?: string }
    if (!code?.trim()) return res.json({ data: null })

    const { data, error } = await db()
      .from("organization_groups")
      .select("id, name")
      .eq("status", "active")
      .eq("code", code.trim().toUpperCase())
      .maybeSingle()
    if (error) throw error

    res.json({ data: data ?? null })
  } catch (err: any) {
    console.error("[groups/lookup-code]", err.message)
    res.status(500).json({ error: "Failed to look up group code" })
  }
})

// POST /api/groups/overview
router.post("/overview", requireAuth, async (req: Request, res: Response) => {
  try {
    const { groupId } = req.body
    const userId = (req as AuthenticatedRequest).user.id
    if (!groupId) return res.status(400).json({ error: "groupId is required" })
    if (!(await canManageGroup(userId, groupId))) {
      return res.status(403).json({ error: "You are not a group admin of this group" })
    }

    const { data: group, error } = await db()
      .from("organization_groups")
      .select("id, name, parent_group_id, primary_org_id, status")
      .eq("id", groupId)
      .single()
    if (error) throw error

    const { data: memberships, error: memError } = await db()
      .from("group_organizations")
      .select("organization:organization_id(id, name, slug, status)")
      .eq("group_id", groupId)
      .is("effective_to", null)
      .eq("status", "active")
    if (memError) throw memError

    const { data: subGroups, error: sgError } = await db()
      .from("organization_groups")
      .select("id, name, status")
      .eq("parent_group_id", groupId)
      .eq("status", "active")
    if (sgError) throw sgError

    // Walk up parent_group_id for the breadcrumb trail (root-first). Group
    // trees are expected to be small/shallow (015_group_functions.sql), so a
    // simple loop mirrors the same non-recursive-CTE tradeoff made there.
    const ancestors: { id: string; name: string }[] = []
    let cursor = group.parent_group_id
    while (cursor) {
      const { data: parent, error: parentError } = await db()
        .from("organization_groups")
        .select("id, name, parent_group_id")
        .eq("id", cursor)
        .maybeSingle()
      if (parentError) throw parentError
      if (!parent) break
      ancestors.unshift({ id: parent.id, name: parent.name })
      cursor = parent.parent_group_id
    }

    res.json({
      data: {
        id: group.id,
        name: group.name,
        parentGroupId: group.parent_group_id,
        primaryOrgId: group.primary_org_id,
        status: group.status,
        ancestors,
        memberOrgs: (memberships ?? []).map((m: any) => m.organization),
        subGroups: subGroups ?? [],
      },
    })
  } catch (err: any) {
    console.error("[groups/overview]", err.message)
    res.status(500).json({ error: "Failed to load group overview" })
  }
})

// POST /api/groups/set-primary — in-context "Set as primary" action.
router.post("/set-primary", requireAuth, async (req: Request, res: Response) => {
  try {
    const { groupId, organizationId } = req.body
    const userId = (req as AuthenticatedRequest).user.id
    if (!groupId || !organizationId) return res.status(400).json({ error: "groupId and organizationId are required" })
    if (!(await canManageGroup(userId, groupId))) {
      return res.status(403).json({ error: "You are not a group admin of this group" })
    }

    const { error } = await db().from("organization_groups").update({ primary_org_id: organizationId }).eq("id", groupId)
    if (error) throw error

    await writeAudit({
      entityType: "organization_group",
      entityId: groupId,
      action: "group_primary_org_set",
      newValue: { organization_id: organizationId },
      performedBy: userId,
      orgId: organizationId,
    })

    res.json({ data: { groupId, organizationId } })
  } catch (err: any) {
    console.error("[groups/set-primary]", err.message)
    res.status(500).json({ error: err.message || "Failed to set primary organization" })
  }
})

// POST /api/groups/remove-org — in-context removal, same successor-required
// safeguard as the superadmin fallback (removeOrgFromGroup is shared).
router.post("/remove-org", requireAuth, async (req: Request, res: Response) => {
  try {
    const { groupId, organizationId, successorOrgId } = req.body
    const userId = (req as AuthenticatedRequest).user.id
    if (!groupId || !organizationId) return res.status(400).json({ error: "groupId and organizationId are required" })
    if (!(await canManageGroup(userId, groupId))) {
      return res.status(403).json({ error: "You are not a group admin of this group" })
    }

    await removeOrgFromGroup(groupId, organizationId, successorOrgId, userId)
    res.json({ data: { removed: true } })
  } catch (err: any) {
    if (err instanceof ServiceError) {
      return res.status(409).json({ error: err.message, code: err.code, details: err.details })
    }
    console.error("[groups/remove-org]", err.message)
    res.status(500).json({ error: err.message || "Failed to remove organization from group" })
  }
})

export default router
