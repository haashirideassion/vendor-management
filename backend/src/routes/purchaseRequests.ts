import { Router, Request, Response } from "express"
import { getSupabaseAdmin } from "../utils/supabaseAdmin"
import { requireAuth, AuthenticatedRequest } from "../middleware/auth"
import { requireOrg, OrgScopedRequest, resolveListScope } from "../middleware/org"
import { writeAudit, resolveActingAs } from "../services/audit"
import { gateOnCreate, isManagerOrAdmin } from "../services/approvalGate"
import { resolveExchangeRateToBase } from "../services/exchangeRates.service"

const router = Router()
function db(): any { return getSupabaseAdmin() }

// POST /api/purchase-requests/list — shared between internal staff and
// vendors (vendor dashboard/detail pages fetch their own purchase requests
// this way too).
router.post("/list", requireAuth, async (req: Request, res: Response) => {
  try {
    const { status, vendor_id, search } = req.body

    const scope = await resolveListScope(req)
    if ("error" in scope) return res.status(scope.error.status).json({ error: scope.error.message })

    let query = db()
      .from("purchase_requests")
      .select(
        "*, vendor:vendor_id(company_name, contact_name), category:category_id(name), creator:created_by(full_name, email), line_items:purchase_request_line_items(*), purchase_request_vendors(vendor:vendor_id(id, company_name))"
      )
      .order("created_at", { ascending: false })

    if (scope.mode === "vendor") {
      const { data: invited } = await db()
        .from("purchase_request_vendors")
        .select("purchase_request_id")
        .eq("vendor_id", scope.vendorId)
      const invitedIds = (invited ?? []).map((r: any) => r.purchase_request_id)
      query = invitedIds.length > 0
        ? query.or(`vendor_id.eq.${scope.vendorId},id.in.(${invitedIds.join(",")})`)
        : query.eq("vendor_id", scope.vendorId)
      // Vendor Associate client-assignment restriction (Phase 3.5/3.6): null
      // means unrestricted (Admin/Manager or no assignment rows exist for a
      // restricted role), an array (possibly empty) restricts to exactly
      // those orgs.
      if (scope.allowedOrgIds !== null) query = query.in("org_id", scope.allowedOrgIds)
    } else {
      query = query.eq("org_id", scope.orgId)
      if (vendor_id) query = query.eq("vendor_id", vendor_id)
    }

    if (status) query = query.eq("status", status)
    if (search) query = query.ilike("title", `%${search}%`)

    const { data, error } = await query

    if (error) throw error

    res.json({ data })
  } catch (err: any) {
    console.error("[purchase-requests/list]", err.message)
    res.status(500).json({ error: "Failed to list purchase requests" })
  }
})

// POST /api/purchase-requests/get — shared between internal staff and
// vendors, same scoping rule as /list: internal users see their org's
// purchase requests, vendors only see purchase requests they own or were
// invited to.
router.post("/get", requireAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.body
    if (!id) return res.status(400).json({ error: "id is required" })

    const scope = await resolveListScope(req)
    if ("error" in scope) return res.status(scope.error.status).json({ error: scope.error.message })

    const { data, error } = await db()
      .from("purchase_requests")
      .select(
        "*, vendor:vendor_id(company_name, contact_name), category:category_id(name), creator:created_by(full_name, email), line_items:purchase_request_line_items(*), purchase_request_vendors(vendor:vendor_id(id, company_name))"
      )
      .eq("id", id)
      .single()

    if (error) throw error

    if (scope.mode === "org" && data.org_id !== scope.orgId) {
      return res.status(404).json({ error: "Purchase request not found" })
    }
    if (scope.mode === "vendor") {
      const isOwner = data.vendor_id === scope.vendorId
      const isInvited = (data.purchase_request_vendors ?? []).some((prv: any) => prv.vendor?.id === scope.vendorId)
      if (!isOwner && !isInvited) return res.status(404).json({ error: "Purchase request not found" })
    }

    res.json({ data })
  } catch (err: any) {
    console.error("[purchase-requests/get]", err.message)
    res.status(500).json({ error: "Failed to get purchase request" })
  }
})

