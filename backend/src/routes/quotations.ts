import { Router, Request, Response } from "express"
import { getSupabaseAdmin } from "../utils/supabaseAdmin"
import { requireAuth, AuthenticatedRequest } from "../middleware/auth"
import { getDefaultOrgId } from "../utils/org"

const router = Router()
function db(): any { return getSupabaseAdmin() }

async function hasVendorPermission(userId: string, vendorId: string, key: string): Promise<boolean> {
  const { data } = await db().rpc("has_vendor_permission_as", { p_user_id: userId, p_vendor_id: vendorId, p_key: key })
  return data === true
}

async function hasOrgPermission(userId: string, orgId: string, key: string): Promise<boolean> {
  const { data } = await db().rpc("has_permission_as", { p_user_id: userId, p_org_id: orgId, p_key: key })
  return data === true
}

// Shared with /approve: engagement-status bookkeeping + org notification,
// run only once a quotation actually reaches "submitted" (i.e. after
// Manager/Admin approval, not when the Associate first sends it up).
async function notifyOrgOfSubmittedQuotation(quotation: any) {
  const engagementId: string = quotation.engagement_id
  if (!engagementId) return
  try {
    const { count: vendorCount } = await db()
      .from("engagement_vendors")
      .select("*", { count: "exact", head: true })
      .eq("engagement_id", engagementId)

    const { count: submittedCount } = await db()
      .from("quotations")
      .select("*", { count: "exact", head: true })
      .eq("engagement_id", engagementId)
      .eq("status", "submitted")

    const allQuoted = (submittedCount ?? 0) >= (vendorCount ?? 1)
    const newEngStatus = allQuoted ? "quotations_received" : "in_review"

    await db()
      .from("engagements")
      .update({ status: newEngStatus })
      .eq("id", engagementId)
      .in("status", ["approved", "in_review"])

    const { data: eng } = await db()
      .from("engagements")
      .select("title, org_id")
      .eq("id", engagementId)
      .single()

    const vendorName: string = (quotation.vendor as any)?.company_name ?? "A vendor"
    const engTitle: string   = eng?.title ?? "an engagement"
    const notifTitle  = allQuoted ? "All Quotations Received" : "Quotation Received"
    const notifMsg    = allQuoted
      ? `All vendors have submitted quotations for "${engTitle}"`
      : `${vendorName} submitted a quotation for "${engTitle}"`

    // Scoped to this quotation's org, not every platform admin (the
    // previous version queried profiles.role='admin' globally, notifying
    // admins at every org regardless of relevance -- tightened while
    // this code was already being moved).
    const { data: orgMembers } = await db()
      .from("organization_members")
      .select("profile_id")
      .eq("org_id", eng?.org_id ?? quotation.org_id)
      .eq("status", "active")

    if (Array.isArray(orgMembers) && orgMembers.length > 0) {
      await db().from("notifications").insert(
        orgMembers.map((m: { profile_id: string }) => ({
          user_id:             m.profile_id,
          type:                "new_quotation",
          title:               notifTitle,
          message:             notifMsg,
          module_reference_id: engagementId,
          is_read:             false,
        }))
      )
    }
  } catch (sideEffectErr: any) {
    console.error("[quotations] notify-org side-effect error:", sideEffectErr.message)
  }
}

// POST /api/quotations/by-rfq
router.post("/by-rfq", requireAuth, async (req: Request, res: Response) => {
  try {
    const { rfqId } = req.body
    if (!rfqId) return res.status(400).json({ error: "Missing rfqId" })

    const { data, error } = await db()
      .from("quotations")
      .select("*, vendor:vendor_id(company_name), line_items:quotation_line_items(*)")
      .eq("rfq_id", rfqId)
      .maybeSingle()

    if (error) throw error
    return res.json(data ?? null)
  } catch (err: any) {
    return res.status(500).json({ error: err.message || "Unexpected error" })
  }
})

// POST /api/quotations/by-engagement
router.post("/by-engagement", requireAuth, async (req: Request, res: Response) => {
  try {
    const { engagementId } = req.body
    if (!engagementId) return res.status(400).json({ error: "Missing engagementId" })

    const { data, error } = await db()
      .from("quotations")
      .select("*, vendor:vendor_id(company_name), line_items:quotation_line_items(*)")
      .eq("engagement_id", engagementId)
      .eq("status", "submitted")

    if (error) throw error
    return res.json(data)
  } catch (err: any) {
    return res.status(500).json({ error: err.message || "Unexpected error" })
  }
})

// POST /api/quotations/create
router.post("/create", requireAuth, async (req: Request, res: Response) => {
  try {
    const { rfq_id, engagement_id, vendor_id, notes, line_items } = req.body
    if (!rfq_id || !engagement_id || !vendor_id || !Array.isArray(line_items)) {
      return res.status(400).json({ error: "Missing required fields" })
    }

    const orgId = await getDefaultOrgId()

    // Step 1: create quotation header
    const { data: quot, error: quotError } = await db()
      .from("quotations")
      .insert({ rfq_id, engagement_id, vendor_id, notes: notes ?? null, status: "draft", org_id: orgId })
      .select("id")
      .single()
    if (quotError) throw quotError
    const quotId: string = quot.id

    // Step 2: insert line items
    if (line_items.length > 0) {
      const { error: liError } = await db()
        .from("quotation_line_items")
        .insert(
          line_items.map((item: any) => ({
            quotation_id: quotId,
            description:  item.description,
            quantity:     item.quantity   ?? null,
            unit_price:   item.unit_price ?? null,
            tax_rate:     item.tax_rate   ?? null,
            remarks:      item.remarks    ?? null,
          }))
        )
      if (liError) {
        await db().from("quotations").delete().eq("id", quotId)
        throw liError
      }
    }

    const { data: quotation, error: getError } = await db()
      .from("quotations")
      .select("*, vendor:vendor_id(company_name), line_items:quotation_line_items(*)")
      .eq("id", quotId)
      .single()
    if (getError) throw getError

    return res.json(quotation)
  } catch (err: any) {
    return res.status(500).json({ error: err.message || "Unexpected error" })
  }
})

