import { Router, Request, Response } from "express"
import { getSupabaseAdmin } from "../utils/supabaseAdmin"
import { requireAuth, AuthenticatedRequest } from "../middleware/auth"
import { requireOrg, OrgScopedRequest, resolveListScope, resolveVendorId } from "../middleware/org"
import { writeAudit, resolveActingAs } from "../services/audit"
import { findOrgRoleHolderIds, findVendorRoleHolderIds, notifyUsers } from "../services/approvalGate"

const router = Router()
function db(): any { return getSupabaseAdmin() }

// An invoice's own grn_id is just the one GRN picked at submission time --
// a PO can have several GRNs (partial deliveries), so the invoice detail
// view needs all of them, not just that one. Attaches a `grns` array
// (keyed by each row's po_id) to every row passed in.
async function attachGRNsByPO<T extends { po_id: string | null }>(rows: T[]): Promise<(T & { grns: { id: string; grn_number: string | null }[] })[]> {
  const poIds = [...new Set(rows.map((r) => r.po_id).filter(Boolean))] as string[]
  if (poIds.length === 0) return rows.map((r) => ({ ...r, grns: [] }))

  const { data: grns } = await db().from("grns").select("id, grn_number, po_id").in("po_id", poIds)
  const grnsByPO = new Map<string, { id: string; grn_number: string | null }[]>()
  for (const g of grns ?? []) {
    const list = grnsByPO.get(g.po_id) ?? []
    list.push({ id: g.id, grn_number: g.grn_number })
    grnsByPO.set(g.po_id, list)
  }
  return rows.map((r) => ({ ...r, grns: r.po_id ? (grnsByPO.get(r.po_id) ?? []) : [] }))
}

async function hasVendorPermission(userId: string, vendorId: string, key: string): Promise<boolean> {
  const { data } = await db().rpc("has_vendor_permission_as", { p_user_id: userId, p_vendor_id: vendorId, p_key: key })
  return data === true
}

async function hasOrgPermission(userId: string, orgId: string, key: string): Promise<boolean> {
  const { data } = await db().rpc("has_permission_as", { p_user_id: userId, p_org_id: orgId, p_key: key })
  return data === true
}

// invoices.approve / invoices.approve_unlimited gate everything an org-side
// reviewer does to an invoice (review, mark-paid, run-match) -- same OR
// pair usePermissions.ts's canApproveInvoice already uses client-side.
async function canReviewInvoices(userId: string, orgId: string): Promise<boolean> {
  return (await hasOrgPermission(userId, orgId, "invoices.approve"))
    || (await hasOrgPermission(userId, orgId, "invoices.approve_unlimited"))
}

// POST /api/invoices/list — shared between internal staff and vendors
// (vendor invoice pages fetch their own invoices this way too).
router.post("/list", requireAuth, async (req: Request, res: Response) => {
  try {
    const { status, vendor_id, po_id, match_status } = req.body

    const scope = await resolveListScope(req)
    if ("error" in scope) return res.status(scope.error.status).json({ error: scope.error.message })

    let query = db()
      .from("invoices")
      .select(
        "*, vendor:vendor_id(company_name), purchase_order:po_id(po_number), grn:grn_id(grn_number), contract:contract_id(contract_ref, title), engagement:engagement_id(title)"
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
    if (po_id) query = query.eq("po_id", po_id)
    if (match_status) query = query.eq("match_status", match_status)

    const { data, error } = await query

    if (error) throw error

    res.json({ data: await attachGRNsByPO(data ?? []) })
  } catch (err: any) {
    console.error("[invoices/list]", err.message)
    res.status(500).json({ error: "Failed to list invoices" })
  }
})

// POST /api/invoices/get — shared between internal staff and vendors, same
// scoping rule as /list.
router.post("/get", requireAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.body
    if (!id) return res.status(400).json({ error: "id is required" })

    const scope = await resolveListScope(req)
    if ("error" in scope) return res.status(scope.error.status).json({ error: scope.error.message })

    const { data, error } = await db()
      .from("invoices")
      .select(
        "*, vendor:vendor_id(company_name), purchase_order:po_id(po_number), grn:grn_id(grn_number), contract:contract_id(contract_ref, title), engagement:engagement_id(title)"
      )
      .eq("id", id)
      .single()

    if (error) throw error

    if (scope.mode === "org" ? data.org_id !== scope.orgId : data.vendor_id !== scope.vendorId) {
      return res.status(404).json({ error: "Invoice not found" })
    }

    const [withGRNs] = await attachGRNsByPO([data])
    res.json({ data: withGRNs })
  } catch (err: any) {
    console.error("[invoices/get]", err.message)
    res.status(500).json({ error: "Failed to get invoice" })
  }
})

