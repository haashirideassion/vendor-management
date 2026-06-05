import { Router, Request, Response } from "express"
import { getSupabaseAdmin } from "../utils/supabaseAdmin"
import { requireAuth, AuthenticatedRequest } from "../middleware/auth"

const router = Router()
function db(): any { return getSupabaseAdmin() }

// POST /api/documents/by-vendor — { vendorId }
router.post("/by-vendor", async (req: Request, res: Response) => {
  try {
    const { vendorId } = req.body
    if (!vendorId) return res.status(400).json({ error: "vendorId is required" })
    const { data, error } = await db()
      .from("vendor_documents")
      .select("*")
      .eq("vendor_id", vendorId)
      .order("uploaded_at", { ascending: false })
    if (error) throw error
    res.json(data)
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Unexpected error" })
  }
})

// POST /api/documents/create — { vendor_id, document_type, file_name, storage_path, expires_at? }
router.post("/create", async (req: Request, res: Response) => {
  try {
    const { vendor_id, document_type, file_name, storage_path, expires_at } = req.body
    if (!vendor_id) return res.status(400).json({ error: "vendor_id is required" })
    if (!document_type) return res.status(400).json({ error: "document_type is required" })
    if (!file_name) return res.status(400).json({ error: "file_name is required" })
    if (!storage_path) return res.status(400).json({ error: "storage_path is required" })
    const payload: any = { vendor_id, document_type, file_name, storage_path }
    if (expires_at !== undefined) payload.expires_at = expires_at
    const { data, error } = await db()
      .from("vendor_documents")
      .insert(payload)
      .select()
      .single()
    if (error) throw error
    res.json(data)
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Unexpected error" })
  }
})

// POST /api/documents/verify — { id, verified, verified_at, notes? }
router.post("/verify", async (req: Request, res: Response) => {
  try {
    const { id, verified, verified_at, notes } = req.body
    if (!id) return res.status(400).json({ error: "id is required" })
    if (verified === undefined || verified === null) return res.status(400).json({ error: "verified is required" })
    if (!verified_at) return res.status(400).json({ error: "verified_at is required" })
    const payload: any = { verified, verified_at }
    if (notes !== undefined) payload.notes = notes
    const { data, error } = await db()
      .from("vendor_documents")
      .update(payload)
      .eq("id", id)
      .select()
      .single()
    if (error) throw error
    res.json(data)
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Unexpected error" })
  }
})

export default router
