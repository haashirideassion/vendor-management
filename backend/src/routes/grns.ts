import { Router, Request, Response } from "express"
import { getSupabaseAdmin } from "../utils/supabaseAdmin"
import { requireAuth, AuthenticatedRequest } from "../middleware/auth"

const router = Router()
function db(): any { return getSupabaseAdmin() }

// POST /api/grns/list
router.post("/list", requireAuth, async (req: Request, res: Response) => {
  try {
    const { status, vendor_id, po_id } = req.body

    let query = db()
      .from("grns")
      .select("*, vendor:vendor_id(company_name), purchase_order:po_id(po_number), line_items:grn_line_items(*)")
      .order("created_at", { ascending: false })

    if (status) query = query.eq("status", status)
    if (vendor_id) query = query.eq("vendor_id", vendor_id)
    if (po_id) query = query.eq("po_id", po_id)

    const { data, error } = await query
    if (error) throw error
    return res.json(data)
  } catch (err: any) {
    return res.status(500).json({ error: err.message || "Unexpected error" })
  }
})

// POST /api/grns/get
router.post("/get", requireAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.body
    if (!id) return res.status(400).json({ error: "Missing id" })

    const { data, error } = await db()
      .from("grns")
      .select("*, vendor:vendor_id(company_name), purchase_order:po_id(po_number), line_items:grn_line_items(*)")
      .eq("id", id)
      .single()

    if (error) throw error
    return res.json(data)
  } catch (err: any) {
    return res.status(500).json({ error: err.message || "Unexpected error" })
  }
})

// POST /api/grns/create
router.post("/create", requireAuth, async (req: Request, res: Response) => {
  try {
    const { po_id, vendor_id, received_date, notes, created_by, verified_by, line_items } = req.body
    if (!po_id || !vendor_id || !received_date || !created_by || !Array.isArray(line_items)) {
      return res.status(400).json({ error: "Missing required fields" })
    }

    const { data: grn, error: grnError } = await db()
      .from("grns")
      .insert({
        po_id,
        vendor_id,
        received_date,
        notes: notes ?? null,
        created_by,
        status: "verified",
        verified_by: verified_by ?? null,
        verified_at: new Date().toISOString(),
      })
      .select()
      .single()

    if (grnError) throw grnError

    if (line_items.length > 0) {
      const lineItemRows = line_items.map((item: any) => ({ ...item, grn_id: grn.id }))
      const { error: lineItemsError } = await db()
        .from("grn_line_items")
        .insert(lineItemRows)
      if (lineItemsError) throw lineItemsError
    }

    return res.json(grn)
  } catch (err: any) {
    return res.status(500).json({ error: err.message || "Unexpected error" })
  }
})

// POST /api/grns/update-status
router.post("/update-status", requireAuth, async (req: Request, res: Response) => {
  try {
    const { id, status, notes, verified_by } = req.body
    if (!id || !status) return res.status(400).json({ error: "Missing id or status" })

    const update: Record<string, any> = { status, notes: notes ?? null }
    if (status === "verified") {
      update.verified_by = verified_by ?? null
      update.verified_at = new Date().toISOString()
    }

    const { data, error } = await db()
      .from("grns")
      .update(update)
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
