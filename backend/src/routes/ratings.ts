import { Router, Request, Response } from "express"
import { getSupabaseAdmin } from "../utils/supabaseAdmin"
import { requireAuth, AuthenticatedRequest } from "../middleware/auth"

const router = Router()
function db(): any { return getSupabaseAdmin() }

// POST /api/ratings/by-vendor — { vendorId }
router.post("/by-vendor", async (req: Request, res: Response) => {
  try {
    const { vendorId } = req.body
    if (!vendorId) return res.status(400).json({ error: "vendorId is required" })
    const { data, error } = await db()
      .from("vendor_ratings")
      .select("*, profiles:rated_by(full_name, email)")
      .eq("vendor_id", vendorId)
      .order("created_at", { ascending: false })
    if (error) throw error
    res.json(data)
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Unexpected error" })
  }
})

// POST /api/ratings/upsert — { vendor_id, rated_by, score, comment? }
router.post("/upsert", async (req: Request, res: Response) => {
  try {
    const { vendor_id, rated_by, score, comment } = req.body
    if (!vendor_id) return res.status(400).json({ error: "vendor_id is required" })
    if (!rated_by) return res.status(400).json({ error: "rated_by is required" })
    if (score === undefined || score === null) return res.status(400).json({ error: "score is required" })
    const payload: any = { vendor_id, rated_by, score }
    if (comment !== undefined) payload.comment = comment
    const { data, error } = await db()
      .from("vendor_ratings")
      .upsert(payload, { onConflict: "vendor_id,rated_by" })
      .select()
      .single()
    if (error) throw error
    res.json(data)
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Unexpected error" })
  }
})

export default router
