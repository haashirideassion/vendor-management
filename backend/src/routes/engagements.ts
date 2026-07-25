import { Router, Request, Response } from "express"
import { getSupabaseAdmin } from "../utils/supabaseAdmin"
import { requireAuth, AuthenticatedRequest } from "../middleware/auth"
import { requireOrg, OrgScopedRequest, resolveListScope } from "../middleware/org"
import { writeAudit, resolveActingAs } from "../services/audit"
import { gateOnCreate, isManagerOrAdmin } from "../services/approvalGate"

const router = Router()
function db(): any { return getSupabaseAdmin() }

// POST /api/engagements/list — shared between internal staff and vendors
// (vendor dashboard/detail pages fetch their own engagements this way too).
router.post("/list", requireAuth, async (req: Request, res: Response) => {
  try {
    const { status, vendor_id, search } = req.body

    const scope = await resolveListScope(req)
    if ("error" in scope) return res.status(scope.error.status).json({ error: scope.error.message })

    let query = db()
      .from("engagements")
      .select(
        "*, vendor:vendor_id(company_name, contact_name), category:category_id(name), creator:created_by(full_name, email), line_items:engagement_line_items(*), engagement_vendors(vendor:vendor_id(id, company_name))"
      )
      .order("created_at", { ascending: false })

    if (scope.mode === "vendor") {
      const { data: invited } = await db()
        .from("engagement_vendors")
        .select("engagement_id")
        .eq("vendor_id", scope.vendorId)
      const invitedIds = (invited ?? []).map((r: any) => r.engagement_id)
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
    console.error("[engagements/list]", err.message)
    res.status(500).json({ error: "Failed to list engagements" })
  }
})

// POST /api/engagements/get — shared between internal staff and vendors,
// same scoping rule as /list: internal users see their org's engagements,
// vendors only see engagements they own or were invited to.
router.post("/get", requireAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.body
    if (!id) return res.status(400).json({ error: "id is required" })

    const scope = await resolveListScope(req)
    if ("error" in scope) return res.status(scope.error.status).json({ error: scope.error.message })

    const { data, error } = await db()
      .from("engagements")
      .select(
        "*, vendor:vendor_id(company_name, contact_name), category:category_id(name), creator:created_by(full_name, email), line_items:engagement_line_items(*), engagement_vendors(vendor:vendor_id(id, company_name))"
      )
      .eq("id", id)
      .single()

    if (error) throw error

    if (scope.mode === "org" && data.org_id !== scope.orgId) {
      return res.status(404).json({ error: "Engagement not found" })
    }
    if (scope.mode === "vendor") {
      const isOwner = data.vendor_id === scope.vendorId
      const isInvited = (data.engagement_vendors ?? []).some((ev: any) => ev.vendor?.id === scope.vendorId)
      if (!isOwner && !isInvited) return res.status(404).json({ error: "Engagement not found" })
    }

    res.json({ data })
  } catch (err: any) {
    console.error("[engagements/get]", err.message)
    res.status(500).json({ error: "Failed to get engagement" })
  }
})

// POST /api/engagements/create
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
    } = req.body
    const { orgId } = req as OrgScopedRequest

    if (!title || !Array.isArray(vendor_ids) || !Array.isArray(category_ids) || !currency || !created_by) {
      return res.status(400).json({
        error: "title, vendor_ids, category_ids, currency, and created_by are required",
      })
    }

    // The by-categories picker already excludes non-verified vendors, but
    // vendor_ids comes straight from the request body -- re-check server-side
    // so a stale client selection or a direct API call can't attach a vendor
    // that hasn't cleared superadmin compliance verification to a new engagement.
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
          error: "One or more selected vendors are not verified or active for this organization and cannot be added to a new engagement",
          code: "VENDOR_NOT_VERIFIED",
          details: { vendorIds: ineligible },
        })
      }
    }

    const { data: engId, error: rpcError } = await db().rpc("create_engagement_full", {
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
    })
    if (rpcError) throw rpcError

    // Associate-only creators need Manager/Admin sign-off before the
    // engagement is real to the rest of the org; Manager/Admin/solo-mode
    // creators skip straight to approved (shared gate, services/approvalGate.ts --
    // same rule already built for vendor-side quotations).
    const actorId = (req as AuthenticatedRequest).user.id
    const { gated } = await gateOnCreate({
      entityType: "engagement",
      entityId: engId,
      requestedBy: actorId,
      orgId,
      amount: estimated_value || null,
      entityLabel: "Engagement",
      entityTitle: title,
      notifType: "engagement_pending_approval",
    })

    const engagementUpdate: Record<string, unknown> = gated
      ? { status: "pending_approval" }
      : { status: "approved", approved_by: actorId, approved_at: new Date().toISOString() }
    const { error: statusError } = await db().from("engagements").update(engagementUpdate).eq("id", engId)
    if (statusError) throw statusError

    // Fetch full engagement for response
    const { data: full, error: getError } = await db()
      .from("engagements")
      .select("*, category:category_id(name), creator:created_by(full_name, email), line_items:engagement_line_items(*), engagement_vendors(vendor:vendor_id(id, company_name))")
      .eq("id", engId)
      .single()
    if (getError) throw getError

    await writeAudit({
      entityType: "engagement",
      entityId: engId,
      action: "engagement_created",
      newValue: { status: full.status },
      performedBy: created_by,
      orgId,
      actingAs: (req as OrgScopedRequest).orgAccess === "group_admin" ? "group_admin" : null,
    })

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

    // No requireOrg on this route (it's an entity-id-scoped action, not an
    // X-Org-Id-scoped one) -- fetch the engagement's own org_id and prior
    // status directly, replacing what the removed engagement_audit trigger
    // used to see via OLD/NEW.
    const { data: existing, error: getError } = await db()
      .from("engagements")
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
        return res.status(403).json({ error: "You are not authorized to approve or reject this engagement" })
      }
    }

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

    if (existing.status !== status) {
      const userId = (req as AuthenticatedRequest).user.id
      await writeAudit({
        entityType: "engagement",
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
