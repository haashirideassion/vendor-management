import { Router, Request, Response } from "express"
import { getSupabaseAdmin } from "../utils/supabaseAdmin"
import { requireAuth, AuthenticatedRequest } from "../middleware/auth"

const router = Router()
function db(): any { return getSupabaseAdmin() }

// POST /api/engagements/list
router.post("/list", requireAuth, async (req: Request, res: Response) => {
  try {
    const { status, vendor_id, search } = req.body

    let query = db()
      .from("engagements")
      .select(
        "*, vendor:vendor_id(company_name, contact_name), category:category_id(name), creator:created_by(full_name, email), line_items:engagement_line_items(*), engagement_vendors(vendor:vendor_id(id, company_name))"
      )
      .order("created_at", { ascending: false })

    if (status) query = query.eq("status", status)
    if (vendor_id) query = query.eq("vendor_id", vendor_id)
    if (search) query = query.ilike("title", `%${search}%`)

    const { data, error } = await query

    if (error) throw error

    res.json({ data })
  } catch (err: any) {
    console.error("[engagements/list]", err.message)
    res.status(500).json({ error: "Failed to list engagements" })
  }
})

// POST /api/engagements/get
router.post("/get", requireAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.body
    if (!id) return res.status(400).json({ error: "id is required" })

    const { data, error } = await db()
      .from("engagements")
      .select(
        "*, vendor:vendor_id(company_name, contact_name), category:category_id(name), creator:created_by(full_name, email), line_items:engagement_line_items(*), engagement_vendors(vendor:vendor_id(id, company_name))"
      )
      .eq("id", id)
      .single()

    if (error) throw error

    res.json({ data })
  } catch (err: any) {
    console.error("[engagements/get]", err.message)
    res.status(500).json({ error: "Failed to get engagement" })
  }
})

// POST /api/engagements/create
router.post("/create", requireAuth, async (req: Request, res: Response) => {
  try {
    const {
      title,
      description,
      vendor_ids,
      category_ids,
      estimated_value,
      currency,
      start_date,
      end_date,
      notes,
      line_items,
      created_by,
    } = req.body

    if (!title || !Array.isArray(vendor_ids) || !Array.isArray(category_ids) || !currency || !created_by) {
      return res.status(400).json({
        error: "title, vendor_ids, category_ids, currency, and created_by are required",
      })
    }

    // Step 1: create engagement
    const { data: eng, error: engError } = await db()
      .from("engagements")
      .insert({
        title,
        description:     description     || null,
        category_id:     category_ids[0] || null,
        estimated_value: estimated_value || null,
        currency,
        start_date:      start_date      || null,
        end_date:        end_date        || null,
        notes:           notes           || null,
        created_by,
        status: "approved",
      })
      .select("id")
      .single()
    if (engError) throw engError
    const engId: string = eng.id

    // Helper: rollback engagement if a later step fails
    const rollback = async () => {
      await db().from("engagements").delete().eq("id", engId)
    }

    // Step 2: line items
    if (Array.isArray(line_items) && line_items.length > 0) {
      const { error: liError } = await db()
        .from("engagement_line_items")
        .insert(
          line_items.map((item: any) => ({
            engagement_id: engId,
            description:   item.description,
            quantity:      item.quantity    ?? null,
            unit_price:    item.unit_price  ?? null,
          }))
        )
      if (liError) { await rollback(); throw liError }
    }

    // Step 3: vendor assignments + RFQs
    if (vendor_ids.length > 0) {
      const { error: evError } = await db()
        .from("engagement_vendors")
        .insert(vendor_ids.map((vid: string) => ({ engagement_id: engId, vendor_id: vid })))
      if (evError) { await rollback(); throw evError }

      const { error: rfqError } = await db()
        .from("rfqs")
        .upsert(
          vendor_ids.map((vid: string) => ({ engagement_id: engId, vendor_id: vid, status: "pending" })),
          { onConflict: "engagement_id,vendor_id" }
        )
      if (rfqError) { await rollback(); throw rfqError }
    }

    // Fetch full engagement for response
    const { data: full, error: getError } = await db()
      .from("engagements")
      .select("*, category:category_id(name), creator:created_by(full_name, email), line_items:engagement_line_items(*), engagement_vendors(vendor:vendor_id(id, company_name))")
      .eq("id", engId)
      .single()
    if (getError) throw getError

    res.json({ data: full })
  } catch (err: any) {
    console.error("[engagements/create]", err?.message ?? err)
    res.status(500).json({ error: err?.message ?? "Failed to create engagement" })
  }
})

// POST /api/engagements/update-status
router.post("/update-status", requireAuth, async (req: Request, res: Response) => {
  try {
    const { id, status, notes, approved_by } = req.body
    if (!id || !status) return res.status(400).json({ error: "id and status are required" })

    const updates: any = { status, notes: notes ?? null }
    if (status === "approved") {
      updates.approved_by = approved_by
      updates.approved_at = new Date().toISOString()
    }

    const { data, error } = await db()
      .from("engagements")
      .update(updates)
      .eq("id", id)
      .select()
      .single()

    if (error) throw error

    res.json({ data })
  } catch (err: any) {
    console.error("[engagements/update-status]", err.message)
    res.status(500).json({ error: "Failed to update engagement status" })
  }
})

// POST /api/engagements/update
router.post("/update", requireAuth, async (req: Request, res: Response) => {
  try {
    const { id, ...fields } = req.body
    if (!id) return res.status(400).json({ error: "id is required" })

    const { data, error } = await db()
      .from("engagements")
      .update(fields)
      .eq("id", id)
      .select()
      .single()

    if (error) throw error

    res.json({ data })
  } catch (err: any) {
    console.error("[engagements/update]", err.message)
    res.status(500).json({ error: "Failed to update engagement" })
  }
})

export default router
