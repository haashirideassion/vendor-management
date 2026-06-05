import { Router, Request, Response } from "express"
import { getSupabaseAdmin } from "../utils/supabaseAdmin"
import { requireAuth, AuthenticatedRequest } from "../middleware/auth"

const router = Router()
function db(): any { return getSupabaseAdmin() }

// POST /api/invoices/list
router.post("/list", requireAuth, async (req: Request, res: Response) => {
  try {
    const { status, vendor_id, po_id, match_status } = req.body

    let query = db()
      .from("invoices")
      .select(
        "*, vendor:vendor_id(company_name), purchase_order:po_id(po_number), grn:grn_id(grn_number), contract:contract_id(contract_ref, title), engagement:engagement_id(title)"
      )
      .order("created_at", { ascending: false })

    if (status) query = query.eq("status", status)
    if (vendor_id) query = query.eq("vendor_id", vendor_id)
    if (po_id) query = query.eq("po_id", po_id)
    if (match_status) query = query.eq("match_status", match_status)

    const { data, error } = await query

    if (error) throw error

    res.json({ data })
  } catch (err: any) {
    console.error("[invoices/list]", err.message)
    res.status(500).json({ error: "Failed to list invoices" })
  }
})

// POST /api/invoices/get
router.post("/get", requireAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.body
    if (!id) return res.status(400).json({ error: "id is required" })

    const { data, error } = await db()
      .from("invoices")
      .select(
        "*, vendor:vendor_id(company_name), purchase_order:po_id(po_number), grn:grn_id(grn_number), contract:contract_id(contract_ref, title), engagement:engagement_id(title)"
      )
      .eq("id", id)
      .single()

    if (error) throw error

    res.json({ data })
  } catch (err: any) {
    console.error("[invoices/get]", err.message)
    res.status(500).json({ error: "Failed to get invoice" })
  }
})

// POST /api/invoices/submit
router.post("/submit", requireAuth, async (req: Request, res: Response) => {
  try {
    const {
      vendor_invoice_number,
      vendor_id,
      po_id: rawPoId,
      grn_id,
      contract_id,
      engagement_id,
      total_amount,
      currency,
      invoice_date,
      due_date,
      notes,
      storage_path,
      submitted_by,
    } = req.body

    if (!vendor_invoice_number || !vendor_id || total_amount === undefined || !invoice_date || !submitted_by) {
      return res.status(400).json({
        error: "vendor_invoice_number, vendor_id, total_amount, invoice_date, and submitted_by are required",
      })
    }

    let po_id = rawPoId

    if (!po_id && engagement_id && vendor_id) {
      const { data: poRow } = await db()
        .from("purchase_orders")
        .select("id")
        .eq("engagement_id", engagement_id)
        .eq("vendor_id", vendor_id)
        .limit(1)
        .maybeSingle()

      if (poRow) po_id = poRow.id
    }

    const invoicePayload: any = {
      vendor_invoice_number,
      vendor_id,
      total_amount,
      invoice_date,
      submitted_by,
      status: "submitted",
      match_status: "pending",
    }
    if (po_id !== undefined) invoicePayload.po_id = po_id
    if (grn_id !== undefined) invoicePayload.grn_id = grn_id
    if (contract_id !== undefined) invoicePayload.contract_id = contract_id
    if (engagement_id !== undefined) invoicePayload.engagement_id = engagement_id
    if (currency !== undefined) invoicePayload.currency = currency
    if (due_date !== undefined) invoicePayload.due_date = due_date
    if (notes !== undefined) invoicePayload.notes = notes
    if (storage_path !== undefined) invoicePayload.storage_path = storage_path

    const { data, error } = await db()
      .from("invoices")
      .insert(invoicePayload)
      .select()
      .single()

    if (error) throw error

    res.json({ data })
  } catch (err: any) {
    console.error("[invoices/submit]", err.message)
    res.status(500).json({ error: "Failed to submit invoice" })
  }
})

// POST /api/invoices/run-match
router.post("/run-match", requireAuth, async (req: Request, res: Response) => {
  try {
    const { invoiceId } = req.body
    if (!invoiceId) return res.status(400).json({ error: "invoiceId is required" })

    const { data, error } = await db().rpc("perform_three_way_match", { p_invoice_id: invoiceId })

    if (error) throw error

    res.json({ data })
  } catch (err: any) {
    console.error("[invoices/run-match]", err.message)
    res.status(500).json({ error: "Failed to run three-way match" })
  }
})

// POST /api/invoices/review
router.post("/review", requireAuth, async (req: Request, res: Response) => {
  try {
    const { id, status, notes, reviewed_by } = req.body
    if (!id || !status || !reviewed_by) {
      return res.status(400).json({ error: "id, status, and reviewed_by are required" })
    }

    const updates: any = { status, reviewed_by, reviewed_at: new Date().toISOString() }
    if (notes !== undefined) updates.notes = notes

    const { data, error } = await db()
      .from("invoices")
      .update(updates)
      .eq("id", id)
      .select()
      .single()

    if (error) throw error

    res.json({ data })
  } catch (err: any) {
    console.error("[invoices/review]", err.message)
    res.status(500).json({ error: "Failed to review invoice" })
  }
})

// POST /api/invoices/mark-paid
router.post("/mark-paid", requireAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.body
    if (!id) return res.status(400).json({ error: "id is required" })

    const { data, error } = await db()
      .from("invoices")
      .update({ status: "paid", paid_at: new Date().toISOString() })
      .eq("id", id)
      .select()
      .single()

    if (error) throw error

    res.json({ data })
  } catch (err: any) {
    console.error("[invoices/mark-paid]", err.message)
    res.status(500).json({ error: "Failed to mark invoice as paid" })
  }
})

export default router
