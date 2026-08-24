import { Router, Request, Response } from "express"
import { getSupabaseAdmin } from "../utils/supabaseAdmin"
import { requireAuth, AuthenticatedRequest } from "../middleware/auth"
import { requireOrg, OrgScopedRequest } from "../middleware/org"
import { isManagerOrAdmin, notifyUsers, findActiveVendorUserIds } from "../services/approvalGate"

const ENTITY_LABELS: Record<string, string> = {
  grn: "GRN",
  purchase_request: "Purchase Request",
  contract: "Contract",
  category: "Category",
}

const router = Router()
function db(): any { return getSupabaseAdmin() }

// POST /api/approvals/by-entity
router.post("/by-entity", requireAuth, requireOrg, async (req: Request, res: Response) => {
  try {
    const { entityType, entityId } = req.body
    const { orgId } = req as OrgScopedRequest
    if (!entityType || !entityId) return res.status(400).json({ error: "Missing entityType or entityId" })

    const { data, error } = await db()
      .from("approval_requests")
      .select("*, requester:requested_by(full_name, email), reviewer:reviewed_by(full_name, email)")
      .eq("entity_type", entityType)
      .eq("entity_id", entityId)
      .eq("org_id", orgId)
      .order("created_at", { ascending: false })

    if (error) throw error
    return res.json({ data })
  } catch (err: any) {
    return res.status(500).json({ error: err.message || "Unexpected error" })
  }
})

// POST /api/approvals/pending
router.post("/pending", requireAuth, requireOrg, async (req: Request, res: Response) => {
  try {
    const { entityType } = req.body
    const { orgId } = req as OrgScopedRequest

    let query = db()
      .from("approval_requests")
      .select("*, requester:requested_by(full_name, email)")
      .eq("status", "pending")
      .eq("org_id", orgId)
      .order("created_at", { ascending: true })

    if (entityType) query = query.eq("entity_type", entityType)

    const { data, error } = await query
    if (error) throw error
    return res.json({ data })
  } catch (err: any) {
    return res.status(500).json({ error: err.message || "Unexpected error" })
  }
})

// POST /api/approvals/request
router.post("/request", requireAuth, requireOrg, async (req: Request, res: Response) => {
  try {
    const { entity_type, entity_id, requested_by, amount, notes } = req.body
    const { orgId } = req as OrgScopedRequest
    if (!entity_type || !entity_id || !requested_by) {
      return res.status(400).json({ error: "Missing required fields" })
    }

    const { data, error } = await db()
      .from("approval_requests")
      .insert({
        entity_type,
        entity_id,
        requested_by,
        amount: amount ?? null,
        notes: notes ?? null,
        status: "pending",
        org_id: orgId,
      })
      .select()
      .single()

    if (error) throw error
    return res.json({ data })
  } catch (err: any) {
    return res.status(500).json({ error: err.message || "Unexpected error" })
  }
})

