import { Router, Request, Response } from "express"
import { getSupabaseAdmin } from "../utils/supabaseAdmin"
import { requireAuth, AuthenticatedRequest } from "../middleware/auth"
import { getDefaultOrgId } from "../utils/org"
import { attachTaxComponents, insertTaxComponents, sumTaxComponents, TaxComponentInput } from "../services/taxComponents.service"

const router = Router()
function db(): any { return getSupabaseAdmin() }

// Attaches each quotation's line items' tax_components breakdown in place --
// shared by every read endpoint below that returns quotations with nested
// line_items.
async function attachTaxComponentsToQuotations(quotations: any[]): Promise<any[]> {
  const allLineItems = quotations.flatMap((q) => q.line_items ?? [])
  if (allLineItems.length === 0) return quotations
  const withComponents = await attachTaxComponents("quotation", allLineItems)
  const byId = new Map(withComponents.map((li) => [li.id, li.tax_components]))
  for (const q of quotations) {
    q.line_items = (q.line_items ?? []).map((li: any) => ({ ...li, tax_components: byId.get(li.id) ?? [] }))
  }
  return quotations
}

// Routed through resolve_permission_as -- see invoices.ts's identical
// comment for why (adds the Feature Entitlement gate + User Restriction
// override that the bare RPCs skip).
async function hasVendorPermission(userId: string, vendorId: string, key: string): Promise<boolean> {
  const { data } = await db().rpc("resolve_permission_as", { p_user_id: userId, p_scope: "vendor", p_org_id: null, p_vendor_id: vendorId, p_key: key })
  return data === true
}

async function hasOrgPermission(userId: string, orgId: string, key: string): Promise<boolean> {
  const { data } = await db().rpc("resolve_permission_as", { p_user_id: userId, p_scope: "org", p_org_id: orgId, p_vendor_id: null, p_key: key })
  return data === true
}

// Shared with /approve: purchase-request-status bookkeeping + org
// notification, run only once a quotation actually reaches "submitted"
// (i.e. after Manager/Admin approval, not when the Associate first sends it
// up).
async function notifyOrgOfSubmittedQuotation(quotation: any) {
  const purchaseRequestId: string = quotation.purchase_request_id
  if (!purchaseRequestId) return
  try {
    const { count: vendorCount } = await db()
      .from("purchase_request_vendors")
      .select("*", { count: "exact", head: true })
      .eq("purchase_request_id", purchaseRequestId)

    const { count: submittedCount } = await db()
      .from("quotations")
      .select("*", { count: "exact", head: true })
      .eq("purchase_request_id", purchaseRequestId)
      .eq("status", "submitted")
      .eq("is_current", true)

    const allQuoted = (submittedCount ?? 0) >= (vendorCount ?? 1)
    const newPRStatus = allQuoted ? "quotations_received" : "in_review"

    await db()
      .from("purchase_requests")
      .update({ status: newPRStatus })
      .eq("id", purchaseRequestId)
      .in("status", ["approved", "in_review"])

    const { data: pr } = await db()
      .from("purchase_requests")
      .select("title, org_id")
      .eq("id", purchaseRequestId)
      .single()

    const vendorName: string = (quotation.vendor as any)?.company_name ?? "A vendor"
    const prTitle: string    = pr?.title ?? "a purchase request"
    const notifTitle  = allQuoted ? "All Quotations Received" : "Quotation Received"
    const notifMsg    = allQuoted
      ? `All vendors have submitted quotations for "${prTitle}"`
      : `${vendorName} submitted a quotation for "${prTitle}"`

    // Scoped to this quotation's org, not every platform admin (the
    // previous version queried profiles.role='admin' globally, notifying
    // admins at every org regardless of relevance -- tightened while
    // this code was already being moved).
    const { data: orgMembers } = await db()
      .from("organization_members")
      .select("profile_id")
      .eq("org_id", pr?.org_id ?? quotation.org_id)
      .eq("status", "active")

    if (Array.isArray(orgMembers) && orgMembers.length > 0) {
      await db().from("notifications").insert(
        orgMembers.map((m: { profile_id: string }) => ({
          user_id:             m.profile_id,
          type:                "new_quotation",
          title:               notifTitle,
          message:             notifMsg,
          module_reference_id: purchaseRequestId,
          is_read:             false,
        }))
      )
    }
  } catch (sideEffectErr: any) {
    console.error("[quotations] notify-org side-effect error:", sideEffectErr.message)
  }
}

