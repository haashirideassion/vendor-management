import { Router, Request, Response } from "express"
import { getSupabaseAdmin } from "../utils/supabaseAdmin"
import { requireAuth, AuthenticatedRequest } from "../middleware/auth"
import { requireOrg, OrgScopedRequest, resolveVendorId, resolveListScope } from "../middleware/org"
import { writeAudit, resolveActingAs } from "../services/audit"
import { resolveExchangeRateToBase } from "../services/exchangeRates.service"
import { attachTaxComponents, insertTaxComponents, sumTaxComponents } from "../services/taxComponents.service"

const router = Router()
function db(): any { return getSupabaseAdmin() }

// Attaches each PO's line items' tax_components breakdown in place -- shared
// by /list, /get, and /create's final read.
async function attachTaxComponentsToPOs(pos: any[]): Promise<any[]> {
  const allLineItems = pos.flatMap((p) => p.line_items ?? [])
  if (allLineItems.length === 0) return pos
  const withComponents = await attachTaxComponents("po", allLineItems)
  const byId = new Map(withComponents.map((li) => [li.id, li.tax_components]))
  for (const p of pos) {
    p.line_items = (p.line_items ?? []).map((li: any) => ({ ...li, tax_components: byId.get(li.id) ?? [] }))
  }
  return pos
}

// POST /api/purchase-orders/vendor-list-by-purchase-request — vendor-side
// lookup (e.g. VendorInvoices.tsx's "auto-linked PO" hint). Goes through the
// backend/resolveVendorId rather than a direct Supabase client query: the
// vendor-facing RLS policy on purchase_orders (007_procurement_schema.sql)
// still checks the legacy 1:1 vendors.profile_id, which is NULL for any
// multi-user vendor (e.g. admin-onboarded ones), so a direct client read
// would silently return nothing for that vendor's staff regardless of role.
router.post("/vendor-list-by-purchase-request", requireAuth, async (req: Request, res: Response) => {
  try {
    const { purchase_request_id } = req.body
    if (!purchase_request_id) return res.status(400).json({ error: "purchase_request_id is required" })

    const userId = (req as AuthenticatedRequest).user.id
    const vendorId = await resolveVendorId(userId)
    if (!vendorId) return res.json({ data: [] })

    const { data, error } = await db()
      .from("purchase_orders")
      .select("id, po_number")
      .eq("purchase_request_id", purchase_request_id)
      .eq("vendor_id", vendorId)

    if (error) throw error

    res.json({ data })
  } catch (err: any) {
    console.error("[purchase-orders/vendor-list-by-purchase-request]", err.message)
    res.status(500).json({ error: "Failed to look up linked purchase order" })
  }
})

// POST /api/purchase-orders/list — shared between internal staff and
// vendors (vendors see only their own POs), same resolveListScope pattern
// as invoices.ts.
router.post("/list", requireAuth, async (req: Request, res: Response) => {
  try {
    const { status, vendor_id, purchase_request_id, contract_id, po_type, parent_po_id } = req.body

    const scope = await resolveListScope(req)
    if ("error" in scope) return res.status(scope.error.status).json({ error: scope.error.message })

    let query = db()
      .from("purchase_orders")
      .select(
        "*, vendor:vendor_id(company_name, contact_name), purchase_request:purchase_request_id(title), parent_po:parent_po_id(po_number, total_value), line_items:po_line_items(*)"
      )
      .order("created_at", { ascending: false })

    if (scope.mode === "vendor") {
      query = query.eq("vendor_id", scope.vendorId)
      if (scope.allowedOrgIds !== null) query = query.in("org_id", scope.allowedOrgIds)
    } else {
      query = query.eq("org_id", scope.orgId)
      if (vendor_id) query = query.eq("vendor_id", vendor_id)
    }

    if (status) query = query.eq("status", status)
    if (purchase_request_id) query = query.eq("purchase_request_id", purchase_request_id)
    if (contract_id) query = query.eq("contract_id", contract_id)
    if (po_type) query = query.eq("po_type", po_type)
    if (parent_po_id) query = query.eq("parent_po_id", parent_po_id)

    const { data, error } = await query

    if (error) throw error
    await attachTaxComponentsToPOs(data ?? [])

    res.json({ data })
  } catch (err: any) {
    console.error("[purchase-orders/list]", err.message)
    res.status(500).json({ error: "Failed to list purchase orders" })
  }
})

// POST /api/purchase-orders/get — same vendor/org scoping as /list.
router.post("/get", requireAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.body
    if (!id) return res.status(400).json({ error: "id is required" })

    const scope = await resolveListScope(req)
    if ("error" in scope) return res.status(scope.error.status).json({ error: scope.error.message })

    const { data, error } = await db()
      .from("purchase_orders")
      .select(
        "*, vendor:vendor_id(company_name, contact_name), purchase_request:purchase_request_id(title), parent_po:parent_po_id(po_number, total_value), line_items:po_line_items(*)"
      )
      .eq("id", id)
      .single()

    if (error) throw error

    if (scope.mode === "org" ? data.org_id !== scope.orgId : data.vendor_id !== scope.vendorId) {
      return res.status(404).json({ error: "Purchase order not found" })
    }

    if (data) await attachTaxComponentsToPOs([data])

    res.json({ data })
  } catch (err: any) {
    console.error("[purchase-orders/get]", err.message)
    res.status(500).json({ error: "Failed to get purchase order" })
  }
})

