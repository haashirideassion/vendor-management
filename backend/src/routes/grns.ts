import { Router, Request, Response } from "express"
import { getSupabaseAdmin } from "../utils/supabaseAdmin"
import { requireAuth, AuthenticatedRequest } from "../middleware/auth"
import { requireOrg, OrgScopedRequest } from "../middleware/org"
import { writeAudit, resolveActingAs } from "../services/audit"
import { gateOnCreate, isManagerOrAdmin, notifyUsers } from "../services/approvalGate"

const router = Router()
function db(): any { return getSupabaseAdmin() }

// POST /api/grns/list
router.post("/list", requireAuth, requireOrg, async (req: Request, res: Response) => {
  try {
    const { status, vendor_id, po_id } = req.body
    const { orgId } = req as OrgScopedRequest

    let query = db()
      .from("grns")
      .select("*, vendor:vendor_id(company_name), purchase_order:po_id(po_number), line_items:grn_line_items(*)")
      .eq("org_id", orgId)
      .order("created_at", { ascending: false })

    if (status) query = query.eq("status", status)
    if (vendor_id) query = query.eq("vendor_id", vendor_id)
    if (po_id) query = query.eq("po_id", po_id)

    const { data, error } = await query
    if (error) throw error
    return res.json(data)
  } catch (err: any) {
    return res.status(500).json({ error: err.message || "Unexpected error" })
  }
})

// POST /api/grns/get
router.post("/get", requireAuth, requireOrg, async (req: Request, res: Response) => {
  try {
    const { id } = req.body
    const { orgId } = req as OrgScopedRequest
    if (!id) return res.status(400).json({ error: "Missing id" })

    const { data, error } = await db()
      .from("grns")
      .select("*, vendor:vendor_id(company_name), purchase_order:po_id(po_number), line_items:grn_line_items(*)")
      .eq("id", id)
      .eq("org_id", orgId)
      .single()

    if (error) throw error
    return res.json(data)
  } catch (err: any) {
    return res.status(500).json({ error: err.message || "Unexpected error" })
  }
})

// POST /api/grns/create
router.post("/create", requireAuth, requireOrg, async (req: Request, res: Response) => {
  try {
    const { po_id, vendor_id, received_date, notes, created_by, verified_by, line_items } = req.body
    const { orgId } = req as OrgScopedRequest
    if (!po_id || !vendor_id || !received_date || !created_by || !Array.isArray(line_items)) {
      return res.status(400).json({ error: "Missing required fields" })
    }

    const poLineItemIds: string[] = line_items
      .map((item: any) => item.po_line_item_id)
      .filter(Boolean)

    if (poLineItemIds.length > 0) {
      const { data: poLines, error: poLinesError } = await db()
        .from("po_line_items")
        .select("id, quantity, description")
        .in("id", poLineItemIds)
      if (poLinesError) throw poLinesError

      const { data: existingLines, error: existingError } = await db()
        .from("grn_line_items")
        .select("po_line_item_id, quantity_received, grn:grn_id(status)")
        .in("po_line_item_id", poLineItemIds)
      if (existingError) throw existingError

      const receivedByLine = new Map<string, number>()
      for (const row of existingLines ?? []) {
        if (!row.po_line_item_id || row.grn?.status === "rejected") continue
        receivedByLine.set(
          row.po_line_item_id,
          (receivedByLine.get(row.po_line_item_id) ?? 0) + Number(row.quantity_received)
        )
      }

      for (const item of line_items) {
        if (!item.po_line_item_id) continue
        const poLine = poLines?.find((p: any) => p.id === item.po_line_item_id)
        if (!poLine) continue

        const alreadyReceived = receivedByLine.get(item.po_line_item_id) ?? 0
        const remaining = Number(poLine.quantity) - alreadyReceived
        if (Number(item.quantity_received) > remaining + 1e-6) {
          return res.status(400).json({
            error: `Quantity for "${poLine.description}" exceeds remaining PO balance (${remaining} left)`,
          })
        }
      }
    }

    const { data: grn, error: grnError } = await db()
      .from("grns")
      .insert({
        po_id, vendor_id, received_date,
        notes:       notes       ?? null,
        created_by,
        verified_by: verified_by ?? null,
        org_id:      orgId,
        status: "pending_approval", // resolved to its real starting status just below
      })
      .select("id")
      .single()
    if (grnError) throw grnError
    const grnId: string = grn.id

    // Associate-only creators need Manager/Admin sign-off before the GRN is
    // even submitted; Manager/Admin/solo-mode creators skip straight to
    // submitted, same as before this gate existed.
    const actorId = (req as AuthenticatedRequest).user.id
    const { data: po } = await db().from("purchase_orders").select("po_number").eq("id", po_id).maybeSingle()
    const { gated } = await gateOnCreate({
      entityType: "grn",
      entityId: grnId,
      requestedBy: actorId,
      orgId,
      entityLabel: "GRN",
      entityTitle: `GRN for PO ${po?.po_number ?? po_id}`,
      notifType: "grn_pending_approval",
    })
    if (!gated) {
      const { error: unlockError } = await db().from("grns").update({ status: "submitted" }).eq("id", grnId)
      if (unlockError) throw unlockError
    }

    if (line_items.length > 0) {
      const { error: liError } = await db()
        .from("grn_line_items")
        .insert(
          line_items.map((item: any) => ({
            grn_id:            grnId,
            po_line_item_id:   item.po_line_item_id   ?? null,
            description:       item.description,
            quantity_received: item.quantity_received  ?? null,
            unit_price:        item.unit_price         ?? null,
            tax_rate:          item.tax_rate           ?? 0,
            unit:              item.unit               ?? null,
          }))
        )
      if (liError) {
        await db().from("grns").delete().eq("id", grnId)
        throw liError
      }
    }

    const { data: full, error: getError } = await db()
      .from("grns")
      .select("*, vendor:vendor_id(company_name), purchase_order:po_id(po_number), line_items:grn_line_items(*)")
      .eq("id", grnId)
      .single()
    if (getError) throw getError

    return res.json(full)
  } catch (err: any) {
    return res.status(500).json({ error: err.message || "Unexpected error" })
  }
})

