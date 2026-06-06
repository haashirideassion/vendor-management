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

    const { data: quotId, error: quotationError } = await db().rpc("create_quotation_with_line_items", {
      p_rfq_id: rfq_id,
      p_engagement_id: engagement_id,
      p_vendor_id: vendor_id,
      p_notes: notes ?? null,
      p_line_items: line_items.length > 0 ? JSON.stringify(line_items) : null,
    })

    if (quotationError) throw quotationError

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
      .select()
      .single()

    if (error) throw error
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
