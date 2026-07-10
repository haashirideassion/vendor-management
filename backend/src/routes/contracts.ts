import { Router, Request, Response } from "express"
import { getSupabaseAdmin } from "../utils/supabaseAdmin"
import { requireAuth, AuthenticatedRequest } from "../middleware/auth"
import { getDefaultOrgId } from "../utils/org"

const router = Router()
function db(): any { return getSupabaseAdmin() }

// POST /api/contracts/list
router.post("/list", requireAuth, async (req: Request, res: Response) => {
  try {
    const { vendor_id, contract_type, status } = req.body

    let query = db()
      .from("contracts")
      .select(
        "*, vendor:vendor_id(company_name, contact_name), parent:parent_id(contract_ref, title), amendments:contract_amendments(*)"
      )
      .order("created_at", { ascending: false })

    if (vendor_id) query = query.eq("vendor_id", vendor_id)
    if (contract_type) query = query.eq("contract_type", contract_type)
    if (status) query = query.eq("status", status)

    const { data, error } = await query

    if (error) throw error

    res.json({ data })
  } catch (err: any) {
    console.error("[contracts/list]", err.message)
    res.status(500).json({ error: "Failed to list contracts" })
  }
})

// POST /api/contracts/get
router.post("/get", requireAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.body
    if (!id) return res.status(400).json({ error: "id is required" })

    const { data, error } = await db()
      .from("contracts")
      .select(
        "*, vendor:vendor_id(company_name, contact_name), parent:parent_id(contract_ref, title), amendments:contract_amendments(*)"
      )
      .eq("id", id)
      .single()

    if (error) throw error

    res.json({ data })
  } catch (err: any) {
    console.error("[contracts/get]", err.message)
    res.status(500).json({ error: "Failed to get contract" })
  }
})

// POST /api/contracts/create
router.post("/create", requireAuth, async (req: Request, res: Response) => {
  try {
    const {
      vendor_id,
      contract_type,
      title,
      parent_id,
      effective_date,
      expiry_date,
      total_value,
      currency,
      auto_renew,
      renewal_notice_days,
      notes,
      created_by,
    } = req.body

    if (!vendor_id || !contract_type || !title || !effective_date || !expiry_date || total_value === undefined || !created_by) {
      return res.status(400).json({
        error: "vendor_id, contract_type, title, effective_date, expiry_date, total_value, and created_by are required",
      })
    }

    const orgId = await getDefaultOrgId()

    const payload: any = {
      vendor_id,
      contract_type,
      title,
      effective_date,
      expiry_date,
      total_value,
      created_by,
      org_id: orgId,
      status: "draft",
    }
    if (parent_id !== undefined) payload.parent_id = parent_id
    if (currency !== undefined) payload.currency = currency
    if (auto_renew !== undefined) payload.auto_renew = auto_renew
    if (renewal_notice_days !== undefined) payload.renewal_notice_days = renewal_notice_days
    if (notes !== undefined) payload.notes = notes

    const { data, error } = await db()
      .from("contracts")
      .insert(payload)
      .select()
      .single()

    if (error) throw error

    res.json({ data })
  } catch (err: any) {
    console.error("[contracts/create]", err.message)
    res.status(500).json({ error: "Failed to create contract" })
  }
})

// POST /api/contracts/update-status
router.post("/update-status", requireAuth, async (req: Request, res: Response) => {
  try {
    const { id, status } = req.body
    if (!id || !status) return res.status(400).json({ error: "id and status are required" })

    const { data, error } = await db()
      .from("contracts")
      .update({ status })
      .eq("id", id)
      .select()
      .single()

    if (error) throw error

    res.json({ data })
  } catch (err: any) {
    console.error("[contracts/update-status]", err.message)
    res.status(500).json({ error: "Failed to update contract status" })
  }
})

// POST /api/contracts/update
router.post("/update", requireAuth, async (req: Request, res: Response) => {
  try {
    const { id, ...fields } = req.body
    if (!id) return res.status(400).json({ error: "id is required" })

    const { data, error } = await db()
      .from("contracts")
      .update(fields)
      .eq("id", id)
      .select()
      .single()

    if (error) throw error

    res.json({ data })
  } catch (err: any) {
    console.error("[contracts/update]", err.message)
    res.status(500).json({ error: "Failed to update contract" })
  }
})

// POST /api/contracts/mark-signed
router.post("/mark-signed", requireAuth, async (req: Request, res: Response) => {
  try {
    const { id, signed_by_vendor, signed_by_internal } = req.body
    if (!id) return res.status(400).json({ error: "id is required" })

    const { error: rpcError } = await db().rpc("mark_contract_signed", {
      p_contract_id:       id,
      p_signed_by_vendor:   signed_by_vendor   ?? null,
      p_signed_by_internal: signed_by_internal ?? null,
    })
    if (rpcError) throw rpcError

    const { data, error } = await db()
      .from("contracts")
      .select("*, vendor:vendor_id(company_name, contact_name), parent:parent_id(contract_ref, title), amendments:contract_amendments(*)")
      .eq("id", id)
      .single()
    if (error) throw error

    res.json({ data })
  } catch (err: any) {
    console.error("[contracts/mark-signed]", err.message)
    res.status(500).json({ error: err.message || "Failed to mark contract as signed" })
  }
})

// POST /api/contracts/add-amendment
router.post("/add-amendment", requireAuth, async (req: Request, res: Response) => {
  try {
    const { contract_id, title, description, effective_date, created_by } = req.body

    if (!contract_id || !title || !created_by) {
      return res.status(400).json({
        error: "contract_id, title, and created_by are required",
      })
    }

    const { data: amendmentId, error: rpcError } = await db().rpc("add_contract_amendment", {
      p_contract_id:    contract_id,
      p_title:          title,
      p_description:    description    ?? null,
      p_effective_date: effective_date ?? null,
      p_created_by:     created_by,
    })
    if (rpcError) throw rpcError

    const { data, error } = await db()
      .from("contract_amendments")
      .select("*")
      .eq("id", amendmentId)
      .single()
    if (error) throw error

    res.json({ data })
  } catch (err: any) {
    console.error("[contracts/add-amendment]", err.message)
    res.status(500).json({ error: err.message || "Failed to add contract amendment" })
  }
})

export default router