// POST /api/quotations/by-rfq
// Returns the CURRENT version only -- quotations.rfq_id is no longer unique
// once superseded versions exist (see migration 070), so this must filter
// on is_current or .maybeSingle() throws as soon as a second version exists.
router.post("/by-rfq", requireAuth, async (req: Request, res: Response) => {
  try {
    const { rfqId } = req.body
    if (!rfqId) return res.status(400).json({ error: "Missing rfqId" })

    const { data, error } = await db()
      .from("quotations")
      .select("*, vendor:vendor_id(company_name), line_items:quotation_line_items(*)")
      .eq("rfq_id", rfqId)
      .eq("is_current", true)
      .maybeSingle()

    if (error) throw error
    if (data) await attachTaxComponentsToQuotations([data])
    return res.json(data ?? null)
  } catch (err: any) {
    return res.status(500).json({ error: err.message || "Unexpected error" })
  }
})

// POST /api/quotations/by-rfq/versions
// Full version history for an RFQ's quotation, newest first -- the point of
// versioning over overwrite is that superseded versions stay inspectable
// (e.g. the org comparing what changed between a vendor's submissions).
router.post("/by-rfq/versions", requireAuth, async (req: Request, res: Response) => {
  try {
    const { rfqId } = req.body
    if (!rfqId) return res.status(400).json({ error: "Missing rfqId" })

    const { data, error } = await db()
      .from("quotations")
      .select("*, vendor:vendor_id(company_name), line_items:quotation_line_items(*)")
      .eq("rfq_id", rfqId)
      .order("version", { ascending: false })

    if (error) throw error
    await attachTaxComponentsToQuotations(data ?? [])
    return res.json(data ?? [])
  } catch (err: any) {
    return res.status(500).json({ error: err.message || "Unexpected error" })
  }
})

// POST /api/quotations/by-purchase-request
router.post("/by-purchase-request", requireAuth, async (req: Request, res: Response) => {
  try {
    const { purchaseRequestId } = req.body
    if (!purchaseRequestId) return res.status(400).json({ error: "Missing purchaseRequestId" })

    const { data, error } = await db()
      .from("quotations")
      .select("*, vendor:vendor_id(company_name), line_items:quotation_line_items(*)")
      .eq("purchase_request_id", purchaseRequestId)
      .eq("status", "submitted")
      .eq("is_current", true)

    if (error) throw error
    await attachTaxComponentsToQuotations(data ?? [])
    return res.json(data)
  } catch (err: any) {
    return res.status(500).json({ error: err.message || "Unexpected error" })
  }
})

// Not-available lines can never carry quantity/price/tax (matches the DB
// CHECK in migration 070) -- enforced here too since the DB would otherwise
// just 500 the whole request on a constraint violation instead of giving a
// clean per-field error, and a client that "forgets" to blank these fields
// on availability change shouldn't silently persist stale numbers.
function normalizeLineItem(item: any) {
  const availability = item.availability_status ?? "available"
  if (!["available", "partially_available", "not_available"].includes(availability)) {
    throw new Error(`Invalid availability_status: ${availability}`)
  }
  if (availability === "not_available") {
    return { availability_status: availability, quantity: null, unit_price: null, tax_rate: null, tax_components: undefined as TaxComponentInput[] | undefined }
  }
  if (item.quantity === undefined || item.quantity === null || Number(item.quantity) <= 0) {
    throw new Error("quantity must be greater than 0 for an available/partially available line")
  }
  if (item.unit_price === undefined || item.unit_price === null || Number(item.unit_price) < 0) {
    throw new Error("unit_price is required for an available/partially available line")
  }
  const taxComponents: TaxComponentInput[] | undefined = Array.isArray(item.tax_components) && item.tax_components.length > 0
    ? item.tax_components.map((c: any) => ({ name: c.name, rate: Number(c.rate) }))
    : undefined
  return {
    availability_status: availability,
    quantity:   item.quantity,
    unit_price: item.unit_price,
    tax_rate:   sumTaxComponents(taxComponents, item.tax_rate ?? null),
    tax_components: taxComponents,
  }
}

