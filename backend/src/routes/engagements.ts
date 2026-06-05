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

    // 1. Insert engagement
    const engPayload: any = {
      title,
      currency,
      created_by,
      category_id: category_ids[0] ?? null,
      vendor_id: null,
    }
    if (description !== undefined) engPayload.description = description
    if (estimated_value !== undefined) engPayload.estimated_value = estimated_value
    if (start_date !== undefined) engPayload.start_date = start_date
    if (end_date !== undefined) engPayload.end_date = end_date
    if (notes !== undefined) engPayload.notes = notes

    const { data: eng, error: engError } = await db()
      .from("engagements")
      .insert(engPayload)
      .select()
      .single()

    if (engError) throw engError

    // 2. Insert line items
    if (Array.isArray(line_items) && line_items.length > 0) {
      const lineRows = line_items.map((item: any) => ({ ...item, engagement_id: eng.id }))
      const { error: lineError } = await db().from("engagement_line_items").insert(lineRows)
      if (lineError) throw lineError
    }

    // 3. Insert engagement_vendors and rfqs
    if (vendor_ids.length > 0) {
      const vendorRows = vendor_ids.map((vid: string) => ({
        engagement_id: eng.id,
        vendor_id: vid,
      }))
      const { error: evError } = await db().from("engagement_vendors").insert(vendorRows)
      if (evError) throw evError

      const rfqRows = vendor_ids.map((vid: string) => ({
        engagement_id: eng.id,
        vendor_id: vid,
        status: "pending",
      }))
      const { error: rfqError } = await db()
        .from("rfqs")
        .upsert(rfqRows, { onConflict: "engagement_id,vendor_id" })
      if (rfqError) throw rfqError
    }

    // 4. Insert approval request
    const { error: approvalError } = await db().from("approval_requests").insert({
      entity_type: "engagement",
      entity_id: eng.id,
      requested_by: created_by,
      amount: estimated_value ?? null,
      notes: null,
    })
    if (approvalError) throw approvalError

    // 5. Update engagement status to pending_approval
    const { error: statusError } = await db()
      .from("engagements")
      .update({ status: "pending_approval" })
      .eq("id", eng.id)
    if (statusError) throw statusError

    res.json({ data: eng })
  } catch (err: any) {
    console.error("[engagements/create]", err.message)
    res.status(500).json({ error: "Failed to create engagement" })
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
