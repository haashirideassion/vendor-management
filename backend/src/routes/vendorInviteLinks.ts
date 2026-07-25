import { Router, Request, Response } from "express"
import crypto from "crypto"
import { getSupabaseAdmin } from "../utils/supabaseAdmin"
import { requireAuth, AuthenticatedRequest } from "../middleware/auth"
import { requireOrg, OrgScopedRequest } from "../middleware/org"

const router = Router()
function db(): any { return getSupabaseAdmin() }

const EXPIRY_DAYS = 7

// POST /api/vendor-invite-links/create — an org (or group) admin generates a
// shareable signup link carrying their org_code or group_code as an opaque
// token, so a vendor who signs up via that link gets Step1CompanyInfo's
// org_code/group_code field prefilled and locked instead of typed by hand.
// Authorization mirrors /api/vendors/admin-onboard's own bar exactly: any
// active member of the caller's active org (requireOrg already resolves
// group_admin-reached orgs too), and for group scope, the same "active org
// is a current member of this group" check that route already uses.
router.post("/create", requireAuth, requireOrg, async (req: Request, res: Response) => {
  try {
    const { orgId } = req as OrgScopedRequest
    const actorId = (req as AuthenticatedRequest).user.id
    const { scope, groupId } = req.body as { scope?: "org" | "group"; groupId?: string }

    if (scope !== "org" && scope !== "group") {
      return res.status(400).json({ error: "scope must be 'org' or 'group'" })
    }
    if (scope === "group" && !groupId) {
      return res.status(400).json({ error: "groupId is required for scope 'group'" })
    }

    let targetOrgId: string | null = null
    let targetGroupId: string | null = null

    if (scope === "org") {
      targetOrgId = orgId
    } else {
      const { data: membership, error: memError } = await db()
        .from("group_organizations")
        .select("id")
        .eq("group_id", groupId)
        .eq("organization_id", orgId)
        .is("effective_to", null)
        .eq("status", "active")
        .maybeSingle()
      if (memError) throw memError
      if (!membership) {
        return res.status(400).json({ error: "The active organization is not a current member of the specified group" })
      }
      targetGroupId = groupId!
    }

    const token = crypto.randomBytes(24).toString("base64url")
    const expiresAt = new Date(Date.now() + EXPIRY_DAYS * 24 * 60 * 60 * 1000).toISOString()

    const { data, error } = await db()
      .from("vendor_invite_links")
      .insert({ token, org_id: targetOrgId, group_id: targetGroupId, created_by: actorId, expires_at: expiresAt })
      .select("token, expires_at")
      .single()
    if (error) throw error

    res.status(201).json({ data: { token: data.token, expiresAt: data.expires_at } })
  } catch (err: any) {
    console.error("[vendor-invite-links/create]", err.message)
    res.status(500).json({ error: err.message || "Failed to create invite link" })
  }
})

// POST /api/vendor-invite-links/resolve — looks up a token (from the
// onboarding wizard, after a vendor signs up via an invite link) and returns
// the org/group name+code it should prefill and lock, or 404/410 if the
// token doesn't exist or has expired. Any authenticated user may resolve a
// token -- there's nothing sensitive in the response beyond a name and a
// code the link itself already discloses.
router.post("/resolve", requireAuth, async (req: Request, res: Response) => {
  try {
    const { token } = req.body as { token?: string }
    if (!token?.trim()) return res.status(400).json({ error: "token is required" })

    const { data: link, error } = await db()
      .from("vendor_invite_links")
      .select("org_id, group_id, expires_at")
      .eq("token", token.trim())
      .maybeSingle()
    if (error) throw error
    if (!link) return res.status(404).json({ error: "Invite link not found" })
    if (new Date(link.expires_at) <= new Date()) return res.status(410).json({ error: "Invite link has expired" })

    if (link.org_id) {
      const { data: org, error: orgError } = await db().from("organizations").select("org_code, name").eq("id", link.org_id).maybeSingle()
      if (orgError) throw orgError
      if (!org?.org_code) return res.status(404).json({ error: "Organization not found" })
      return res.json({ data: { scope: "org", code: org.org_code, name: org.name } })
    }

    const { data: group, error: groupError } = await db().from("organization_groups").select("code, name").eq("id", link.group_id).maybeSingle()
    if (groupError) throw groupError
    if (!group?.code) return res.status(404).json({ error: "Group not found" })
    res.json({ data: { scope: "group", code: group.code, name: group.name } })
  } catch (err: any) {
    console.error("[vendor-invite-links/resolve]", err.message)
    res.status(500).json({ error: "Failed to resolve invite link" })
  }
})

export default router
