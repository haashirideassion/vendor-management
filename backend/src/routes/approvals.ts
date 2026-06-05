import { Router, Request, Response } from "express"
import { getSupabaseAdmin } from "../utils/supabaseAdmin"
import { requireAuth, AuthenticatedRequest } from "../middleware/auth"

const router = Router()
function db(): any { return getSupabaseAdmin() }

// POST /api/approvals/by-entity
router.post("/by-entity", requireAuth, async (req: Request, res: Response) => {
  try {
    const { entityType, entityId } = req.body
    if (!entityType || !entityId) return res.status(400).json({ error: "Missing entityType or entityId" })

    const { data, error } = await db()
      .from("approval_requests")
      .select("*, requester:requested_by(full_name, email), reviewer:reviewed_by(full_name, email)")
      .eq("entity_type", entityType)
      .eq("entity_id", entityId)
      .order("created_at", { ascending: false })

    if (error) throw error
    return res.json(data)
  } catch (err: any) {
    return res.status(500).json({ error: err.message || "Unexpected error" })
  }
})

// POST /api/approvals/pending
router.post("/pending", requireAuth, async (req: Request, res: Response) => {
  try {
    const { entityType } = req.body

    let query = db()
      .from("approval_requests")
      .select("*, requester:requested_by(full_name, email)")
      .eq("status", "pending")
      .order("created_at", { ascending: true })

    if (entityType) query = query.eq("entity_type", entityType)

    const { data, error } = await query
    if (error) throw error
    return res.json(data)
  } catch (err: any) {
    return res.status(500).json({ error: err.message || "Unexpected error" })
  }
})

// POST /api/approvals/request
router.post("/request", requireAuth, async (req: Request, res: Response) => {
  try {
    const { entity_type, entity_id, requested_by, amount, notes } = req.body
    if (!entity_type || !entity_id || !requested_by) {
      return res.status(400).json({ error: "Missing required fields" })
    }

    const { data, error } = await db()
      .from("approval_requests")
      .insert({
        entity_type,
        entity_id,
        requested_by,
        amount: amount ?? null,
        notes: notes ?? null,
        status: "pending",
      })
      .select()
      .single()

    if (error) throw error
    return res.json(data)
  } catch (err: any) {
    return res.status(500).json({ error: err.message || "Unexpected error" })
  }
})

// POST /api/approvals/review
router.post("/review", requireAuth, async (req: Request, res: Response) => {
  try {
    const { id, status, notes, reviewed_by } = req.body
    if (!id || !status || !reviewed_by) return res.status(400).json({ error: "Missing id, status, or reviewed_by" })

    const { data, error } = await db()
      .from("approval_requests")
      .update({
        status,
        notes: notes ?? null,
        reviewed_by,
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

// POST /api/approvals/cancel
router.post("/cancel", requireAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.body
    if (!id) return res.status(400).json({ error: "Missing id" })

    const { data, error } = await db()
      .from("approval_requests")
      .update({ status: "cancelled" })
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
