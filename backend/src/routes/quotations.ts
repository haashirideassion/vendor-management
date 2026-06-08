import { Router, Request, Response } from "express"
import { getSupabaseAdmin } from "../utils/supabaseAdmin"
import { requireAuth, AuthenticatedRequest } from "../middleware/auth"

const router = Router()
function db(): any { return getSupabaseAdmin() }

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

    // Step 1: create quotation header
    const { data: quot, error: quotError } = await db()
      .from("quotations")
      .insert({ rfq_id, engagement_id, vendor_id, notes: notes ?? null, status: "draft" })
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

// POST /api/quotations/submit
router.post("/submit", requireAuth, async (req: Request, res: Response) => {
  try {
    const { id, total_amount } = req.body
    if (!id || total_amount === undefined) return res.status(400).json({ error: "Missing id or total_amount" })

    const { data, error } = await db()
      .from("quotations")
      .update({ status: "submitted", total_amount, submitted_at: new Date().toISOString() })
      .eq("id", id)
      .select("*, vendor:vendor_id(company_name)")
      .single()

    if (error) throw error

    // Update engagement status and notify admins (fire-and-forget, don't fail the response)
    const engagementId: string = data.engagement_id
    if (engagementId) {
      try {
        // Count total vendors on engagement
        const { count: vendorCount } = await db()
          .from("engagement_vendors")
          .select("*", { count: "exact", head: true })
          .eq("engagement_id", engagementId)

        // Count submitted quotations for engagement (including this one)
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

        // Fetch engagement title for notification message
        const { data: eng } = await db()
          .from("engagements")
          .select("title")
          .eq("id", engagementId)
          .single()

        const vendorName: string = (data.vendor as any)?.company_name ?? "A vendor"
        const engTitle: string   = eng?.title ?? "an engagement"
        const notifTitle  = allQuoted ? "All Quotations Received" : "Quotation Received"
        const notifMsg    = allQuoted
          ? `All vendors have submitted quotations for "${engTitle}"`
          : `${vendorName} submitted a quotation for "${engTitle}"`

        // Get all admin user IDs
        const { data: admins } = await db()
          .from("profiles")
          .select("id")
          .eq("role", "admin")

        if (Array.isArray(admins) && admins.length > 0) {
          await db().from("notifications").insert(
            admins.map((admin: { id: string }) => ({
              user_id:             admin.id,
              type:                "new_quotation",
              title:               notifTitle,
              message:             notifMsg,
              module_reference_id: engagementId,
              is_read:             false,
            }))
          )
        }
      } catch (sideEffectErr: any) {
        console.error("[quotations/submit] side-effect error:", sideEffectErr.message)
      }
    }

    return res.json(data)
  } catch (err: any) {
    return res.status(500).json({ error: err.message || "Unexpected error" })
  }
})

// POST /api/quotations/update-status
router.post("/update-status", requireAuth, async (req: Request, res: Response) => {
  try {
    const { id, status } = req.body
    if (!id || !status) return res.status(400).json({ error: "Missing id or status" })

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
