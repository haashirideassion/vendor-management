import { Router, Request, Response } from "express"
import { getSupabaseAdmin } from "../utils/supabaseAdmin"
import { requireAuth, AuthenticatedRequest } from "../middleware/auth"

const router = Router()
function db(): any { return getSupabaseAdmin() }

// POST /api/audit-log/list — { entityId? }
router.post("/list", requireAuth, async (req: Request, res: Response) => {
  try {
    const { entityId } = req.body
    let query = db()
      .from("audit_log")
      .select("*, profiles:user_id(full_name, email)")
      .order("created_at", { ascending: false })
      .limit(50)
    if (entityId !== undefined && entityId !== null) {
      query = query.eq("entity_id", entityId)
    }
    const { data, error } = await query
    if (error) throw error
    res.json(data)
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Unexpected error" })
  }
})

export default router
