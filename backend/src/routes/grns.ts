import { Router, Request, Response } from "express"
import { getSupabaseAdmin } from "../utils/supabaseAdmin"
import { requireAuth, AuthenticatedRequest } from "../middleware/auth"
import { requireOrg, OrgScopedRequest } from "../middleware/org"
import { writeAudit, resolveActingAs } from "../services/audit"
import { gateOnCreate, isManagerOrAdmin, notifyUsers, findActiveVendorUserIds } from "../services/approvalGate"
import { attachTaxComponents, insertTaxComponents, sumTaxComponents } from "../services/taxComponents.service"

const router = Router()
function db(): any { return getSupabaseAdmin() }

// Attaches each GRN's line items' tax_components breakdown in place --
// shared by /list and /get/create's final read.
async function attachTaxComponentsToGrns(grns: any[]): Promise<any[]> {
  const allLineItems = grns.flatMap((g) => g.line_items ?? [])
  if (allLineItems.length === 0) return grns
  const withComponents = await attachTaxComponents("grn", allLineItems)
  const byId = new Map(withComponents.map((li) => [li.id, li.tax_components]))
  for (const g of grns) {
    g.line_items = (g.line_items ?? []).map((li: any) => ({ ...li, tax_components: byId.get(li.id) ?? [] }))
  }
  return grns
}