// POST /api/purchase-orders/create
router.post("/create", requireAuth, requireOrg, async (req: Request, res: Response) => {
  try {
    const {
      purchase_request_id,
      vendor_id,
      total_value,
      currency,
      issue_date,
      expected_delivery_date,
      delivery_address,
      payment_terms,
      notes,
      line_items,
      created_by,
      status,
      po_type,
      parent_po_id,
      valid_from,
      valid_until,
    } = req.body
    const { orgId } = req as OrgScopedRequest

    if (!vendor_id || total_value === undefined || !created_by) {
      return res.status(400).json({ error: "vendor_id, total_value, and created_by are required" })
    }

    const poType: string = po_type ?? "standard"
    if (!["standard", "blanket", "release"].includes(poType)) {
      return res.status(400).json({ error: "po_type must be 'standard', 'blanket', or 'release'" })
    }

    // A Release Order draws down from a Blanket PO -- validated in full here
    // (not just a DB FK) since none of this is expressible as a simple
    // constraint: the parent must actually BE a blanket, still active and
    // within its validity window, for the same vendor/currency, with enough
    // remaining balance for this release.
    if (poType === "release") {
      if (!parent_po_id) return res.status(400).json({ error: "parent_po_id is required for a release order" })

      const { data: parent, error: parentError } = await db()
        .from("purchase_orders")
        .select("id, po_type, status, vendor_id, currency, total_value, valid_from, valid_until, org_id")
        .eq("id", parent_po_id)
        .eq("org_id", orgId)
        .maybeSingle()
      if (parentError) throw parentError
      if (!parent) return res.status(404).json({ error: "Blanket PO not found" })
      if (parent.po_type !== "blanket") return res.status(400).json({ error: "parent_po_id does not refer to a Blanket PO" })
      if (parent.status !== "issued") return res.status(400).json({ error: "This Blanket PO is not active" })
      if (parent.vendor_id !== vendor_id) return res.status(400).json({ error: "A release order's vendor must match its Blanket PO's vendor" })
      if (currency && parent.currency && currency !== parent.currency) {
        return res.status(400).json({ error: "A release order's currency must match its Blanket PO's currency" })
      }

      const today = new Date().toISOString().split("T")[0]
      if (parent.valid_from && today < parent.valid_from) {
        return res.status(400).json({ error: "This Blanket PO is not yet within its validity period" })
      }
      if (parent.valid_until && today > parent.valid_until) {
        return res.status(400).json({ error: "This Blanket PO's validity period has ended" })
      }

      const { data: siblingReleases, error: siblingError } = await db()
        .from("purchase_orders")
        .select("total_value")
        .eq("parent_po_id", parent_po_id)
        .neq("status", "cancelled")
      if (siblingError) throw siblingError
      const alreadyDrawn = (siblingReleases ?? []).reduce((sum: number, r: any) => sum + Number(r.total_value), 0)
      const remaining = Number(parent.total_value) - alreadyDrawn
      if (Number(total_value) > remaining + 1e-6) {
        return res.status(400).json({ error: `This release exceeds the Blanket PO's remaining balance (${remaining.toFixed(2)} left)` })
      }
    } else if (parent_po_id) {
      return res.status(400).json({ error: "parent_po_id is only valid for a release order" })
    }

    // "Send Purchase Order" (the only creation flow in the UI) issues the PO
    // immediately — there's no separate draft-approval step to go through.
    // A Blanket PO is likewise "active" the moment it's created -- 'issued'
    // doubles as its active state (there's no separate blanket-specific
    // status; 'partially_received'/'fully_received' simply never apply to
    // it, and 'cancelled'/'closed' still mean what they already mean).
    const poStatus = status ?? "issued"

    // fulfillment_type decides which delivery-confirmation flow applies to
    // this PO (Record GRN vs. Record Service Confirmation) -- derived from
    // the purchase request's category and fixed at creation time (migration
    // 072), not re-derived on every read, so a later category
    // reclassification doesn't retroactively change how an already-issued
    // PO is handled.
    let fulfillmentType = "service"
    if (purchase_request_id) {
      const { data: pr } = await db()
        .from("purchase_requests")
        .select("category:category_id(fulfillment_type)")
        .eq("id", purchase_request_id)
        .maybeSingle()
      if (pr?.category?.fulfillment_type) fulfillmentType = pr.category.fulfillment_type
    }

    // Snapshotted at creation time -- reused below for the audit trail; no
    // approval-gate call exists for POs today so there's no second
    // consumer to share it with yet.
    let exchangeRateToBase: number
    try {
      exchangeRateToBase = await resolveExchangeRateToBase(orgId, currency)
    } catch (fxErr: any) {
      return res.status(502).json({ error: fxErr.message || "Unable to fetch exchange rate. Please try again." })
    }

    const { data: po, error: poError } = await db()
      .from("purchase_orders")
      .insert({
        purchase_request_id:    purchase_request_id    ?? null,
        vendor_id,
        total_value,
        currency:               currency               ?? null,
        issue_date:             issue_date ?? (poStatus === "draft" ? null : new Date().toISOString().split("T")[0]),
        expected_delivery_date: expected_delivery_date ?? null,
        delivery_address:       delivery_address       ?? null,
        payment_terms:          payment_terms          ?? null,
        notes:                  notes                  ?? null,
        created_by,
        org_id:                 orgId,
        status: poStatus,
        fulfillment_type: fulfillmentType,
        po_type:      poType,
        parent_po_id: poType === "release" ? parent_po_id : null,
        valid_from:   poType === "blanket" ? (valid_from  ?? null) : null,
        valid_until:  poType === "blanket" ? (valid_until ?? null) : null,
        exchange_rate_to_base: exchangeRateToBase,
      })
      .select("id")
      .single()
    if (poError) throw poError
    const poId: string = po.id

    if (Array.isArray(line_items) && line_items.length > 0) {
      const { data: insertedItems, error: liError } = await db()
        .from("po_line_items")
        .insert(
          line_items.map((item: any) => ({
            po_id:       poId,
            description: item.description,
            quantity:    item.quantity   ?? null,
            unit_price:  item.unit_price ?? null,
            tax_rate:    sumTaxComponents(item.tax_components, item.tax_rate ?? 0),
            unit:        item.unit       ?? null,
          }))
        )
        .select("id")
      if (liError) {
        await db().from("purchase_orders").delete().eq("id", poId)
        throw liError
      }

      await Promise.all(
        line_items.map((item: any, idx: number) => insertTaxComponents("po", insertedItems[idx].id, item.tax_components))
      )
    }

    const { data: full, error: getError } = await db()
      .from("purchase_orders")
      .select("*, vendor:vendor_id(company_name, contact_name), purchase_request:purchase_request_id(title), parent_po:parent_po_id(po_number, total_value), line_items:po_line_items(*)")
      .eq("id", poId)
      .single()
    if (getError) throw getError

    await attachTaxComponentsToPOs([full])
    res.json({ data: full })
  } catch (err: any) {
    console.error("[purchase-orders/create]", err.message)
    res.status(500).json({ error: err.message || "Failed to create purchase order" })
  }
})

