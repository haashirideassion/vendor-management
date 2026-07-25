import { Router, Request, Response } from "express"
import { getSupabaseAdmin } from "../utils/supabaseAdmin"
import { requireAuth, AuthenticatedRequest } from "../middleware/auth"
import { resolveVendorId, isOrgMember, resolveVendorAllowedOrgIds } from "../middleware/org"

const router = Router()
function db(): any { return getSupabaseAdmin() }

// Internal (non-vendor) callers must send X-Org-Id and be a member of it;
// vendor callers are scoped to their own vendor_id instead, since vendors
// aren't rows in organization_members. Also enforces the vendor Associate
// client-assignment restriction (Phase 3.5/3.6) -- null allowedOrgIds means
// unrestricted, an array (possibly empty) restricts to exactly those orgs.
async function checkRfqAccess(
  req: Request,
  rfq: { org_id: string; vendor_id: string }
): Promise<boolean> {
  const { id: userId, role } = (req as AuthenticatedRequest).user
  if (role === "vendor") {
    const vendorId = await resolveVendorId(userId)
    if (!vendorId || rfq.vendor_id !== vendorId) return false
    const allowedOrgIds = await resolveVendorAllowedOrgIds(userId, vendorId)
    return allowedOrgIds === null || allowedOrgIds.includes(rfq.org_id)
  }
  const orgId = req.headers["x-org-id"]
  if (!orgId || typeof orgId !== "string") return false
  return rfq.org_id === orgId && (await isOrgMember(userId, orgId))
}

// POST /api/rfqs/vendor-list
router.post("/vendor-list", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req as AuthenticatedRequest).user?.id
    if (!userId) return res.status(400).json({ error: "Missing user id" })

    const { data: vendor, error: vendorError } = await db()
      .from("vendors")
      .select("id")
      .eq("profile_id", userId)
      .maybeSingle()

    if (vendorError) throw vendorError
    if (!vendor) return res.json([])

    let query = db()
      .from("rfqs")
      .select("*, engagement:engagement_id(*, line_items:engagement_line_items(*)), vendor:vendor_id(company_name)")
      .eq("vendor_id", vendor.id)
      .order("created_at", { ascending: false })

    const allowedOrgIds = await resolveVendorAllowedOrgIds(userId, vendor.id)
    if (allowedOrgIds !== null) query = query.in("org_id", allowedOrgIds)

    const { data, error } = await query
    if (error) throw error
    return res.json(data)
  } catch (err: any) {
    return res.status(500).json({ error: err.message || "Unexpected error" })
  }
})

// POST /api/rfqs/get
router.post("/get", requireAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.body
    if (!id) return res.status(400).json({ error: "Missing id" })

    const { data, error } = await db()
      .from("rfqs")
      .select("*, engagement:engagement_id(*, line_items:engagement_line_items(*)), vendor:vendor_id(company_name)")
      .eq("id", id)
      .single()

    if (error) throw error
    if (!(await checkRfqAccess(req, data))) {
      return res.status(403).json({ error: "Not authorized to view this RFQ" })
    }
    return res.json(data)
  } catch (err: any) {
    return res.status(500).json({ error: err.message || "Unexpected error" })
  }
})

// POST /api/rfqs/by-engagement
router.post("/by-engagement", requireAuth, async (req: Request, res: Response) => {
  try {
    const { engagementId } = req.body
    if (!engagementId) return res.status(400).json({ error: "Missing engagementId" })
    const { id: userId, role } = (req as AuthenticatedRequest).user

    let query = db()
      .from("rfqs")
      .select("*, engagement:engagement_id(*, line_items:engagement_line_items(*)), vendor:vendor_id(company_name)")
      .eq("engagement_id", engagementId)
      .order("created_at", { ascending: false })

    if (role === "vendor") {
      const vendorId = await resolveVendorId(userId)
      if (!vendorId) return res.json([])
      query = query.eq("vendor_id", vendorId)
      const allowedOrgIds = await resolveVendorAllowedOrgIds(userId, vendorId)
      if (allowedOrgIds !== null) query = query.in("org_id", allowedOrgIds)
    } else {
      const orgId = req.headers["x-org-id"]
      if (!orgId || typeof orgId !== "string" || !(await isOrgMember(userId, orgId))) {
        return res.status(403).json({ error: "You are not a member of this organization" })
      }
      query = query.eq("org_id", orgId)
    }

    const { data, error } = await query
    if (error) throw error
    return res.json(data)
  } catch (err: any) {
    return res.status(500).json({ error: err.message || "Unexpected error" })
  }
})

// POST /api/rfqs/update-status
router.post("/update-status", requireAuth, async (req: Request, res: Response) => {
  try {
    const { id, status } = req.body
    if (!id || !status) return res.status(400).json({ error: "Missing id or status" })

    const { data: existing, error: fetchError } = await db()
      .from("rfqs")
      .select("org_id, vendor_id")
      .eq("id", id)
      .single()
    if (fetchError) throw fetchError
    if (!(await checkRfqAccess(req, existing))) {
      return res.status(403).json({ error: "Not authorized to update this RFQ" })
    }

    const { data, error } = await db()
      .from("rfqs")
      .update({ status })
      .eq("id", id)
      .select()
      .single()

    if (error) throw error
    return res.json(data)
  } catch (err: any) {
    return res.status(500).json({ error: err.message || "Unexpected error" })
  }
})

export default router