// POST /api/grns/update-status
router.post("/update-status", requireAuth, async (req: Request, res: Response) => {
  try {
    const { id, status, notes, verified_by } = req.body
    if (!id || !status) return res.status(400).json({ error: "Missing id or status" })

    const { data: existing, error: getError } = await db()
      .from("grns")
      .select("status, org_id, created_by, po_id")
      .eq("id", id)
      .single()
    if (getError) throw getError

    // The pending_approval -> submitted transition is the Manager/Admin
    // approval gate itself (gateOnCreate, approvalGate.ts) -- only they may
    // resolve it.
    if (existing.status === "pending_approval" && status === "submitted") {
      const actorId = (req as AuthenticatedRequest).user.id
      if (!(await isManagerOrAdmin(actorId, existing.org_id))) {
        return res.status(403).json({ error: "You are not authorized to approve this GRN" })
      }
    }

    const update: Record<string, any> = { status, notes: notes ?? null }
    if (status === "verified") {
      update.verified_by = verified_by ?? null
      update.verified_at = new Date().toISOString()
    }

    const { data, error } = await db()
      .from("grns")
      .update(update)
      .eq("id", id)
      .select()
      .single()

    if (error) throw error

    if (existing.status !== status) {
      const userId = (req as AuthenticatedRequest).user.id
      await writeAudit({
        entityType: "grn",
        entityId: id,
        action: "status_changed",
        oldValue: { status: existing.status },
        newValue: { status },
        performedBy: userId,
        orgId: existing.org_id,
        actingAs: await resolveActingAs(userId, existing.org_id),
      })
    }

    // The verify/reject step (submitted -> verified/rejected) is a separate
    // business decision from the pending_approval gate (which already
    // notifies via approvals.ts's /review) -- the GRN's creator should hear
    // about this outcome too.
    if (existing.status === "submitted" && (status === "verified" || status === "rejected") && existing.created_by) {
      await notifyUsers([existing.created_by], {
        type: "grn_decision",
        title: `GRN ${status}`,
        message: notes ? `Your GRN was ${status}: ${notes}` : `Your GRN was ${status}.`,
        moduleReferenceId: id,
      })
    }

    return res.json(data)
  } catch (err: any) {
    return res.status(500).json({ error: err.message || "Unexpected error" })
  }
})

export default router
