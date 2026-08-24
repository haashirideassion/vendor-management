import { Router, Request, Response } from "express"
import { getSupabaseAdmin } from "../utils/supabaseAdmin"
import { requireAuth, AuthenticatedRequest } from "../middleware/auth"
import { requireOrg, OrgScopedRequest, resolveListScope, resolveVendorId } from "../middleware/org"
import { writeAudit, resolveActingAs } from "../services/audit"
import { findOrgRoleHolderIds, findVendorRoleHolderIds, notifyUsers } from "../services/approvalGate"
import { resolveExchangeRateToBase } from "../services/exchangeRates.service"

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

// Routed through resolve_permission_as (062/063) rather than the bare
// has_vendor_permission_as/has_permission_as RPCs directly -- those only
// ever checked the role-permission baseline. Going through the resolver
// additionally applies the Feature Entitlement hard gate (Phase 2) and the
// subtractive User Restriction override (Phase 4), which every direct RPC
// caller was silently skipping. Same signature, same call sites -- nothing
// else in this file needs to change.
async function hasVendorPermission(userId: string, vendorId: string, key: string): Promise<boolean> {
  const { data } = await db().rpc("resolve_permission_as", { p_user_id: userId, p_scope: "vendor", p_org_id: null, p_vendor_id: vendorId, p_key: key })
  return data === true
}

