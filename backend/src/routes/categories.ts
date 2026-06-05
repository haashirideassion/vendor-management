import { Router, Request, Response } from "express"
import { getSupabaseAdmin } from "../utils/supabaseAdmin"
import { requireAuth } from "../middleware/auth"

const router = Router()
function db(): any { return getSupabaseAdmin() }

// POST /api/categories/list — { activeOnly? }
router.post("/list", requireAuth, async (req: Request, res: Response) => {
  try {
    let query = db().from("service_categories").select("*").order("name", { ascending: true })
    if (req.body.activeOnly === true) query = query.eq("is_active", true)
    const { data, error } = await query
    if (error) throw error
    res.json({ data })
  } catch (err: any) {
    console.error("[categories/list]", err.message)
    res.status(500).json({ error: "Failed to list categories" })
  }
})

// POST /api/categories/by-vendor — { vendorId }
router.post("/by-vendor", requireAuth, async (req: Request, res: Response) => {
  try {
    const { vendorId } = req.body
    if (!vendorId) return res.status(400).json({ error: "vendorId is required" })
    const { data, error } = await db()
      .from("vendor_categories")
      .select("*, service_categories(*)")
      .eq("vendor_id", vendorId)
    if (error) throw error
    res.json({ data: data ?? [] })
  } catch (err: any) {
    console.error("[categories/by-vendor]", err.message)
    res.status(500).json({ error: "Failed to get vendor categories" })
  }
})

// POST /api/categories/vendor-counts — {} — returns { category_id: string }[]
router.post("/vendor-counts", requireAuth, async (req: Request, res: Response) => {
  try {
    const { data, error } = await db()
      .from("vendor_categories")
      .select("category_id")
    if (error) throw error
    res.json({ data: data ?? [] })
  } catch (err: any) {
    console.error("[categories/vendor-counts]", err.message)
    res.status(500).json({ error: "Failed to get vendor category counts" })
  }
})

// POST /api/categories/create — { name, description? }
router.post("/create", requireAuth, async (req: Request, res: Response) => {
  try {
    const { name, description } = req.body
    if (!name) return res.status(400).json({ error: "name is required" })
    const { data, error } = await db()
      .from("service_categories")
      .insert({ name, description: description ?? null, is_active: true })
      .select()
      .single()
    if (error) throw error
    res.json({ data })
  } catch (err: any) {
    console.error("[categories/create]", err.message)
    res.status(500).json({ error: "Failed to create category" })
  }
})

// POST /api/categories/update — { id, ...fields }
router.post("/update", requireAuth, async (req: Request, res: Response) => {
  try {
    const { id, ...fields } = req.body
    if (!id) return res.status(400).json({ error: "id is required" })
    const { data, error } = await db()
      .from("service_categories")
      .update(fields)
      .eq("id", id)
      .select()
      .single()
    if (error) throw error
    res.json({ data })
  } catch (err: any) {
    console.error("[categories/update]", err.message)
    res.status(500).json({ error: "Failed to update category" })
  }
})

// POST /api/categories/delete — { id }
router.post("/delete", requireAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.body
    if (!id) return res.status(400).json({ error: "id is required" })
    const { error } = await db().from("service_categories").delete().eq("id", id)
    if (error) throw error
    res.json({ ok: true })
  } catch (err: any) {
    console.error("[categories/delete]", err.message)
    res.status(500).json({ error: "Failed to delete category" })
  }
})

export default router