// POST /api/grns/list
router.post("/list", requireAuth, requireOrg, async (req: Request, res: Response) => {
  try {
    const { status, vendor_id, po_id } = req.body
    const { orgId } = req as OrgScopedRequest

    let query = db()
      .from("grns")
      .select("*, vendor:vendor_id(company_name), purchase_order:po_id(po_number), team:team_id(name), line_items:grn_line_items(*)")
      .eq("org_id", orgId)
      .order("created_at", { ascending: false })

    if (status) query = query.eq("status", status)
    if (vendor_id) query = query.eq("vendor_id", vendor_id)
    if (po_id) query = query.eq("po_id", po_id)

    const { data, error } = await query
    if (error) throw error
    await attachTaxComponentsToGrns(data ?? [])
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
      .select("*, vendor:vendor_id(company_name), purchase_order:po_id(po_number), team:team_id(name), line_items:grn_line_items(*)")
      .eq("id", id)
      .eq("org_id", orgId)
      .single()

    if (error) throw error
    if (data) await attachTaxComponentsToGrns([data])
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

    // team_id is denormalized forward from the PO (itself denormalized
    // forward from the purchase request) at creation time, same as
    // fulfillment_type is for POs -- optional, so a PO with no team simply
    // yields a GRN with no team.
    const { data: po } = await db().from("purchase_orders").select("po_number, team_id").eq("id", po_id).maybeSingle()

    const { data: grn, error: grnError } = await db()
      .from("grns")
      .insert({
        po_id, vendor_id, received_date,
        notes:       notes       ?? null,
        created_by,
        verified_by: verified_by ?? null,
        org_id:      orgId,
        team_id:     po?.team_id ?? null,
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
      const { data: insertedItems, error: liError } = await db()
        .from("grn_line_items")
        .insert(
          line_items.map((item: any) => ({
            grn_id:            grnId,
            po_line_item_id:   item.po_line_item_id   ?? null,
            description:       item.description,
            quantity_received: item.quantity_received  ?? null,
            unit_price:        item.unit_price         ?? null,
            tax_rate:          sumTaxComponents(item.tax_components, item.tax_rate ?? 0),
            unit:              item.unit               ?? null,
          }))
        )
        .select("id")
      if (liError) {
        await db().from("grns").delete().eq("id", grnId)
        throw liError
      }

      await Promise.all(
        line_items.map((item: any, idx: number) => insertTaxComponents("grn", insertedItems[idx].id, item.tax_components))
      )
    }

    const { data: full, error: getError } = await db()
      .from("grns")
      .select("*, vendor:vendor_id(company_name), purchase_order:po_id(po_number), team:team_id(name), line_items:grn_line_items(*)")
      .eq("id", grnId)
      .single()
    if (getError) throw getError

    await attachTaxComponentsToGrns([full])
    return res.json(full)
  } catch (err: any) {
    return res.status(500).json({ error: err.message || "Unexpected error" })
  }
})

const GRN_STATUS_VALUES = ["pending_approval", "draft", "submitted", "verified", "rejected"]

// Reject must say which line items and how much of each was rejected, and
// why -- a bare free-text reason on the whole GRN left the vendor with no
// idea what to actually fix. Verify must be an affirmative "I checked, it's
// all in good condition," not just a click.
function validateGrnDecision(status: string, line_items: any, confirmed_good_condition: any): string | null {
  if (status === "rejected") {
    if (!Array.isArray(line_items) || line_items.length === 0) {
      return "At least one rejected line item is required"
    }
    for (const li of line_items) {
      if (!li.id || !(Number(li.rejected_quantity) > 0) || !String(li.rejection_reason ?? "").trim()) {
        return "Each rejected line item needs a quantity greater than 0 and a reason"
      }
    }
  }
  if (status === "verified" && confirmed_good_condition !== true) {
    return "You must confirm the received goods are in good condition before verifying"
  }
  return null
}

// POST /api/grns/update-status
router.post("/update-status", requireAuth, async (req: Request, res: Response) => {
  try {
    const { id, status, notes, line_items, confirmed_good_condition } = req.body
    if (!id || !status) return res.status(400).json({ error: "Missing id or status" })
    if (!GRN_STATUS_VALUES.includes(status)) {
      return res.status(400).json({ error: `status must be one of: ${GRN_STATUS_VALUES.join(", ")}` })
    }
    const validationError = validateGrnDecision(status, line_items, confirmed_good_condition)
    if (validationError) return res.status(400).json({ error: validationError })

    const { data: existing, error: getError } = await db()
      .from("grns")
      .select("status, org_id, created_by, po_id, vendor_id")
      .eq("id", id)
      .single()
    if (getError) throw getError

    // Every transition on this record -- not just the pending_approval ->
    // submitted approval-gate hop -- is an internal Manager/Admin decision
    // about the receiving org's own GRN.
    const actorId = (req as AuthenticatedRequest).user.id
    if (!(await isManagerOrAdmin(actorId, existing.org_id))) {
      return res.status(403).json({ error: "You are not authorized to change this GRN's status" })
    }

    const update: Record<string, any> = { status, notes: notes ?? null }
    if (status === "verified") {
      update.verified_by = actorId
      update.verified_at = new Date().toISOString()
    }

    const { data, error } = await db()
      .from("grns")
      .update(update)
      .eq("id", id)
      .select()
      .single()

    if (error) throw error

    if (status === "rejected") {
      // Scoped to this GRN's own line items -- a line id from another
      // record can't be targeted through this endpoint.
      await Promise.all(
        (line_items as { id: string; rejected_quantity: number; rejection_reason: string }[]).map((li) =>
          db()
            .from("grn_line_items")
            .update({ rejected_quantity: li.rejected_quantity, rejection_reason: li.rejection_reason.trim() })
            .eq("id", li.id)
            .eq("grn_id", id)
        )
      )
    }

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

      // Until now the vendor had NO visibility into whether their delivered
      // goods were ever received -- notify their whole active team so they
      // learn about it here instead of only finding out indirectly later,
      // e.g. when an invoice they submit does or doesn't clear the 3-way match.
      if (existing.vendor_id) {
        const vendorUserIds = await findActiveVendorUserIds(existing.vendor_id)
        await notifyUsers(vendorUserIds, {
          type: "grn_decision",
          title: status === "verified" ? "Delivery Verified" : "Delivery Rejected",
          message: status === "verified"
            ? "The organisation has verified receipt of your delivered goods."
            : (notes ? `The organisation rejected your delivery: ${notes}` : "The organisation rejected your delivery."),
          moduleReferenceId: id,
        })
      }
    }

    return res.json(data)
  } catch (err: any) {
    return res.status(500).json({ error: err.message || "Unexpected error" })
  }
})

export default router