async function hasOrgPermission(userId: string, orgId: string, key: string): Promise<boolean> {
  const { data } = await db().rpc("resolve_permission_as", { p_user_id: userId, p_scope: "org", p_org_id: orgId, p_vendor_id: null, p_key: key })
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
    const { status, vendor_id, po_id, match_status, has_open_exception } = req.body

    const scope = await resolveListScope(req)
    if ("error" in scope) return res.status(scope.error.status).json({ error: scope.error.message })

    let query = db()
      .from("invoices")
      .select(
        "*, vendor:vendor_id(company_name), purchase_order:po_id(po_number), grn:grn_id(grn_number), contract:contract_id(contract_ref, title), purchase_request:purchase_request_id(title), team:team_id(name)"
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

    // "Exception" is not an invoice status -- it's a filter onto the
    // invoice_exceptions queue (migration 073), surfaced here as one more
    // option in the existing status dropdown rather than a separate page.
    if (has_open_exception) {
      const { data: openExceptions, error: excError } = await db()
        .from("invoice_exceptions")
        .select("invoice_id")
        .eq("status", "open")
      if (excError) throw excError
      const invoiceIds = (openExceptions ?? []).map((e: any) => e.invoice_id)
      query = query.in("id", invoiceIds.length > 0 ? invoiceIds : ["00000000-0000-0000-0000-000000000000"])
    }

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
        "*, vendor:vendor_id(company_name), purchase_order:po_id(po_number), grn:grn_id(grn_number), contract:contract_id(contract_ref, title), purchase_request:purchase_request_id(title), team:team_id(name)"
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
// purchase_request_id/contract_id was actually supplied -- never a global default,
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
      purchase_request_id,
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
    let poCurrency: string | null = null

    // A supplied po_id must actually belong to this vendor -- otherwise a
    // vendor could file an invoice against another vendor's PO/GRN chain,
    // corrupting the three-way match result.
    if (po_id) {
      const { data: poRow, error: poCheckError } = await db()
        .from("purchase_orders")
        .select("vendor_id, currency")
        .eq("id", po_id)
        .maybeSingle()
      if (poCheckError) throw poCheckError
      if (!poRow || poRow.vendor_id !== vendor_id) {
        return res.status(400).json({ error: "po_id does not belong to this vendor" })
      }
      poCurrency = poRow.currency
      // An invoice in a different currency than its own PO would silently
      // corrupt the three-way match (which just diffs raw numerics assuming
      // everything is already the same currency) -- reject outright rather
      // than let it through, mirroring the same check already enforced for
      // a Release Order against its Blanket PO.
      if (currency !== undefined && poCurrency && currency !== poCurrency) {
        return res.status(400).json({ error: `This invoice's currency must match its PO's currency (${poCurrency})` })
      }
    }

    if (!po_id && purchase_request_id && vendor_id) {
      const { data: poRow } = await db()
        .from("purchase_orders")
        .select("id")
        .eq("purchase_request_id", purchase_request_id)
        .eq("vendor_id", vendor_id)
        .limit(1)
        .maybeSingle()

      if (poRow) po_id = poRow.id
    }

    let orgId: string | null = null
    // Resolved in the same branches as orgId, since Team is denormalized
    // forward the same way (PO's team, or else the purchase request's own) --
    // a contract-only invoice has no team concept and stays null.
    let teamId: string | null = null
    if (po_id) {
      const { data } = await db().from("purchase_orders").select("org_id, team_id").eq("id", po_id).maybeSingle()
      orgId = data?.org_id ?? null
      teamId = data?.team_id ?? null
    } else if (purchase_request_id) {
      const { data } = await db().from("purchase_requests").select("org_id, team_id").eq("id", purchase_request_id).maybeSingle()
      orgId = data?.org_id ?? null
      teamId = data?.team_id ?? null
    } else if (contract_id) {
      const { data } = await db().from("contracts").select("org_id").eq("id", contract_id).maybeSingle()
      orgId = data?.org_id ?? null
    }
    if (!orgId) {
      return res.status(400).json({ error: "Could not determine organization for this invoice — a valid po_id, purchase_request_id, or contract_id is required" })
    }

    // Inherit the PO's currency when the invoice doesn't specify one --
    // there's no legitimate case for these to differ (see the check above).
    const finalCurrency: string | undefined = currency ?? poCurrency ?? undefined

    let exchangeRateToBase: number
    try {
      exchangeRateToBase = await resolveExchangeRateToBase(orgId, finalCurrency)
    } catch (fxErr: any) {
      return res.status(502).json({ error: fxErr.message || "Unable to fetch exchange rate. Please try again." })
    }

    const invoicePayload: any = {
      vendor_invoice_number,
      vendor_id,
      total_amount,
      invoice_date,
      submitted_by,
      org_id: orgId,
      team_id: teamId,
      status: "submitted",
      match_status: "pending",
      exchange_rate_to_base: exchangeRateToBase,
    }
    if (po_id !== undefined) invoicePayload.po_id = po_id
    if (grn_id !== undefined) invoicePayload.grn_id = grn_id
    if (contract_id !== undefined) invoicePayload.contract_id = contract_id
    if (purchase_request_id !== undefined) invoicePayload.purchase_request_id = purchase_request_id
    if (finalCurrency !== undefined) invoicePayload.currency = finalCurrency
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
    // with purchase-requests/create), not a replacement for lost coverage.
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
      .select("org_id, match_status, vendor_invoice_number")
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

    // Only notify on the transition INTO variance -- re-running the match
    // while an exception is already open (e.g. someone re-checking after a
    // partial fix) would otherwise re-notify Admin/Finance on every click.
    if (existing.match_status !== "variance") {
      const { data: rematched } = await db()
        .from("invoices")
        .select("match_status")
        .eq("id", invoiceId)
        .maybeSingle()

      if (rematched?.match_status === "variance") {
        const recipientIds = await findOrgRoleHolderIds(orgId, ["Admin", "Finance"])
        await notifyUsers(recipientIds, {
          type: "invoice_match_exception",
          title: "Invoice Match Exception",
          message: `Invoice ${existing.vendor_invoice_number} did not match its delivered quantities/amount within tolerance and needs review.`,
          moduleReferenceId: invoiceId,
        })
      }
    }

    res.json({ data })
  } catch (err: any) {
    console.error("[invoices/run-match]", err.message)
    res.status(500).json({ error: "Failed to run three-way match" })
  }
})