// POST /api/approvals/review — Manager/Admin only, resolved from the
// caller's own membership in the request's org (not the client-supplied
// reviewed_by, which used to be trusted outright -- anyone could approve
// anything by just naming themselves). reviewed_by is always the actual
// caller now, matching the only way the frontend has ever called this.
router.post("/review", requireAuth, async (req: Request, res: Response) => {
  try {
    const { id, status, notes } = req.body
    const reviewerId = (req as AuthenticatedRequest).user.id
    if (!id || !status) return res.status(400).json({ error: "Missing id or status" })

    const { data: existing, error: existingError } = await db()
      .from("approval_requests")
      .select("id, org_id, status, entity_type, entity_id, requested_by")
      .eq("id", id)
      .single()
    if (existingError) throw existingError
    if (existing.status !== "pending") {
      return res.status(400).json({ error: "Only a pending approval request can be reviewed" })
    }
    if (!(await isManagerOrAdmin(reviewerId, existing.org_id))) {
      return res.status(403).json({ error: "You are not authorized to review this request" })
    }

    const { data, error } = await db()
      .from("approval_requests")
      .update({
        status,
        notes: notes ?? null,
        reviewed_by: reviewerId,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select()
      .single()

    if (error) throw error

    // Segregation-of-duties: flag (never block) whenever the same user both
    // requested and reviewed an approval, for every org -- not just
    // solo-role ones. approval_requests already carries both requested_by
    // and reviewed_by on the same row, so this is a same-row comparison, no
    // join needed. The flag also records role_mode and how many org-scope
    // roles the reviewer holds in this org, so a solo org's expected-by-
    // design multi-role holder (flagged but routine) is distinguishable
    // from a tiered org member unexpectedly holding more than one bundle
    // (flagged and worth a closer look).
    if (data.requested_by && data.requested_by === reviewerId) {
      await flagSegregationOfDuties(data)
    }

    // Let the requester (typically the Associate who created the entity)
    // know the outcome -- previously only recorded in approval_requests,
    // never surfaced as a notification.
    if (data.requested_by) {
      const label = ENTITY_LABELS[data.entity_type] ?? data.entity_type
      await notifyUsers([data.requested_by], {
        type: `${data.entity_type}_decision`,
        title: `${label} ${status}`,
        message: notes ? `Your ${label} was ${status}: ${notes}` : `Your ${label} was ${status}.`,
        moduleReferenceId: data.entity_id,
      })
    }

    // A gated purchase request's invited vendors couldn't be notified at
    // creation time (their RFQ was invisible to them until now -- see
    // purchaseRequests.ts/create) -- tell them the moment it clears approval.
    if (data.entity_type === "purchase_request" && status === "approved") {
      const { data: pr } = await db().from("purchase_requests").select("title").eq("id", data.entity_id).maybeSingle()
      const { data: invited } = await db().from("purchase_request_vendors").select("vendor_id").eq("purchase_request_id", data.entity_id)

      for (const { vendor_id: vendorId } of invited ?? []) {
        const vendorRecipients = await findActiveVendorUserIds(vendorId)
        await notifyUsers(vendorRecipients, {
          type: "rfq_invited",
          title: "New Purchase Request Invitation",
          message: `You've been invited to submit a quotation for "${pr?.title ?? "a purchase request"}".`,
          moduleReferenceId: data.entity_id,
        })
      }
    }

    return res.json({ data })
  } catch (err: any) {
    return res.status(500).json({ error: err.message || "Unexpected error" })
  }
})

async function flagSegregationOfDuties(approval: any) {
  try {
    const { data: org } = await db()
      .from("organizations")
      .select("role_mode")
      .eq("id", approval.org_id)
      .maybeSingle()

    const { data: member } = await db()
      .from("organization_members")
      .select("id")
      .eq("org_id", approval.org_id)
      .eq("profile_id", approval.reviewed_by)
      .maybeSingle()

    let roleCount = 0
    if (member) {
      const { count } = await db()
        .from("org_member_roles")
        .select("role_id", { count: "exact", head: true })
        .eq("org_member_id", member.id)
      roleCount = count ?? 0
    }

    const roleMode = org?.role_mode ?? "tiered"

    await db().from("audit_log").insert({
      entity_type: approval.entity_type,
      entity_id: approval.entity_id,
      action: "segregation_of_duties_flag",
      new_value: {
        requested_by: approval.requested_by,
        reviewed_by: approval.reviewed_by,
        role_mode: roleMode,
        reviewer_role_count: roleCount,
        expected_under_role_mode: roleMode === "solo",
      },
      performed_by: approval.reviewed_by,
      org_id: approval.org_id,
    })
  } catch (err: any) {
    // Never let the audit flag itself block or fail the approval that
    // already succeeded above.
    console.error("[approvals/review] segregation-of-duties flag failed", err.message)
  }
}

// POST /api/approvals/cancel
router.post("/cancel", requireAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.body
    if (!id) return res.status(400).json({ error: "Missing id" })

    const { data, error } = await db()
      .from("approval_requests")
      .update({ status: "cancelled" })
      .eq("id", id)
      .select()
      .single()

    if (error) throw error
    return res.json({ data })
  } catch (err: any) {
    return res.status(500).json({ error: err.message || "Unexpected error" })
  }
})

export default router
