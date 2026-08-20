import { Router, Request, Response } from "express"
import { getSupabaseAdmin } from "../utils/supabaseAdmin"
import { requireAuth, AuthenticatedRequest } from "../middleware/auth"
import { requireOrg, OrgScopedRequest } from "../middleware/org"
import { gateOnCreate, isManagerOrAdmin } from "../services/approvalGate"

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

// POST /api/categories/create — { name, description? }. Categories are a
// platform-wide taxonomy (no org_id on the row itself), but the creating
// user is always acting from some org (X-Org-Id) -- that org's Managers/
// Admins are who get gated on and notified, same shared rule as
// Purchase Requests/Contracts/GRNs.
router.post("/create", requireAuth, requireOrg, async (req: Request, res: Response) => {
  try {
    const { name, description, fulfillment_type } = req.body
    if (!name) return res.status(400).json({ error: "name is required" })
    if (fulfillment_type && !["goods", "service"].includes(fulfillment_type)) {
      return res.status(400).json({ error: "fulfillment_type must be 'goods' or 'service'" })
    }
    const { orgId } = req as OrgScopedRequest

    const { data: inserted, error } = await db()
      .from("service_categories")
      .insert({
        name, description: description ?? null, is_active: false, status: "pending_approval",
        fulfillment_type: fulfillment_type ?? "service",
      })
      .select("id")
      .single()
    if (error) throw error

    const actorId = (req as AuthenticatedRequest).user.id
    const { gated } = await gateOnCreate({
      entityType: "category",
      entityId: inserted.id,
      requestedBy: actorId,
      orgId,
      entityLabel: "Category",
      entityTitle: name,
      notifType: "category_pending_approval",
    })
    if (!gated) {
      const { error: unlockError } = await db()
        .from("service_categories")
        .update({ status: "active", is_active: true })
        .eq("id", inserted.id)
      if (unlockError) throw unlockError
    }

    const { data, error: getError } = await db().from("service_categories").select("*").eq("id", inserted.id).single()
    if (getError) throw getError

    res.json({ data })
  } catch (err: any) {
    console.error("[categories/create]", err.message)
    res.status(500).json({ error: "Failed to create category" })
  }
})

// POST /api/categories/update — { id, ...fields }
router.post("/update", requireAuth, requireOrg, async (req: Request, res: Response) => {
  try {
    const { id, ...fields } = req.body
    if (!id) return res.status(400).json({ error: "id is required" })
    const { orgId } = req as OrgScopedRequest

    // The pending_approval -> active transition is the Manager/Admin
    // approval gate itself (gateOnCreate, approvalGate.ts) -- only they may
    // resolve it. Every other field edit is unchanged, no new restriction.
    if (fields.status === "active") {
      const { data: existing, error: existingError } = await db()
        .from("service_categories")
        .select("status")
        .eq("id", id)
        .single()
      if (existingError) throw existingError
      if (existing.status === "pending_approval") {
        const actorId = (req as AuthenticatedRequest).user.id
        if (!(await isManagerOrAdmin(actorId, orgId))) {
          return res.status(403).json({ error: "You are not authorized to approve this category" })
        }
        fields.is_active = true
      }
    }

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