// POST /api/invoices/exceptions/list — {status?, invoiceId?}. This org's
// 3-way match exception queue (migration 073) -- does NOT replace /review's
// existing approve/reject authority over an under_review invoice, it's the
// missing audit trail for why that invoice landed there and whether anyone
// has looked at it yet. invoiceId scopes this to a single invoice, for the
// "Match Exception" card on that invoice's own detail page.
router.post("/exceptions/list", requireAuth, requireOrg, async (req: Request, res: Response) => {
  try {
    const { status, invoiceId } = req.body
    const { orgId } = req as OrgScopedRequest

    let query = db()
      .from("invoice_exceptions")
      .select("*, invoice:invoice_id(invoice_ref, vendor_invoice_number, status, vendor:vendor_id(company_name)), purchase_order:po_id(po_number)")
      .eq("org_id", orgId)
      .order("created_at", { ascending: false })
    if (status) query = query.eq("status", status)
    if (invoiceId) query = query.eq("invoice_id", invoiceId)

    const { data, error } = await query
    if (error) throw error
    res.json({ data })
  } catch (err: any) {
    console.error("[invoices/exceptions/list]", err.message)
    res.status(500).json({ error: "Failed to list invoice exceptions" })
  }
})

// POST /api/invoices/exceptions/resolve — {id, status: 'resolved'|'waived', notes?}.
// A resolution note here is the record of WHY a variance was accepted or
// fixed -- separate from, and prior to, whatever /review decision (approve/
// reject) an org reviewer makes on the invoice itself.
router.post("/exceptions/resolve", requireAuth, requireOrg, async (req: Request, res: Response) => {
  try {
    const { id, status, notes } = req.body
    const { orgId } = req as OrgScopedRequest
    const userId = (req as AuthenticatedRequest).user.id
    if (!id || !["resolved", "waived"].includes(status)) {
      return res.status(400).json({ error: "id and a status of 'resolved' or 'waived' are required" })
    }

    const { data: existing, error: getError } = await db()
      .from("invoice_exceptions")
      .select("id, org_id, status")
      .eq("id", id)
      .maybeSingle()
    if (getError) throw getError
    if (!existing || existing.org_id !== orgId) return res.status(404).json({ error: "Exception not found" })
    if (existing.status !== "open") return res.status(400).json({ error: "This exception has already been resolved" })

    if (!(await canReviewInvoices(userId, orgId))) {
      return res.status(403).json({ error: "You are not authorized to resolve this exception" })
    }

    const { data, error } = await db()
      .from("invoice_exceptions")
      .update({ status, resolution_notes: notes ?? null, resolved_by: userId, resolved_at: new Date().toISOString() })
      .eq("id", id)
      .select()
      .single()
    if (error) throw error

    res.json({ data })
  } catch (err: any) {
    console.error("[invoices/exceptions/resolve]", err.message)
    res.status(500).json({ error: "Failed to resolve invoice exception" })
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

// POST /api/invoices/payments/list — {invoiceId}. Same scoping rule as
// /get (org reviewer for their own org's invoice, vendor for their own
// invoice) -- payment history is exactly as sensitive as the invoice itself.
router.post("/payments/list", requireAuth, async (req: Request, res: Response) => {
  try {
    const { invoiceId } = req.body
    if (!invoiceId) return res.status(400).json({ error: "invoiceId is required" })

    const scope = await resolveListScope(req)
    if ("error" in scope) return res.status(scope.error.status).json({ error: scope.error.message })

    const { data: invoice, error: invError } = await db().from("invoices").select("org_id, vendor_id").eq("id", invoiceId).maybeSingle()
    if (invError) throw invError
    if (!invoice) return res.status(404).json({ error: "Invoice not found" })
    if (scope.mode === "org" ? invoice.org_id !== scope.orgId : invoice.vendor_id !== scope.vendorId) {
      return res.status(404).json({ error: "Invoice not found" })
    }

    const { data, error } = await db()
      .from("invoice_payments")
      .select("*")
      .eq("invoice_id", invoiceId)
      .order("paid_date", { ascending: false })
    if (error) throw error

    res.json({ data })
  } catch (err: any) {
    console.error("[invoices/payments/list]", err.message)
    res.status(500).json({ error: "Failed to list invoice payments" })
  }
})

// POST /api/invoices/payments/create — {invoiceId, amount, paymentMethod,
// referenceNumber?, paidDate?, notes?}. Replaces the old /mark-paid (a bare
// status flip with no amount/method/reference) -- records a real payment
// row and derives the invoice's status from the running total paid,
// supporting partial/installment payments. Same permission gate /mark-paid
// used (invoices.approve/approve_unlimited via canReviewInvoices).
router.post("/payments/create", requireAuth, requireOrg, async (req: Request, res: Response) => {
  try {
    const { invoiceId, amount, paymentMethod, referenceNumber, paidDate, notes } = req.body
    const { orgId } = req as OrgScopedRequest
    const userId = (req as AuthenticatedRequest).user.id

    if (!invoiceId || amount === undefined || !paymentMethod) {
      return res.status(400).json({ error: "invoiceId, amount, and paymentMethod are required" })
    }
    if (Number(amount) <= 0) return res.status(400).json({ error: "amount must be greater than 0" })
    if (!["bank_transfer", "cheque", "cash", "card", "upi", "other"].includes(paymentMethod)) {
      return res.status(400).json({ error: "Invalid paymentMethod" })
    }

    if (!(await canReviewInvoices(userId, orgId))) {
      return res.status(403).json({ error: "You are not authorized to record a payment on this invoice" })
    }

    const { data: existing, error: getError } = await db()
      .from("invoices")
      .select("status, total_amount, vendor_id")
      .eq("id", invoiceId)
      .eq("org_id", orgId)
      .single()
    if (getError) throw getError
    if (!["approved", "partially_paid"].includes(existing.status)) {
      return res.status(400).json({ error: "Only an approved (or partially paid) invoice can receive a payment" })
    }

    const { data: priorPayments, error: priorError } = await db()
      .from("invoice_payments")
      .select("amount")
      .eq("invoice_id", invoiceId)
    if (priorError) throw priorError
    const alreadyPaid = (priorPayments ?? []).reduce((sum: number, p: any) => sum + Number(p.amount), 0)
    const remaining = Number(existing.total_amount) - alreadyPaid

    if (Number(amount) > remaining + 1e-6) {
      return res.status(400).json({ error: `Amount exceeds the remaining balance (${remaining.toFixed(2)})` })
    }

    const { data: payment, error: payError } = await db()
      .from("invoice_payments")
      .insert({
        invoice_id: invoiceId,
        org_id: orgId,
        amount,
        payment_method: paymentMethod,
        reference_number: referenceNumber ?? null,
        paid_date: paidDate || new Date().toISOString().split("T")[0],
        notes: notes ?? null,
        recorded_by: userId,
      })
      .select()
      .single()
    if (payError) throw payError

    const totalPaid = alreadyPaid + Number(amount)
    const fullyPaid = totalPaid >= Number(existing.total_amount) - 1e-6
    const newStatus = fullyPaid ? "paid" : "partially_paid"

    const { data, error } = await db()
      .from("invoices")
      .update({ status: newStatus, paid_at: fullyPaid ? new Date().toISOString() : null })
      .eq("id", invoiceId)
      .eq("org_id", orgId)
      .select()
      .single()
    if (error) throw error

    if (existing.status !== newStatus) {
      await writeAudit({
        entityType: "invoice",
        entityId: invoiceId,
        action: "payment_recorded",
        oldValue: { status: existing.status },
        newValue: { status: newStatus, amount, payment_method: paymentMethod },
        performedBy: userId,
        orgId,
        actingAs: (req as OrgScopedRequest).orgAccess === "group_admin" ? "group_admin" : null,
      })
    }

    const recipientIds = await findVendorRoleHolderIds(existing.vendor_id, ["Admin", "Finance"])
    await notifyUsers(recipientIds, {
      type: "invoice_status_update",
      title: fullyPaid ? "Invoice paid" : "Partial payment recorded",
      message: fullyPaid
        ? "Your invoice has been fully paid."
        : `A partial payment has been recorded on your invoice. Remaining balance: ${(remaining - Number(amount)).toFixed(2)}.`,
      moduleReferenceId: invoiceId,
    })

    res.json({ data: { invoice: data, payment } })
  } catch (err: any) {
    console.error("[invoices/payments/create]", err.message)
    res.status(500).json({ error: err.message || "Failed to record payment" })
  }
})

export default router
