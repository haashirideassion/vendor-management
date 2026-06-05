import { Router, Request, Response } from "express"
import { getSupabaseAdmin } from "../utils/supabaseAdmin"
import { requireAuth, AuthenticatedRequest } from "../middleware/auth"

const router = Router()
function db(): any { return getSupabaseAdmin() }

// POST /api/analytics/procurement-kpis — {}
router.post("/procurement-kpis", requireAuth, async (req: Request, res: Response) => {
  try {
    const [
      { data: data1, error: err1 },
      { data: data2, error: err2 },
      { data: data3, error: err3 },
      { data: data4, error: err4 },
      { data: data5, error: err5 },
    ] = await Promise.all([
      db()
        .from("purchase_orders")
        .select("id, total_value, status, created_at, vendor:vendor_id(company_name)"),
      db()
        .from("invoices")
        .select("id, total_amount, status"),
      db()
        .from("contracts")
        .select("id, status, expiry_date, title, contract_ref, contract_type"),
      db()
        .from("grns")
        .select("id, status"),
      db()
        .from("engagements")
        .select("id, status, estimated_value"),
    ])

    const firstError = err1 || err2 || err3 || err4 || err5
    if (firstError) throw firstError

    res.json({
      purchase_orders: data1,
      invoices: data2,
      contracts: data3,
      grns: data4,
      engagements: data5,
    })
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Unexpected error" })
  }
})

export default router
