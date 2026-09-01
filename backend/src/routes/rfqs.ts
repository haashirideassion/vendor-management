import { Router, Request, Response } from "express"
import { getSupabaseAdmin } from "../utils/supabaseAdmin"
import { requireAuth, AuthenticatedRequest } from "../middleware/auth"
import { resolveVendorId, isOrgMember, resolveVendorAllowedOrgIds } from "../middleware/org"

const router = Router()
function db(): any { return getSupabaseAdmin() }

// A vendor may see/act on an RFQ once its purchase request has been
// released to them (left draft/pending_approval) -- not just while the PR
// is still literally sitting in "approved". Submitting a quotation itself
// advances the PR to "in_review" (more vendors still to respond) or
// "quotations_received" (this was the last one) -- see
// notifyOrgOfSubmittedQuotation in quotations.ts -- so requiring an exact
// "approved" match here made a vendor's own submission immediately lock
// them out of the RFQ they'd just responded to (couldn't re-list it, view
// it, or have their "responded" status update land).
const PR_STATUSES_VISIBLE_TO_VENDOR = ["approved", "in_review", "quotations_received", "completed"]

// Internal (non-vendor) callers must send X-Org-Id and be a member of it;
// vendor callers are scoped to their own vendor_id instead, since vendors
// aren't rows in organization_members. Also enforces the vendor Associate
// client-assignment restriction (Phase 3.5/3.6) -- null allowedOrgIds means
// unrestricted, an array (possibly empty) restricts to exactly those orgs.
export async function checkRfqAccess(
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

    // Resolve via vendor_users (multi-user vendors), not the legacy 1:1
    // vendors.profile_id -- that column is NULL for any admin-onboarded
    // vendor, so this always returned [] for every one of that vendor's
    // staff regardless of role.
    const vendorId = await resolveVendorId(userId)
    if (!vendorId) return res.json([])

    // !inner so the purchase_request.status filter below actually applies (a
    // plain embedded select can't be filtered on in PostgREST) -- an RFQ's
    // purchase request is a NOT NULL FK, so this never drops a legitimate row.
    // Vendors only see RFQs for purchase requests that have cleared internal
    // approval, not ones still in draft/pending_approval.
    let query = db()
      .from("rfqs")
      .select("*, purchase_request:purchase_request_id!inner(*, line_items:purchase_request_line_items(*)), vendor:vendor_id(company_name), team:team_id(name)")
      .eq("vendor_id", vendorId)
      .in("purchase_request.status", PR_STATUSES_VISIBLE_TO_VENDOR)
      .order("created_at", { ascending: false })

    const allowedOrgIds = await resolveVendorAllowedOrgIds(userId, vendorId)
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
      .select("*, purchase_request:purchase_request_id(*, line_items:purchase_request_line_items(*)), vendor:vendor_id(company_name), team:team_id(name)")
      .eq("id", id)
      .single()

    if (error) throw error
    if (!(await checkRfqAccess(req, data))) {
      return res.status(403).json({ error: "Not authorized to view this RFQ" })
    }
    // Vendors can't view an RFQ for a purchase request still awaiting
    // internal approval -- internal staff (already scoped by checkRfqAccess
    // above) have no such restriction.
    if ((req as AuthenticatedRequest).user.role === "vendor" && !PR_STATUSES_VISIBLE_TO_VENDOR.includes(data.purchase_request?.status)) {
      return res.status(403).json({ error: "Not authorized to view this RFQ" })
    }
    return res.json(data)
  } catch (err: any) {
    return res.status(500).json({ error: err.message || "Unexpected error" })
  }
})

// POST /api/rfqs/by-purchase-request
router.post("/by-purchase-request", requireAuth, async (req: Request, res: Response) => {
  try {
    const { purchaseRequestId } = req.body
    if (!purchaseRequestId) return res.status(400).json({ error: "Missing purchaseRequestId" })
    const { id: userId, role } = (req as AuthenticatedRequest).user

    let query = db()
      .from("rfqs")
      .select("*, purchase_request:purchase_request_id!inner(*, line_items:purchase_request_line_items(*)), vendor:vendor_id(company_name), team:team_id(name)")
      .eq("purchase_request_id", purchaseRequestId)
      .order("created_at", { ascending: false })

    if (role === "vendor") {
      const vendorId = await resolveVendorId(userId)
      if (!vendorId) return res.json([])
      query = query.eq("vendor_id", vendorId).in("purchase_request.status", PR_STATUSES_VISIBLE_TO_VENDOR)
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
      .select("org_id, vendor_id, purchase_request:purchase_request_id(status)")
      .eq("id", id)
      .single()
    if (fetchError) throw fetchError
    if (!(await checkRfqAccess(req, existing))) {
      return res.status(403).json({ error: "Not authorized to update this RFQ" })
    }
    if ((req as AuthenticatedRequest).user.role === "vendor" && !PR_STATUSES_VISIBLE_TO_VENDOR.includes((existing as any).purchase_request?.status)) {
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
