import { Router, Request, Response } from "express"
import { getSupabaseAdmin } from "../utils/supabaseAdmin"
import { requireAuth, AuthenticatedRequest } from "../middleware/auth"
import { requireOrg, OrgScopedRequest } from "../middleware/org"
import { writeAudit, resolveActingAs } from "../services/audit"
import { gateOnCreate, isManagerOrAdmin, notifyUsers } from "../services/approvalGate"
import { attachTaxComponents, insertTaxComponents, sumTaxComponents } from "../services/taxComponents.service"

const router = Router()
function db(): any { return getSupabaseAdmin() }

// Attaches each Service Confirmation's line items' tax_components breakdown
// in place -- shared by /list and /get/create's final read.
async function attachTaxComponentsToSCs(scs: any[]): Promise<any[]> {
  const allLineItems = scs.flatMap((s) => s.line_items ?? [])
  if (allLineItems.length === 0) return scs
  const withComponents = await attachTaxComponents("service_confirmation", allLineItems)
  const byId = new Map(withComponents.map((li) => [li.id, li.tax_components]))
  for (const s of scs) {
    s.line_items = (s.line_items ?? []).map((li: any) => ({ ...li, tax_components: byId.get(li.id) ?? [] }))
  }
  return scs
}

// Structural mirror of grns.ts -- the services-equivalent of a Goods Receipt
// Note (confirming a contracted service was delivered, instead of recording
// received quantities of a physical good). Same status lifecycle, same
// Associate-creates/Manager-approves/Manager-verifies gate.

// POST /api/service-confirmations/list
router.post("/list", requireAuth, requireOrg, async (req: Request, res: Response) => {
  try {
    const { status, vendor_id, po_id } = req.body
    const { orgId } = req as OrgScopedRequest

    let query = db()
      .from("service_confirmations")
      .select("*, vendor:vendor_id(company_name), purchase_order:po_id(po_number), line_items:service_confirmation_line_items(*)")
      .eq("org_id", orgId)
      .order("created_at", { ascending: false })

    if (status) query = query.eq("status", status)
    if (vendor_id) query = query.eq("vendor_id", vendor_id)
    if (po_id) query = query.eq("po_id", po_id)

    const { data, error } = await query
    if (error) throw error
    await attachTaxComponentsToSCs(data ?? [])
    return res.json(data)
  } catch (err: any) {
    return res.status(500).json({ error: err.message || "Unexpected error" })
  }
})

// POST /api/service-confirmations/get
router.post("/get", requireAuth, requireOrg, async (req: Request, res: Response) => {
  try {
    const { id } = req.body
    const { orgId } = req as OrgScopedRequest
    if (!id) return res.status(400).json({ error: "Missing id" })

    const { data, error } = await db()
      .from("service_confirmations")
      .select("*, vendor:vendor_id(company_name), purchase_order:po_id(po_number), line_items:service_confirmation_line_items(*)")
      .eq("id", id)
      .eq("org_id", orgId)
      .single()

    if (error) throw error
    if (data) await attachTaxComponentsToSCs([data])
    return res.json(data)
  } catch (err: any) {
    return res.status(500).json({ error: err.message || "Unexpected error" })
  }
})

