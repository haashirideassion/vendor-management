import { Router, Request, Response } from "express"
import { getSupabaseAdmin } from "../utils/supabaseAdmin"
import { requireAuth, AuthenticatedRequest } from "../middleware/auth"

const router = Router()
function db(): any { return getSupabaseAdmin() }

// POST /api/purchase-orders/list
router.post("/list", requireAuth, async (req: Request, res: Response) => {
  try {
    const { status, vendor_id, engagement_id, contract_id } = req.body

    let query = db()
      .from("purchase_orders")
      .select(
        "*, vendor:vendor_id(company_name, contact_name), engagement:engagement_id(title), line_items:po_line_items(*)"
      )
      .order("created_at", { ascending: false })

    if (status) query = query.eq("status", status)
    if (vendor_id) query = query.eq("vendor_id", vendor_id)
    if (engagement_id) query = query.eq("engagement_id", engagement_id)
    if (contract_id) query = query.eq("contract_id", contract_id)

    const { data, error } = await query

    if (error) throw error

    res.json({ data })
  } catch (err: any) {
    console.error("[purchase-orders/list]", err.message)
    res.status(500).json({ error: "Failed to list purchase orders" })
  }
})

// POST /api/purchase-orders/get
router.post("/get", requireAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.body
    if (!id) return res.status(400).json({ error: "id is required" })

    const { data, error } = await db()
      .from("purchase_orders")
      .select(
        "*, vendor:vendor_id(company_name, contact_name), engagement:engagement_id(title), line_items:po_line_items(*)"
      )
      .eq("id", id)
      .single()

    if (error) throw error

    res.json({ data })
  } catch (err: any) {
    console.error("[purchase-orders/get]", err.message)
    res.status(500).json({ error: "Failed to get purchase order" })
  }
})

// POST /api/purchase-orders/create
router.post("/create", requireAuth, async (req: Request, res: Response) => {
  try {
    const {
      engagement_id,
      vendor_id,
      total_value,
      currency,
      issue_date,
      expected_delivery_date,
      delivery_address,
      payment_terms,
      notes,
      line_items,
      created_by,
    } = req.body

    if (!vendor_id || total_value === undefined || !created_by) {
      return res.status(400).json({ error: "vendor_id, total_value, and created_by are required" })
    }

    const { data: po, error: poError } = await db()
      .from("purchase_orders")
      .insert({
        engagement_id:          engagement_id          ?? null,
        vendor_id,
        total_value,
        currency:               currency               ?? null,
        issue_date:             issue_date             ?? null,
        expected_delivery_date: expected_delivery_date ?? null,
        delivery_address:       delivery_address       ?? null,
        payment_terms:          payment_terms          ?? null,
        notes:                  notes                  ?? null,
        created_by,
        status: "draft",
      })
      .select("id")
      .single()
    if (poError) throw poError
    const poId: string = po.id

    if (Array.isArray(line_items) && line_items.length > 0) {
      const { error: liError } = await db()
        .from("po_line_items")
        .insert(
          line_items.map((item: any) => ({
            po_id:       poId,
            description: item.description,
            quantity:    item.quantity   ?? null,
            unit_price:  item.unit_price ?? null,
            unit:        item.unit       ?? null,
          }))
        )
      if (liError) {
        await db().from("purchase_orders").delete().eq("id", poId)
        throw liError
      }
    }

    const { data: full, error: getError } = await db()
      .from("purchase_orders")
      .select("*, vendor:vendor_id(company_name, contact_name), engagement:engagement_id(title), line_items:po_line_items(*)")
      .eq("id", poId)
      .single()
    if (getError) throw getError

    res.json({ data: full })
  } catch (err: any) {
    console.error("[purchase-orders/create]", err.message)
    res.status(500).json({ error: err.message || "Failed to create purchase order" })
  }
})

// POST /api/purchase-orders/issue
router.post("/issue", requireAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.body
    if (!id) return res.status(400).json({ error: "id is required" })

    const { data, error } = await db()
      .from("purchase_orders")
      .update({ status: "issued", issue_date: new Date().toISOString().split("T")[0] })
      .eq("id", id)
      .select()
      .single()

    if (error) throw error

    res.json({ data })
  } catch (err: any) {
    console.error("[purchase-orders/issue]", err.message)
    res.status(500).json({ error: "Failed to issue purchase order" })
  }
})

// POST /api/purchase-orders/update-status
router.post("/update-status", requireAuth, async (req: Request, res: Response) => {
  try {
    const { id, status } = req.body
    if (!id || !status) return res.status(400).json({ error: "id and status are required" })

    const { data, error } = await db()
      .from("purchase_orders")
      .update({ status })
      .eq("id", id)
      .select()
      .single()

    if (error) throw error

    res.json({ data })
  } catch (err: any) {
    console.error("[purchase-orders/update-status]", err.message)
    res.status(500).json({ error: "Failed to update purchase order status" })
  }
})

export default router