// POST /api/invoices/submit — vendor-only (the only real caller, per
// VendorInvoices.tsx). org_id is derived from whichever of po_id/
// engagement_id/contract_id was actually supplied -- never a global default,
// since that would silently misfile the invoice under the wrong org in a
// multi-org setup.
router.post("/submit", requireAuth, async (req: Request, res: Response) => {
  try {
    const {
      vendor_invoice_number,
      vendor_id,
      po_id: rawPoId,
      grn_id,
      contract_id,
      engagement_id,
      total_amount,
      currency,
      invoice_date,
      due_date,
      notes,
      storage_path,
      submitted_by,
    } = req.body

    if (!vendor_invoice_number || !vendor_id || total_amount === undefined || !invoice_date || !submitted_by) {
      return res.status(400).json({
        error: "vendor_invoice_number, vendor_id, total_amount, invoice_date, and submitted_by are required",
      })
    }

    const { id: userId, role } = (req as AuthenticatedRequest).user
    // Vendor-only route (the only real caller, per VendorInvoices.tsx) --
    // an internal/org caller has no legitimate reason to file an invoice on
    // a vendor's behalf, and this route previously had zero checks on that
    // path at all.
    if (role !== "vendor") {
      return res.status(403).json({ error: "Only a vendor can submit an invoice" })
    }
    const callerVendorId = await resolveVendorId(userId)
    if (!callerVendorId || callerVendorId !== vendor_id) {
      return res.status(403).json({ error: "Cannot submit an invoice for a different vendor" })
    }
    // invoices.submit is a vendor-Manager/Admin permission (Associate only
    // holds deliveries.confirm/quotations.draft_line_items per
    // 018_rbac_seed.sql) -- the ownership check above only confirmed *which*
    // vendor, not the caller's role within it.
    if (!(await hasVendorPermission(userId, vendor_id, "invoices.submit"))) {
      return res.status(403).json({ error: "You are not authorized to submit invoices for this vendor" })
    }

    let po_id = rawPoId

    // A supplied po_id must actually belong to this vendor -- otherwise a
    // vendor could file an invoice against another vendor's PO/GRN chain,
    // corrupting the three-way match result.
    if (po_id) {
      const { data: poRow, error: poCheckError } = await db()
        .from("purchase_orders")
        .select("vendor_id")
        .eq("id", po_id)
        .maybeSingle()
      if (poCheckError) throw poCheckError
      if (!poRow || poRow.vendor_id !== vendor_id) {
        return res.status(400).json({ error: "po_id does not belong to this vendor" })
      }
    }

    if (!po_id && engagement_id && vendor_id) {
      const { data: poRow } = await db()
        .from("purchase_orders")
        .select("id")
        .eq("engagement_id", engagement_id)
        .eq("vendor_id", vendor_id)
        .limit(1)
        .maybeSingle()

      if (poRow) po_id = poRow.id
    }

    let orgId: string | null = null
    if (po_id) {
      const { data } = await db().from("purchase_orders").select("org_id").eq("id", po_id).maybeSingle()
      orgId = data?.org_id ?? null
    } else if (engagement_id) {
      const { data } = await db().from("engagements").select("org_id").eq("id", engagement_id).maybeSingle()
      orgId = data?.org_id ?? null
    } else if (contract_id) {
      const { data } = await db().from("contracts").select("org_id").eq("id", contract_id).maybeSingle()
      orgId = data?.org_id ?? null
    }
    if (!orgId) {
      return res.status(400).json({ error: "Could not determine organization for this invoice — a valid po_id, engagement_id, or contract_id is required" })
    }

    const invoicePayload: any = {
      vendor_invoice_number,
      vendor_id,
      total_amount,
      invoice_date,
      submitted_by,
      org_id: orgId,
      status: "submitted",
      match_status: "pending",
    }
    if (po_id !== undefined) invoicePayload.po_id = po_id
    if (grn_id !== undefined) invoicePayload.grn_id = grn_id
    if (contract_id !== undefined) invoicePayload.contract_id = contract_id
    if (engagement_id !== undefined) invoicePayload.engagement_id = engagement_id
    if (currency !== undefined) invoicePayload.currency = currency
    if (due_date !== undefined) invoicePayload.due_date = due_date
    if (notes !== undefined) invoicePayload.notes = notes
    if (storage_path !== undefined) invoicePayload.storage_path = storage_path

    const { data, error } = await db()
      .from("invoices")
      .insert(invoicePayload)
      .select()
      .single()

    if (error) throw error

    // The old invoice_audit trigger only fired on UPDATE, so it never
    // covered creation -- this is a new, additive audit entry (for parity
    // with engagements/create), not a replacement for lost coverage.
    await writeAudit({
      entityType: "invoice",
      entityId: data.id,
      action: "invoice_submitted",
      newValue: { status: data.status },
      performedBy: submitted_by,
      orgId,
      actingAs: await resolveActingAs(submitted_by, orgId),
    })

    // Replaces the old notify_admins_new_invoice DB trigger (dropped in
    // 049_notification_rbac_cutover.sql), which filtered by the legacy
    // profiles.role and so missed anyone invited into the org's Admin/
    // Finance roles after that trigger was written.
    const recipientIds = await findOrgRoleHolderIds(orgId, ["Admin", "Finance"])
    await notifyUsers(recipientIds, {
      type: "new_invoice",
      title: "New Invoice Submitted",
      message: `A vendor has submitted invoice ${vendor_invoice_number} for review.`,
      moduleReferenceId: data.id,
    })

    res.json({ data })
  } catch (err: any) {
    console.error("[invoices/submit]", err.message)
    res.status(500).json({ error: "Failed to submit invoice" })
  }
})

