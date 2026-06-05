import { Router, Request, Response } from "express"
import { getSupabaseAdmin } from "../utils/supabaseAdmin"
import { requireAuth, AuthenticatedRequest } from "../middleware/auth"

const router = Router()
function db(): any { return getSupabaseAdmin() }

// POST /api/rfqs/vendor-list
router.post("/vendor-list", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req as AuthenticatedRequest).user?.id
    if (!userId) return res.status(400).json({ error: "Missing user id" })

    const { data: vendor, error: vendorError } = await db()
      .from("vendors")
      .select("id")
      .eq("profile_id", userId)
      .maybeSingle()

    if (vendorError) throw vendorError
    if (!vendor) return res.json([])

    const { data, error } = await db()
      .from("rfqs")
      .select("*, engagement:engagement_id(*, line_items:engagement_line_items(*)), vendor:vendor_id(company_name)")
      .eq("vendor_id", vendor.id)
      .order("created_at", { ascending: false })

    if (error) throw error
    return res.json(data)
  } catch (err: any) {
    return res.status(500).json({ error: err.message || "Unexpected error" })
  }
})

// POST /api/rfqs/get
router.post("/get", requireAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.body
    if (!id) return res.status(400).json({ error: "Missing id" })

    const { data, error } = await db()
      .from("rfqs")
      .select("*, engagement:engagement_id(*, line_items:engagement_line_items(*)), vendor:vendor_id(company_name)")
      .eq("id", id)
      .single()

    if (error) throw error
    return res.json(data)
  } catch (err: any) {
    return res.status(500).json({ error: err.message || "Unexpected error" })
  }
})

// POST /api/rfqs/by-engagement
router.post("/by-engagement", requireAuth, async (req: Request, res: Response) => {
  try {
    const { engagementId } = req.body
    if (!engagementId) return res.status(400).json({ error: "Missing engagementId" })

    const { data, error } = await db()
      .from("rfqs")
      .select("*, engagement:engagement_id(*, line_items:engagement_line_items(*)), vendor:vendor_id(company_name)")
      .eq("engagement_id", engagementId)
      .order("created_at", { ascending: false })

    if (error) throw error
    return res.json(data)
  } catch (err: any) {
    return res.status(500).json({ error: err.message || "Unexpected error" })
  }
})

// POST /api/rfqs/update-status
router.post("/update-status", requireAuth, async (req: Request, res: Response) => {
  try {
    const { id, status } = req.body
    if (!id || !status) return res.status(400).json({ error: "Missing id or status" })

    const { data, error } = await db()
      .from("rfqs")
      .update({ status })
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