// POST /api/purchase-orders/issue
router.post("/issue", requireAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.body
    if (!id) return res.status(400).json({ error: "id is required" })

    const { data: existing, error: getError } = await db()
      .from("purchase_orders")
      .select("status, org_id")
      .eq("id", id)
      .single()
    if (getError) throw getError

    const { data, error } = await db()
      .from("purchase_orders")
      .update({ status: "issued", issue_date: new Date().toISOString().split("T")[0] })
      .eq("id", id)
      .select()
      .single()

    if (error) throw error

    if (existing.status !== "issued") {
      const userId = (req as AuthenticatedRequest).user.id
      await writeAudit({
        entityType: "purchase_order",
        entityId: id,
        action: "status_changed",
        oldValue: { status: existing.status },
        newValue: { status: "issued" },
        performedBy: userId,
        orgId: existing.org_id,
        actingAs: await resolveActingAs(userId, existing.org_id),
      })
    }

    res.json({ data })
  } catch (err: any) {
    console.error("[purchase-orders/issue]", err.message)
    res.status(500).json({ error: "Failed to issue purchase order" })
  }
})

// POST /api/purchase-orders/update-status
router.post("/update-status", requireAuth, async (req: Request, res: Response) => {
  try {
    const { id, status } = req.body
    if (!id || !status) return res.status(400).json({ error: "id and status are required" })

    const { data: existing, error: getError } = await db()
      .from("purchase_orders")
      .select("status, org_id")
      .eq("id", id)
      .single()
    if (getError) throw getError

    const { data, error } = await db()
      .from("purchase_orders")
      .update({ status })
      .eq("id", id)
      .select()
      .single()

    if (error) throw error

    if (existing.status !== status) {
      const userId = (req as AuthenticatedRequest).user.id
      await writeAudit({
        entityType: "purchase_order",
        entityId: id,
        action: "status_changed",
        oldValue: { status: existing.status },
        newValue: { status },
        performedBy: userId,
        orgId: existing.org_id,
        actingAs: await resolveActingAs(userId, existing.org_id),
      })
    }

    res.json({ data })
  } catch (err: any) {
    console.error("[purchase-orders/update-status]", err.message)
    res.status(500).json({ error: "Failed to update purchase order status" })
  }
})

export default router