// POST /api/invoices/run-match — org-side only (matches the "Match" button
// in InvoiceList.tsx, which never renders for a vendor caller). Previously
// had no requireOrg and no ownership check at all -- any authenticated
// caller could recompute the match on any invoice in the system by UUID.
router.post("/run-match", requireAuth, requireOrg, async (req: Request, res: Response) => {
  try {
    const { invoiceId } = req.body
    const { orgId } = req as OrgScopedRequest
    const userId = (req as AuthenticatedRequest).user.id
    if (!invoiceId) return res.status(400).json({ error: "invoiceId is required" })

    const { data: existing, error: getError } = await db()
      .from("invoices")
      .select("org_id")
      .eq("id", invoiceId)
      .maybeSingle()
    if (getError) throw getError
    if (!existing || existing.org_id !== orgId) {
      return res.status(404).json({ error: "Invoice not found" })
    }

    if (!(await canReviewInvoices(userId, orgId))) {
      return res.status(403).json({ error: "You are not authorized to match this invoice" })
    }

    const { data, error } = await db().rpc("perform_three_way_match", { p_invoice_id: invoiceId })

    if (error) throw error

    res.json({ data })
  } catch (err: any) {
    console.error("[invoices/run-match]", err.message)
    res.status(500).json({ error: "Failed to run three-way match" })
  }
})