// POST /api/purchase-requests/create
router.post("/create", requireAuth, requireOrg, async (req: Request, res: Response) => {
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
      response_deadline,
    } = req.body
    const { orgId } = req as OrgScopedRequest

    if (!title || !Array.isArray(vendor_ids) || !Array.isArray(category_ids) || !currency || !created_by) {
      return res.status(400).json({
        error: "title, vendor_ids, category_ids, currency, and created_by are required",
      })
    }

    // A quotation response deadline is only meaningful once there's an RFQ
    // to respond to (RFQs are created below, one per invited vendor) --
    // required from here on for any purchase request that actually invites
    // vendors; existing RFQs predating this field simply have none.
    if (vendor_ids.length > 0 && !response_deadline) {
      return res.status(400).json({ error: "response_deadline is required when inviting vendors" })
    }

    // Only category_ids[0] is ever actually persisted as this purchase
    // request's category (see create_purchase_request_full's p_category_id
    // below) -- the resulting PO's fulfillment_type (migration 072) is
    // derived from that one category alone, which then decides a SINGLE
    // delivery-confirmation action (GRN vs. Service Confirmation) for the
    // whole PO. Mixing a goods category with a service category here would
    // silently drop the "goods" half's own confirmation flow, so it's
    // rejected outright rather than letting the picker imply support that
    // doesn't exist.
    if (category_ids.length > 1) {
      const { data: pickedCategories, error: categoriesError } = await db()
        .from("service_categories")
        .select("fulfillment_type")
        .in("id", category_ids)
      if (categoriesError) throw categoriesError

      const fulfillmentTypes = new Set((pickedCategories ?? []).map((c: any) => c.fulfillment_type))
      if (fulfillmentTypes.size > 1) {
        return res.status(400).json({
          error: "Selected categories mix goods and services — a purchase request can only use categories of one fulfillment type. Please split this into separate purchase requests.",
          code: "MIXED_FULFILLMENT_TYPE",
        })
      }
    }

    // The by-categories picker already excludes non-verified vendors, but
    // vendor_ids comes straight from the request body -- re-check server-side
    // so a stale client selection or a direct API call can't attach a vendor
    // that hasn't cleared superadmin compliance verification to a new
    // purchase request.
    if (vendor_ids.length > 0) {
      const { data: eligible, error: eligibleError } = await db()
        .from("vendors")
        .select("id, verification_status, organization_vendors!inner(status)")
        .in("id", vendor_ids)
        .eq("organization_vendors.org_id", orgId)
        .eq("organization_vendors.status", "active")
        .eq("verification_status", "verified")
      if (eligibleError) throw eligibleError

      const eligibleIds = new Set((eligible ?? []).map((v: any) => v.id))
      const ineligible = vendor_ids.filter((id: string) => !eligibleIds.has(id))
      if (ineligible.length > 0) {
        return res.status(400).json({
          error: "One or more selected vendors are not verified or active for this organization and cannot be added to a new purchase request",
          code: "VENDOR_NOT_VERIFIED",
          details: { vendorIds: ineligible },
        })
      }
    }

    // Snapshotted at creation time (not re-derived later) so historical
    // reporting stays accurate even as rates move -- same rate is reused
    // below for the approval-gate threshold comparison rather than fetched
    // twice.
    let exchangeRateToBase: number
    try {
      exchangeRateToBase = await resolveExchangeRateToBase(orgId, currency)
    } catch (fxErr: any) {
      return res.status(502).json({ error: fxErr.message || "Unable to fetch exchange rate. Please try again." })
    }

    const { data: prId, error: rpcError } = await db().rpc("create_purchase_request_full", {
      p_title:           title,
      p_description:     description     || null,
      p_category_id:     category_ids[0] || null,
      p_estimated_value: estimated_value || null,
      p_currency:        currency,
      p_start_date:      start_date      || null,
      p_end_date:        end_date        || null,
      p_notes:           notes           || null,
      p_created_by:      created_by,
      p_vendor_ids:      vendor_ids,
      p_line_items: (line_items || []).map((item: any) => ({
        description: item.description,
        quantity:    item.quantity   ?? null,
        unit_price:  item.unit_price ?? null,
      })),
      p_org_id: orgId,
      p_response_deadline: response_deadline || null,
      p_exchange_rate_to_base: exchangeRateToBase,
    })
    if (rpcError) throw rpcError

    // Associate-only creators need Manager/Admin sign-off before the
    // purchase request is real to the rest of the org; Manager/Admin/solo-mode
    // creators skip straight to approved (shared gate, services/approvalGate.ts --
    // same rule already built for vendor-side quotations). amount is
    // converted to the org's base currency first -- approval_policies.
    // threshold_amount is denominated in base currency, not whatever
    // currency this specific purchase request happens to be in.
    const actorId = (req as AuthenticatedRequest).user.id
    const { gated } = await gateOnCreate({
      entityType: "purchase_request",
      entityId: prId,
      requestedBy: actorId,
      orgId,
      amount: estimated_value ? estimated_value * exchangeRateToBase : null,
      entityLabel: "Purchase Request",
      entityTitle: title,
      notifType: "purchase_request_pending_approval",
    })

    const purchaseRequestUpdate: Record<string, unknown> = gated
      ? { status: "pending_approval" }
      : { status: "approved", approved_by: actorId, approved_at: new Date().toISOString() }
    const { error: statusError } = await db().from("purchase_requests").update(purchaseRequestUpdate).eq("id", prId)
    if (statusError) throw statusError

    // Fetch full purchase request for response
    const { data: full, error: getError } = await db()
      .from("purchase_requests")
      .select("*, category:category_id(name), creator:created_by(full_name, email), line_items:purchase_request_line_items(*), purchase_request_vendors(vendor:vendor_id(id, company_name))")
      .eq("id", prId)
      .single()
    if (getError) throw getError

    await writeAudit({
      entityType: "purchase_request",
      entityId: prId,
      action: "purchase_request_created",
      newValue: { status: full.status },
      performedBy: created_by,
      orgId,
      actingAs: (req as OrgScopedRequest).orgAccess === "group_admin" ? "group_admin" : null,
    })

    res.json({ data: full })
  } catch (err: any) {
    console.error("[purchase-requests/create]", err?.message ?? err)
    res.status(500).json({ error: err?.message ?? "Failed to create purchase request" })
  }
})

