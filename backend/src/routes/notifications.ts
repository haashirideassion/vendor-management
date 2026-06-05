import { Router, Request, Response } from "express"
import { getSupabaseAdmin } from "../utils/supabaseAdmin"
import { requireAuth, AuthenticatedRequest } from "../middleware/auth"

const router = Router()
function db(): any { return getSupabaseAdmin() }

// POST /api/notifications/list
router.post("/list", requireAuth, async (req: Request, res: Response) => {
  try {
    const { data, error } = await db()
      .from("notifications")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(20)

    if (error) throw error
    return res.json(data)
  } catch (err: any) {
    return res.status(500).json({ error: err.message || "Unexpected error" })
  }
})

// POST /api/notifications/mark-read
router.post("/mark-read", requireAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.body
    if (!id) return res.status(400).json({ error: "Missing id" })

    const { error } = await db()
      .from("notifications")
      .update({ is_read: true })
      .eq("id", id)

    if (error) throw error
    return res.json({ ok: true })
  } catch (err: any) {
    return res.status(500).json({ error: err.message || "Unexpected error" })
  }
})

// POST /api/notifications/mark-all-read
router.post("/mark-all-read", requireAuth, async (req: Request, res: Response) => {
  try {
    const { error } = await db()
      .from("notifications")
      .update({ is_read: true })
      .eq("is_read", false)

    if (error) throw error
    return res.json({ ok: true })
  } catch (err: any) {
    return res.status(500).json({ error: err.message || "Unexpected error" })
  }
})

export default router