// POST /api/invoices/review — the org's approve/reject decision. Previously
// had no permission check at all beyond requireOrg (org membership), so any
// org member -- including an Associate, who per the RBAC seed only holds
// invoices.data_entry, not invoices.approve -- could approve/reject/pay any
// invoice in the org, or push status straight to "paid" bypassing
// /mark-paid entirely (leaving paid_at null while status said paid). Both
// gaps closed here, mirroring quotations.ts's update-status fix.
router.post("/review", requireAuth, requireOrg, async (req: Request, res: Response) => {
  try {
    const { id, status, notes, reviewed_by } = req.body
    const { orgId } = req as OrgScopedRequest
    const userId = (req as AuthenticatedRequest).user.id
    if (!id || !status || !reviewed_by) {
      return res.status(400).json({ error: "id, status, and reviewed_by are required" })
    }
    if (!["approved", "rejected"].includes(status)) {
      return res.status(400).json({ error: "This endpoint only accepts 'approved' or 'rejected'" })
    }

    if (!(await canReviewInvoices(userId, orgId))) {
      return res.status(403).json({ error: "You are not authorized to review this invoice" })
    }

    const { data: existing, error: getError } = await db()
      .from("invoices")
      .select("status")
      .eq("id", id)
      .eq("org_id", orgId)
      .single()
    if (getError) throw getError
    if (!["submitted", "under_review", "matched"].includes(existing.status)) {
      return res.status(400).json({ error: "This invoice is not awaiting review" })
    }

    const updates: any = { status, reviewed_by, reviewed_at: new Date().toISOString() }
    if (notes !== undefined) updates.notes = notes

    const { data, error } = await db()
      .from("invoices")
      .update(updates)
      .eq("id", id)
      .eq("org_id", orgId)
      .select()
      .single()

    if (error) throw error

    if (existing.status !== status) {
      await writeAudit({
        entityType: "invoice",
        entityId: id,
        action: "status_changed",
        oldValue: { status: existing.status },
        newValue: { status },
        performedBy: reviewed_by,
        orgId,
        actingAs: (req as OrgScopedRequest).orgAccess === "group_admin" ? "group_admin" : null,
      })

      const recipientIds = await findVendorRoleHolderIds(data.vendor_id, ["Admin", "Finance"])
      await notifyUsers(recipientIds, {
        type: "invoice_status_update",
        title: `Invoice ${status}`,
        message: notes ? `Your invoice was ${status}: ${notes}` : `Your invoice was ${status}.`,
        moduleReferenceId: id,
      })
    }

    res.json({ data })
  } catch (err: any) {
    console.error("[invoices/review]", err.message)
    res.status(500).json({ error: "Failed to review invoice" })
  }
})

// POST /api/invoices/mark-paid — same permission gate as /review (reuses
// invoices.approve/approve_unlimited rather than a dedicated invoices.
// mark_paid key, matching how the frontend already reuses canApproveInvoice
// as the proxy for this action). Also now requires the invoice to actually
// be "approved" first -- previously any status could jump straight to paid.
router.post("/mark-paid", requireAuth, requireOrg, async (req: Request, res: Response) => {
  try {
    const { id } = req.body
    const { orgId } = req as OrgScopedRequest
    const userId = (req as AuthenticatedRequest).user.id
    if (!id) return res.status(400).json({ error: "id is required" })

    if (!(await canReviewInvoices(userId, orgId))) {
      return res.status(403).json({ error: "You are not authorized to mark this invoice as paid" })
    }

    const { data: existing, error: getError } = await db()
      .from("invoices")
      .select("status")
      .eq("id", id)
      .eq("org_id", orgId)
      .single()
    if (getError) throw getError
    if (existing.status !== "approved") {
      return res.status(400).json({ error: "Only an approved invoice can be marked as paid" })
    }

    const { data, error } = await db()
      .from("invoices")
      .update({ status: "paid", paid_at: new Date().toISOString() })
      .eq("id", id)
      .eq("org_id", orgId)
      .select()
      .single()

    if (error) throw error

    if (existing.status !== "paid") {
      const userId = (req as AuthenticatedRequest).user.id
      await writeAudit({
        entityType: "invoice",
        entityId: id,
        action: "status_changed",
        oldValue: { status: existing.status },
        newValue: { status: "paid" },
        performedBy: userId,
        orgId,
        actingAs: (req as OrgScopedRequest).orgAccess === "group_admin" ? "group_admin" : null,
      })

      const recipientIds = await findVendorRoleHolderIds(data.vendor_id, ["Admin", "Finance"])
      await notifyUsers(recipientIds, {
        type: "invoice_status_update",
        title: "Invoice paid",
        message: "Your invoice has been marked as paid.",
        moduleReferenceId: id,
      })
    }

    res.json({ data })
  } catch (err: any) {
    console.error("[invoices/mark-paid]", err.message)
    res.status(500).json({ error: "Failed to mark invoice as paid" })
  }
})

export default router
