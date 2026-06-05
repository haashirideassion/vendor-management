import { Router, Request, Response } from "express"
import { getSupabaseAdmin } from "../utils/supabaseAdmin"
import { requireAuth, AuthenticatedRequest } from "../middleware/auth"

const router = Router()
function db(): any { return getSupabaseAdmin() }

// POST /api/vendors/list
router.post("/list", requireAuth, async (req: Request, res: Response) => {
  try {
    const { status, category, search } = req.body

    let vendorIds: string[] | null = null

    if (category) {
      const { data: catRows, error: catErr } = await db()
        .from("vendor_categories")
        .select("vendor_id")
        .eq("category_id", category)

      if (catErr) throw catErr

      vendorIds = (catRows ?? []).map((r: any) => r.vendor_id)
      if (vendorIds!.length === 0) {
        return res.json({ data: [] })
      }
    }

    let query = db()
      .from("vendors")
      .select("*, vendor_categories(*, service_categories(*)), vendor_ratings(score)")
      .order("created_at", { ascending: false })

    if (vendorIds !== null) {
      query = query.in("id", vendorIds)
    }
    if (status) {
      query = query.eq("status", status)
    }
    if (search) {
      query = query.or(
        `company_name.ilike.%${search}%,contact_email.ilike.%${search}%,vendor_id_code.ilike.%${search}%`
      )
    }

    const { data, error } = await query

    if (error) throw error

    const vendors = (data ?? []).map((v: any) => {
      const ratings: any[] = v.vendor_ratings ?? []
      const avg_rating =
        ratings.length > 0
          ? ratings.reduce((sum: number, r: any) => sum + (r.score ?? 0), 0) / ratings.length
          : null
      return { ...v, avg_rating }
    })

    res.json({ data: vendors })
  } catch (err: any) {
    console.error("[vendors/list]", err.message)
    res.status(500).json({ error: "Failed to list vendors" })
  }
})

// POST /api/vendors/get
router.post("/get", requireAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.body
    if (!id) return res.status(400).json({ error: "id is required" })

    const { data, error } = await db()
      .from("vendors")
      .select(
        "*, vendor_categories(*, service_categories(*)), vendor_services(*), vendor_documents(*), vendor_ratings(*, profiles(full_name, email))"
      )
      .eq("id", id)
      .single()

    if (error) throw error

    const ratings: any[] = data?.vendor_ratings ?? []
    const avg_rating =
      ratings.length > 0
        ? ratings.reduce((sum: number, r: any) => sum + (r.score ?? 0), 0) / ratings.length
        : null

    res.json({ data: { ...data, avg_rating } })
  } catch (err: any) {
    console.error("[vendors/get]", err.message)
    res.status(500).json({ error: "Failed to get vendor" })
  }
})

// POST /api/vendors/get-my-vendor
router.post("/get-my-vendor", requireAuth, async (req: Request, res: Response) => {
  try {
    const { profileId } = req.body
    if (!profileId) return res.status(400).json({ error: "profileId is required" })

    const { data, error } = await db()
      .from("vendors")
      .select(
        "*, vendor_categories(*, service_categories(*)), vendor_services(*), vendor_documents(*), vendor_ratings(*, profiles(full_name, email))"
      )
      .eq("profile_id", profileId)
      .maybeSingle()

    if (error) throw error

    if (!data) return res.json({ data: null })

    const ratings: any[] = data.vendor_ratings ?? []
    const avg_rating =
      ratings.length > 0
        ? ratings.reduce((sum: number, r: any) => sum + (r.score ?? 0), 0) / ratings.length
        : null

    res.json({ data: { ...data, avg_rating } })
  } catch (err: any) {
    console.error("[vendors/get-my-vendor]", err.message)
    res.status(500).json({ error: "Failed to get vendor" })
  }
})

// POST /api/vendors/update-status
router.post("/update-status", requireAuth, async (req: Request, res: Response) => {
  try {
    const { id, status, admin_notes } = req.body
    if (!id || !status) return res.status(400).json({ error: "id and status are required" })

    const updates: any = { status }
    if (admin_notes !== undefined) updates.admin_notes = admin_notes

    const { data, error } = await db()
      .from("vendors")
      .update(updates)
      .eq("id", id)
      .select()
      .single()

    if (error) throw error

    res.json({ data })
  } catch (err: any) {
    console.error("[vendors/update-status]", err.message)
    res.status(500).json({ error: "Failed to update vendor status" })
  }
})

// POST /api/vendors/update
router.post("/update", requireAuth, async (req: Request, res: Response) => {
  try {
    const { profileId, ...fields } = req.body
    if (!profileId) return res.status(400).json({ error: "profileId is required" })

    const { data, error } = await db()
      .from("vendors")
      .update(fields)
      .eq("profile_id", profileId)
      .select()
      .single()

    if (error) throw error

    res.json({ data })
  } catch (err: any) {
    console.error("[vendors/update]", err.message)
    res.status(500).json({ error: "Failed to update vendor" })
  }
})

// POST /api/vendors/update-categories
router.post("/update-categories", requireAuth, async (req: Request, res: Response) => {
  try {
    const { vendorId, categoryIds } = req.body
    if (!vendorId || !Array.isArray(categoryIds)) {
      return res.status(400).json({ error: "vendorId and categoryIds are required" })
    }

    const { error: deleteError } = await db()
      .from("vendor_categories")
      .delete()
      .eq("vendor_id", vendorId)

    if (deleteError) throw deleteError

    if (categoryIds.length > 0) {
      const rows = categoryIds.map((cid: string) => ({
        vendor_id: vendorId,
        category_id: cid,
      }))

      const { error: insertError } = await db().from("vendor_categories").insert(rows)
      if (insertError) throw insertError
    }

    res.json({ ok: true })
  } catch (err: any) {
    console.error("[vendors/update-categories]", err.message)
    res.status(500).json({ error: "Failed to update vendor categories" })
  }
})

// POST /api/vendors/by-categories
router.post("/by-categories", requireAuth, async (req: Request, res: Response) => {
  try {
    const { categoryIds } = req.body
    if (!Array.isArray(categoryIds) || categoryIds.length === 0) {
      return res.status(400).json({ error: "categoryIds is required and must be a non-empty array" })
    }

    const { data: catRows, error: catErr } = await db()
      .from("vendor_categories")
      .select("vendor_id")
      .in("category_id", categoryIds)

    if (catErr) throw catErr

    const vendorIds = [...new Set((catRows ?? []).map((r: any) => r.vendor_id))]

    if (vendorIds.length === 0) return res.json({ data: [] })

    const { data, error } = await db()
      .from("vendors")
      .select("id, company_name, contact_name")
      .in("id", vendorIds)
      .eq("status", "active")
      .order("company_name", { ascending: true })

    if (error) throw error

    res.json({ data })
  } catch (err: any) {
    console.error("[vendors/by-categories]", err.message)
    res.status(500).json({ error: "Failed to get vendors by categories" })
  }
})

export default router