// POST /api/quotations/create
router.post("/create", requireAuth, async (req: Request, res: Response) => {
  try {
    const { rfq_id, purchase_request_id, vendor_id, notes, line_items } = req.body
    if (!rfq_id || !purchase_request_id || !vendor_id || !Array.isArray(line_items)) {
      return res.status(400).json({ error: "Missing required fields" })
    }

    let normalizedItems: ReturnType<typeof normalizeLineItem>[]
    try {
      normalizedItems = line_items.map(normalizeLineItem)
    } catch (validationErr: any) {
      return res.status(400).json({ error: validationErr.message })
    }

    const orgId = await getDefaultOrgId()

    // Only one row per RFQ has is_current=true (migration 070's partial
    // unique index) -- that's the row this "save draft" / "revise" action
    // targets. Superseded versions are never touched again.
    const { data: existingQuot, error: existingError } = await db()
      .from("quotations")
      .select("id, status, version")
      .eq("rfq_id", rfq_id)
      .eq("is_current", true)
      .maybeSingle()
    if (existingError) throw existingError

    if (existingQuot && existingQuot.status === "accepted") {
      return res.status(400).json({ error: "This quotation has been accepted and can no longer be revised" })
    }
    if (existingQuot && existingQuot.status === "pending_manager_review") {
      return res.status(400).json({ error: "This quotation is awaiting internal Manager review and cannot be edited until it is returned or approved" })
    }

    let deadlinePassed = false
    if (existingQuot && existingQuot.status !== "draft") {
      // Resubmission of an already-submitted/rejected quotation: only
      // allowed as a NEW version, and only before the RFQ's response
      // deadline (undated legacy RFQs are treated as having no deadline).
      const { data: rfq, error: rfqError } = await db()
        .from("rfqs")
        .select("response_deadline")
        .eq("id", rfq_id)
        .single()
      if (rfqError) throw rfqError
      if (rfq.response_deadline && new Date(rfq.response_deadline) < new Date()) {
        deadlinePassed = true
      }
    }
    if (deadlinePassed) {
      return res.status(400).json({ error: "The response deadline for this RFQ has passed; this quotation can no longer be revised" })
    }

    let quotId: string
    if (!existingQuot) {
      const { data: quot, error: quotError } = await db()
        .from("quotations")
        .insert({ rfq_id, purchase_request_id, vendor_id, notes: notes ?? null, status: "draft", org_id: orgId, version: 1, is_current: true })
        .select("id")
        .single()
      if (quotError) throw quotError
      quotId = quot.id
    } else if (existingQuot.status === "draft") {
      // Same draft, same version -- just re-save.
      const { error: updateError } = await db()
        .from("quotations")
        .update({ notes: notes ?? null })
        .eq("id", existingQuot.id)
      if (updateError) throw updateError
      quotId = existingQuot.id

      const { error: deleteLiError } = await db()
        .from("quotation_line_items")
        .delete()
        .eq("quotation_id", quotId)
      if (deleteLiError) throw deleteLiError
    } else {
      // Already left draft (submitted/rejected) -- supersede it with a new
      // version rather than overwriting the record of what was submitted.
      const { error: supersedeError } = await db()
        .from("quotations")
        .update({ is_current: false })
        .eq("id", existingQuot.id)
      if (supersedeError) throw supersedeError

      const { data: quot, error: quotError } = await db()
        .from("quotations")
        .insert({
          rfq_id, purchase_request_id, vendor_id, notes: notes ?? null,
          status: "draft", org_id: orgId,
          version: existingQuot.version + 1, is_current: true,
        })
        .select("id")
        .single()
      if (quotError) throw quotError
      quotId = quot.id
    }

    if (normalizedItems.length > 0) {
      const { data: insertedItems, error: liError } = await db()
        .from("quotation_line_items")
        .insert(
          normalizedItems.map((item, idx) => ({
            quotation_id: quotId,
            description:  line_items[idx].description,
            availability_status: item.availability_status,
            quantity:     item.quantity,
            unit_price:   item.unit_price,
            tax_rate:     item.tax_rate,
            remarks:      line_items[idx].remarks ?? null,
          }))
        )
        .select("id")
      if (liError) {
        if (!existingQuot || existingQuot.status !== "draft") await db().from("quotations").delete().eq("id", quotId)
        throw liError
      }

      await Promise.all(
        normalizedItems.map((item, idx) => insertTaxComponents("quotation", insertedItems[idx].id, item.tax_components))
      )
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