// POST /api/purchase-requests/update-status
router.post("/update-status", requireAuth, async (req: Request, res: Response) => {
  try {
    const { id, status, notes, approved_by } = req.body
    if (!id || !status) return res.status(400).json({ error: "id and status are required" })

    // No requireOrg on this route (it's an entity-id-scoped action, not an
    // X-Org-Id-scoped one) -- fetch the purchase request's own org_id and
    // prior status directly, replacing what the removed purchase_request_audit
    // trigger used to see via OLD/NEW.
    const { data: existing, error: getError } = await db()
      .from("purchase_requests")
      .select("status, org_id")
      .eq("id", id)
      .single()
    if (getError) throw getError

    // The pending_approval -> approved/rejected transition is the
    // Manager/Admin approval gate itself (gateOnCreate, approvalGate.ts) --
    // only they may resolve it. Every other transition (cancel/complete/etc)
    // is unchanged, no new restriction added here.
    if (existing.status === "pending_approval" && ["approved", "rejected"].includes(status)) {
      const actorId = (req as AuthenticatedRequest).user.id
      if (!(await isManagerOrAdmin(actorId, existing.org_id))) {
        return res.status(403).json({ error: "You are not authorized to approve or reject this purchase request" })
      }
    }

    const updates: any = { status, notes: notes ?? null }
    if (status === "approved") {
      updates.approved_by = approved_by
      updates.approved_at = new Date().toISOString()
    }

    const { data, error } = await db()
      .from("purchase_requests")
      .update(updates)
      .eq("id", id)
      .select()
      .single()

    if (error) throw error

    if (existing.status !== status) {
      const userId = (req as AuthenticatedRequest).user.id
      await writeAudit({
        entityType: "purchase_request",
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
    console.error("[purchase-requests/update-status]", err.message)
    res.status(500).json({ error: "Failed to update purchase request status" })
  }
})

// POST /api/purchase-requests/update
router.post("/update", requireAuth, async (req: Request, res: Response) => {
  try {
    const { id, ...fields } = req.body
    if (!id) return res.status(400).json({ error: "id is required" })

    const { data, error } = await db()
      .from("purchase_requests")
      .update(fields)
      .eq("id", id)
      .select()
      .single()

    if (error) throw error

    res.json({ data })
  } catch (err: any) {
    console.error("[purchase-requests/update]", err.message)
    res.status(500).json({ error: "Failed to update purchase request" })
  }
})

export default router