// POST /api/quotations/submit-for-review
// Associate (or Manager/Admin, if the Associate isn't available) finishes a
// draft quotation and sends it up for Manager approval. This does NOT reach
// the organisation yet -- it only moves draft -> pending_manager_review.
router.post("/submit-for-review", requireAuth, async (req: Request, res: Response) => {
  try {
    const { id, total_amount } = req.body
    const userId = (req as AuthenticatedRequest).user.id
    if (!id || total_amount === undefined) return res.status(400).json({ error: "Missing id or total_amount" })

    const { data: existing, error: existingError } = await db()
      .from("quotations")
      .select("id, vendor_id, status")
      .eq("id", id)
      .single()
    if (existingError) throw existingError
    if (existing.status !== "draft") {
      return res.status(400).json({ error: "Only a draft quotation can be sent for review" })
    }

    const canSubmit =
      (await hasVendorPermission(userId, existing.vendor_id, "quotations.draft_line_items")) ||
      (await hasVendorPermission(userId, existing.vendor_id, "quotations.submit"))
    if (!canSubmit) {
      return res.status(403).json({ error: "You are not authorized to submit this quotation" })
    }

    const { data, error } = await db()
      .from("quotations")
      .update({ status: "pending_manager_review", total_amount })
      .eq("id", id)
      .select("*, vendor:vendor_id(company_name)")
      .single()
    if (error) throw error

    return res.json(data)
  } catch (err: any) {
    return res.status(500).json({ error: err.message || "Unexpected error" })
  }
})

// POST /api/quotations/approve
// Vendor Manager/Admin approves a quotation that's pending their review --
// this is the moment it actually becomes "submitted" and reaches the org.
router.post("/approve", requireAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.body
    const userId = (req as AuthenticatedRequest).user.id
    if (!id) return res.status(400).json({ error: "Missing id" })

    const { data: existing, error: existingError } = await db()
      .from("quotations")
      .select("id, vendor_id, status")
      .eq("id", id)
      .single()
    if (existingError) throw existingError
    if (existing.status !== "pending_manager_review") {
      return res.status(400).json({ error: "Only a quotation pending Manager review can be approved" })
    }

    const canApprove = await hasVendorPermission(userId, existing.vendor_id, "quotations.submit")
    if (!canApprove) {
      return res.status(403).json({ error: "You are not authorized to approve this quotation" })
    }

    const { data, error } = await db()
      .from("quotations")
      .update({
        status: "submitted",
        submitted_at: new Date().toISOString(),
        reviewed_by: userId,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select("*, vendor:vendor_id(company_name)")
      .single()
    if (error) throw error

    await notifyOrgOfSubmittedQuotation(data)
    return res.json(data)
  } catch (err: any) {
    return res.status(500).json({ error: err.message || "Unexpected error" })
  }
})

// POST /api/quotations/return-to-associate
// Vendor Manager/Admin sends a quotation back instead of approving it, with
// remarks -- per the app's general rule that rejections return to the
// creator, editable, rather than being archived.
router.post("/return-to-associate", requireAuth, async (req: Request, res: Response) => {
  try {
    const { id, notes } = req.body
    const userId = (req as AuthenticatedRequest).user.id
    if (!id || !notes) return res.status(400).json({ error: "id and notes are required" })

    const { data: existing, error: existingError } = await db()
      .from("quotations")
      .select("id, vendor_id, status")
      .eq("id", id)
      .single()
    if (existingError) throw existingError
    if (existing.status !== "pending_manager_review") {
      return res.status(400).json({ error: "Only a quotation pending Manager review can be returned" })
    }

    const canReturn = await hasVendorPermission(userId, existing.vendor_id, "quotations.submit")
    if (!canReturn) {
      return res.status(403).json({ error: "You are not authorized to return this quotation" })
    }

    const { data, error } = await db()
      .from("quotations")
      .update({
        status: "draft",
        manager_review_notes: notes,
        reviewed_by: userId,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select()
      .single()
    if (error) throw error

    return res.json(data)
  } catch (err: any) {
    return res.status(500).json({ error: err.message || "Unexpected error" })
  }
})

// POST /api/quotations/update-status
// Now scoped to the org's final decision (accepted/rejected) on a quotation
// that has actually reached "submitted" -- draft/pending_manager_review/
// submitted transitions all have their own dedicated, permission-checked
// endpoints above. Previously this had no permission check of any kind;
// that gap is closed here.
router.post("/update-status", requireAuth, async (req: Request, res: Response) => {
  try {
    const { id, status } = req.body
    const userId = (req as AuthenticatedRequest).user.id
    if (!id || !status) return res.status(400).json({ error: "Missing id or status" })
    if (!["accepted", "rejected"].includes(status)) {
      return res.status(400).json({ error: "This endpoint only accepts 'accepted' or 'rejected'" })
    }

    const { data: existing, error: existingError } = await db()
      .from("quotations")
      .select("id, org_id, status")
      .eq("id", id)
      .single()
    if (existingError) throw existingError
    if (existing.status !== "submitted") {
      return res.status(400).json({ error: "Only a submitted quotation can be accepted or rejected" })
    }

    const canDecide = await hasOrgPermission(userId, existing.org_id, "quotations.compare_select")
    if (!canDecide) {
      return res.status(403).json({ error: "You are not authorized to decide on this quotation" })
    }

    const { data, error } = await db()
      .from("quotations")
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