// POST /api/service-confirmations/create
router.post("/create", requireAuth, requireOrg, async (req: Request, res: Response) => {
  try {
    const { po_id, vendor_id, confirmed_date, notes, created_by, verified_by, line_items } = req.body
    const { orgId } = req as OrgScopedRequest
    if (!po_id || !vendor_id || !confirmed_date || !created_by || !Array.isArray(line_items)) {
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
        .from("service_confirmation_line_items")
        .select("po_line_item_id, quantity_confirmed, service_confirmation:service_confirmation_id(status)")
        .in("po_line_item_id", poLineItemIds)
      if (existingError) throw existingError

      const confirmedByLine = new Map<string, number>()
      for (const row of existingLines ?? []) {
        if (!row.po_line_item_id || row.service_confirmation?.status === "rejected") continue
        confirmedByLine.set(
          row.po_line_item_id,
          (confirmedByLine.get(row.po_line_item_id) ?? 0) + Number(row.quantity_confirmed)
        )
      }

      for (const item of line_items) {
        if (!item.po_line_item_id) continue
        const poLine = poLines?.find((p: any) => p.id === item.po_line_item_id)
        if (!poLine) continue

        const alreadyConfirmed = confirmedByLine.get(item.po_line_item_id) ?? 0
        const remaining = Number(poLine.quantity) - alreadyConfirmed
        if (Number(item.quantity_confirmed) > remaining + 1e-6) {
          return res.status(400).json({
            error: `Quantity for "${poLine.description}" exceeds remaining PO balance (${remaining} left)`,
          })
        }
      }
    }

    const { data: sc, error: scError } = await db()
      .from("service_confirmations")
      .insert({
        po_id, vendor_id, confirmed_date,
        notes:       notes       ?? null,
        created_by,
        verified_by: verified_by ?? null,
        org_id:      orgId,
        status: "pending_approval", // resolved to its real starting status just below
      })
      .select("id")
      .single()
    if (scError) throw scError
    const scId: string = sc.id

    // Associate-only creators need Manager/Admin sign-off before the
    // confirmation is even submitted; Manager/Admin/solo-mode creators skip
    // straight to submitted, same as before this gate existed (GRN).
    const actorId = (req as AuthenticatedRequest).user.id
    const { data: po } = await db().from("purchase_orders").select("po_number").eq("id", po_id).maybeSingle()
    const { gated } = await gateOnCreate({
      entityType: "service_confirmation",
      entityId: scId,
      requestedBy: actorId,
      orgId,
      entityLabel: "Service Confirmation",
      entityTitle: `Service Confirmation for PO ${po?.po_number ?? po_id}`,
      notifType: "service_confirmation_pending_approval",
    })
    if (!gated) {
      const { error: unlockError } = await db().from("service_confirmations").update({ status: "submitted" }).eq("id", scId)
      if (unlockError) throw unlockError
    }

    if (line_items.length > 0) {
      const { data: insertedItems, error: liError } = await db()
        .from("service_confirmation_line_items")
        .insert(
          line_items.map((item: any) => ({
            service_confirmation_id: scId,
            po_line_item_id:    item.po_line_item_id    ?? null,
            description:        item.description,
            quantity_confirmed: item.quantity_confirmed ?? null,
            unit_price:         item.unit_price         ?? null,
            tax_rate:           sumTaxComponents(item.tax_components, item.tax_rate ?? 0),
            unit:               item.unit               ?? null,
          }))
        )
        .select("id")
      if (liError) {
        await db().from("service_confirmations").delete().eq("id", scId)
        throw liError
      }

      await Promise.all(
        line_items.map((item: any, idx: number) => insertTaxComponents("service_confirmation", insertedItems[idx].id, item.tax_components))
      )
    }

    const { data: full, error: getError } = await db()
      .from("service_confirmations")
      .select("*, vendor:vendor_id(company_name), purchase_order:po_id(po_number), line_items:service_confirmation_line_items(*)")
      .eq("id", scId)
      .single()
    if (getError) throw getError

    await attachTaxComponentsToSCs([full])
    return res.json(full)
  } catch (err: any) {
    return res.status(500).json({ error: err.message || "Unexpected error" })
  }
})

// POST /api/service-confirmations/update-status
router.post("/update-status", requireAuth, async (req: Request, res: Response) => {
  try {
    const { id, status, notes, verified_by } = req.body
    if (!id || !status) return res.status(400).json({ error: "Missing id or status" })

    const { data: existing, error: getError } = await db()
      .from("service_confirmations")
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
        return res.status(403).json({ error: "You are not authorized to approve this Service Confirmation" })
      }
    }

    const update: Record<string, any> = { status, notes: notes ?? null }
    if (status === "verified") {
      update.verified_by = verified_by ?? null
      update.verified_at = new Date().toISOString()
    }

    const { data, error } = await db()
      .from("service_confirmations")
      .update(update)
      .eq("id", id)
      .select()
      .single()

    if (error) throw error

    if (existing.status !== status) {
      const userId = (req as AuthenticatedRequest).user.id
      await writeAudit({
        entityType: "service_confirmation",
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
    // notifies via approvals.ts's /review) -- the confirmation's creator
    // should hear about this outcome too.
    if (existing.status === "submitted" && (status === "verified" || status === "rejected") && existing.created_by) {
      await notifyUsers([existing.created_by], {
        type: "service_confirmation_decision",
        title: `Service Confirmation ${status}`,
        message: notes ? `Your Service Confirmation was ${status}: ${notes}` : `Your Service Confirmation was ${status}.`,
        moduleReferenceId: id,
      })
    }

    return res.json(data)
  } catch (err: any) {
    return res.status(500).json({ error: err.message || "Unexpected error" })
  }
})

export default router
