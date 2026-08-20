import { Router, Request, Response } from "express"
import { getSupabaseAdmin } from "../utils/supabaseAdmin"
import { requireAuth } from "../middleware/auth"
import { requireOrg, OrgScopedRequest } from "../middleware/org"

const router = Router()
function db(): any { return getSupabaseAdmin() }

// POST /api/analytics/procurement-kpis — { from?, to? } (ISO date strings,
// both optional). Previously had no requireOrg and no org_id filter on any
// of these 5 queries at all -- every caller saw every org's purchase
// orders/invoices/contracts/GRNs/purchase requests, a cross-tenant data leak.
// Fixed here alongside adding the currency fields needed for
// base-currency-converted spend totals (frontend was previously summing
// purchase_orders.total_value / invoices.total_amount directly, blind to
// each row's actual currency).
//
// from/to scope the PERIOD-based tables (purchase_orders/invoices/grns/
// purchase_requests/invoice_exceptions, all by created_at; invoice_payments by
// paid_date). Deliberately NOT applied to: contracts (expiry alert is a
// forward-looking current-state view, not a period metric), blanket_pos
// (utilization is a live cap-vs-drawn snapshot, not something that makes
// sense sliced by when the Blanket PO was created), or vendor_ratings (a
// running reputation leaderboard, not a period activity count).
function applyDateRange(query: any, column: string, from?: string, to?: string) {
  if (from) query = query.gte(column, from)
  if (to) query = query.lte(column, to)
  return query
}

router.post("/procurement-kpis", requireAuth, requireOrg, async (req: Request, res: Response) => {
  try {
    const { orgId } = req as OrgScopedRequest
    const { from, to }: { from?: string; to?: string } = req.body ?? {}

    const [
      { data: data1, error: err1 },
      { data: data2, error: err2 },
      { data: data3, error: err3 },
      { data: data4, error: err4 },
      { data: data5, error: err5 },
      { data: orgRow, error: orgErr },
      { data: data6, error: err6 },
      { data: data7, error: err7 },
      { data: data8, error: err8 },
      { data: data9, error: err9 },
    ] = await Promise.all([
      applyDateRange(
        db()
          .from("purchase_orders")
          .select("id, total_value, currency, amount_in_base_currency, status, created_at, po_type, parent_po_id, vendor:vendor_id(company_name)")
          .eq("org_id", orgId),
        "created_at", from, to
      ),
      applyDateRange(
        db()
          .from("invoices")
          .select("id, total_amount, currency, amount_in_base_currency, status, due_date, created_at")
          .eq("org_id", orgId),
        "created_at", from, to
      ),
      db()
        .from("contracts")
        .select("id, status, expiry_date, title, contract_ref, contract_type")
        .eq("org_id", orgId),
      applyDateRange(
        db()
          .from("grns")
          .select("id, status")
          .eq("org_id", orgId),
        "created_at", from, to
      ),
      applyDateRange(
        db()
          .from("purchase_requests")
          .select("id, status, estimated_value")
          .eq("org_id", orgId),
        "created_at", from, to
      ),
      db()
        .from("organizations")
        .select("base_currency")
        .eq("id", orgId)
        .single(),
      // Vendor Ratings leaderboard -- scoped to vendors actually associated
      // with this org (organization_vendors), same pattern as vendors.ts's
      // /list -- vendor_ratings itself has no org_id column since a rating
      // is inherently vendor-global, not per-org.
      db()
        .from("vendors")
        .select("id, company_name, organization_vendors!inner(org_id), vendor_ratings(quality, timeliness, communication, cost_competitiveness, compliance, overall)")
        .eq("organization_vendors.org_id", orgId),
      // Match exceptions -- open/resolved/waived counts + variance for a
      // 3-way-match exception-rate KPI (migration 073).
      applyDateRange(
        db()
          .from("invoice_exceptions")
          .select("id, status, variance, variance_pct, created_at")
          .eq("org_id", orgId),
        "created_at", from, to
      ),
      // Payments -- for outstanding/aging (migration 074).
      applyDateRange(
        db()
          .from("invoice_payments")
          .select("id, invoice_id, amount, paid_date")
          .eq("org_id", orgId),
        "paid_date", from, to
      ),
      // Blanket PO utilization -- deliberately its own unfiltered query (see
      // comment above): a live drawn-vs-remaining snapshot, not a period
      // metric. Release Orders are already ordinary rows in the main
      // purchase_orders query above; fetched again here (this time
      // unfiltered) purely so utilization isn't skewed by the from/to window.
      db()
        .from("purchase_orders")
        .select("id, po_number, total_value, currency, amount_in_base_currency, status, po_type, parent_po_id, valid_from, valid_until, vendor:vendor_id(company_name)")
        .eq("org_id", orgId)
        .in("po_type", ["blanket", "release"]),
    ])

    const firstError = err1 || err2 || err3 || err4 || err5 || orgErr || err6 || err7 || err8 || err9
    if (firstError) throw firstError

    res.json({
      purchase_orders: data1,
      invoices: data2,
      contracts: data3,
      grns: data4,
      purchase_requests: data5,
      base_currency: orgRow?.base_currency ?? "INR",
      vendor_ratings: data6,
      invoice_exceptions: data7,
      invoice_payments: data8,
      blanket_pos: data9,
    })
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Unexpected error" })
  }
})

export default router
