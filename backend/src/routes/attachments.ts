import { Router, Request, Response } from "express"
import { getSupabaseAdmin } from "../utils/supabaseAdmin"
import { requireAuth, AuthenticatedRequest } from "../middleware/auth"

const router = Router()
function db(): any { return getSupabaseAdmin() }

// POST /api/attachments/list
router.post("/list", requireAuth, async (req: Request, res: Response) => {
  try {
    const { entityType, entityId } = req.body
    if (!entityType || !entityId) return res.status(400).json({ error: "Missing entityType or entityId" })

    const { data, error } = await db()
      .from("attachments")
      .select("*")
      .eq("entity_type", entityType)
      .eq("entity_id", entityId)
      .eq("is_deleted", false)
      .order("created_at", { ascending: true })

    if (error) {
      if (error.code === "42P01") return res.json([])
      throw error
    }
    return res.json(data)
  } catch (err: any) {
    return res.status(500).json({ error: err.message || "Unexpected error" })
  }
})

// POST /api/attachments/create
router.post("/create", requireAuth, async (req: Request, res: Response) => {
  try {
    const {
      entity_type,
      entity_id,
      file_name,
      original_name,
      file_extension,
      mime_type,
      file_size,
      storage_path,
      uploaded_by,
    } = req.body

    if (!entity_type || !entity_id || !file_name || !original_name || !storage_path || !uploaded_by) {
      return res.status(400).json({ error: "Missing required fields" })
    }

    const { data, error } = await db()
      .from("attachments")
      .insert({
        entity_type,
        entity_id,
        file_name,
        original_name,
        file_extension: file_extension ?? null,
        mime_type: mime_type ?? null,
        file_size: file_size ?? null,
        storage_path,
        uploaded_by,
        is_deleted: false,
      })
      .select()
      .single()

    if (error) throw error
    return res.json(data)
  } catch (err: any) {
    return res.status(500).json({ error: err.message || "Unexpected error" })
  }
})

// POST /api/attachments/delete
router.post("/delete", requireAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.body
    if (!id) return res.status(400).json({ error: "Missing id" })

    const { error } = await db()
      .from("attachments")
      .update({ is_deleted: true })
      .eq("id", id)

    if (error) throw error
    return res.json({ ok: true })
  } catch (err: any) {
    return res.status(500).json({ error: err.message || "Unexpected error" })
  }
})

export default router
