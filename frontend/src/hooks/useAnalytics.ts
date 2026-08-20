import { useQuery } from "@tanstack/react-query"
import { api } from "@/lib/api"
import { useAuth } from "@/contexts/AuthContext"
import { format, subMonths, differenceInDays } from "date-fns"

// ─── Narrow row shapes for aggregate queries ──────────────────────────────────

type PORow = {
  id: string
  total_value: number | null
  currency: string | null
  amount_in_base_currency: number | null
  status: string
  created_at: string
  po_type: "standard" | "blanket" | "release"
  parent_po_id: string | null
  vendor: { company_name: string } | null
}

type InvoiceRow    = { id: string; total_amount: number | null; currency: string | null; amount_in_base_currency: number | null; status: string; due_date: string | null }
type ContractRow   = { id: string; status: string; expiry_date: string | null; title: string; contract_ref: string | null; contract_type: string }
type GRNRow        = { id: string; status: string }
type PurchaseRequestRow = { id: string; status: string; estimated_value: number | null }
type RatingRow     = { quality: number; timeliness: number; communication: number; cost_competitiveness: number; compliance: number; overall: number }
type VendorRatingsRow = { id: string; company_name: string; vendor_ratings: RatingRow[] }
type ExceptionRow  = { id: string; status: "open" | "resolved" | "waived"; variance: number; variance_pct: number | null; created_at: string }
type PaymentRow    = { id: string; invoice_id: string; amount: number; paid_date: string }
type BlanketPORow  = {
  id: string; po_number: string | null; total_value: number; currency: string; amount_in_base_currency: number | null
  status: string; po_type: "blanket" | "release"; parent_po_id: string | null; valid_from: string | null; valid_until: string | null
  vendor: { company_name: string } | null
}

// ─── Return types ─────────────────────────────────────────────────────────────

export interface ProcurementKPIs {
  activePOCount: number
  totalPoSpend: number
  activeContractCount: number
  contractsExpiringSoonCount: number
  pendingInvoiceCount: number
  paidAmount: number
  pendingGRNCount: number
  totalPurchaseRequests: number
}

export interface ExpiringContract {
  id: string
  title: string
  contract_ref: string | null
  expiry_date: string
  daysLeft: number
}

export interface VendorRatingSummary {
  vendorId: string
  name: string
  ratingCount: number
  avgOverall: number
  avgQuality: number
  avgTimeliness: number
  avgCommunication: number
  avgCostCompetitiveness: number
  avgCompliance: number
}

export interface BlanketPOUtilization {
  id: string
  poNumber: string | null
  vendorName: string
  currency: string
  totalValue: number
  drawn: number
  remaining: number
  utilizationPct: number
  validUntil: string | null
  daysLeft: number | null
}

export interface MatchExceptionSummary {
  openCount: number
  resolvedCount: number
  waivedCount: number
  exceptionRatePct: number
  avgOpenVariancePct: number
}

export interface PaymentAging {
  outstandingAmount: number
  overdueAmount: number
  overdueCount: number
  agingBuckets: { bucket: string; amount: number }[]
}

export interface ProcurementAnalytics {
  kpis: ProcurementKPIs
  // Every spend figure above/below is converted to this currency (migration
  // 077's amount_in_base_currency) -- POs/invoices in other currencies are
  // no longer silently summed as if they were all the same money.
  baseCurrency: string
  charts: {
    monthlySpend:     { month: string; value: number }[]
    spendByVendor:    { name: string; value: number }[]
    invoiceStatus:    { status: string; count: number }[]
    purchaseRequestFunnel: { status: string; count: number }[]
  }
  contractsExpiringSoon: ExpiringContract[]
  vendorRatingsLeaderboard: VendorRatingSummary[]
  blanketPOUtilization: BlanketPOUtilization[]
  matchExceptions: MatchExceptionSummary
  paymentAging: PaymentAging
}

export interface AnalyticsDateRange {
  from?: string
  to?: string
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useProcurementKPIs(dateRange?: AnalyticsDateRange) {
  const { accessToken } = useAuth()

  return useQuery<ProcurementAnalytics>({
    queryKey: ["analytics", "procurement", dateRange?.from, dateRange?.to],
    staleTime: 60_000,
    queryFn: async () => {
      let pos: PORow[] = []
      let invoices: InvoiceRow[] = []
      let contracts: ContractRow[] = []
      let grns: GRNRow[] = []
      let purchaseRequests: PurchaseRequestRow[] = []
      let baseCurrency = "INR"
      let vendorRatingsRaw: VendorRatingsRow[] = []
      let exceptions: ExceptionRow[] = []
      let payments: PaymentRow[] = []
      let blanketPOs: BlanketPORow[] = []

      try {
        const raw = await api.post<{
          purchase_orders: PORow[], invoices: InvoiceRow[], contracts: ContractRow[], grns: GRNRow[], purchase_requests: PurchaseRequestRow[], base_currency: string
          vendor_ratings: VendorRatingsRow[], invoice_exceptions: ExceptionRow[], invoice_payments: PaymentRow[], blanket_pos: BlanketPORow[]
        }>(
          "/api/analytics/procurement-kpis",
          { from: dateRange?.from, to: dateRange?.to },
          accessToken
        )
        pos            = raw.purchase_orders ?? []
        invoices       = raw.invoices ?? []
        contracts      = raw.contracts ?? []
        grns           = raw.grns ?? []
        purchaseRequests = raw.purchase_requests ?? []
        baseCurrency   = raw.base_currency ?? "INR"
        vendorRatingsRaw = raw.vendor_ratings ?? []
        exceptions     = raw.invoice_exceptions ?? []
        payments       = raw.invoice_payments ?? []
        blanketPOs     = raw.blanket_pos ?? []
      } catch {
        // Fall through with empty arrays — all KPIs will show 0
      }

      // Every PO/invoice is summed in the org's base currency
      // (amount_in_base_currency), not its own transaction currency -- a PO
      // in USD and one in INR are no longer added together as raw numbers.
      const poAmount = (p: PORow) => p.amount_in_base_currency ?? p.total_value ?? 0
      const invoiceAmount = (i: InvoiceRow) => i.amount_in_base_currency ?? i.total_amount ?? 0

      // ── KPIs ───────────────────────────────────────────────────────────────
      // A Blanket PO's total_value is an authorized CAP, not actual spend --
      // only 'standard' POs and its Release Orders (already ordinary rows
      // here) represent money actually committed, so blanket rows are
      // excluded from spend/count everywhere below.
      const spendEligiblePos = pos.filter((p) => p.status !== "cancelled" && p.po_type !== "blanket")
      const activeContracts = contracts.filter((c) => c.status === "active")

      const contractsExpiringSoon = activeContracts
        .filter((c) => {
          if (!c.expiry_date) return false
          const days = differenceInDays(new Date(c.expiry_date), new Date())
          return days >= 0 && days <= 60
        })
        .map((c) => ({
          id:           c.id,
          title:        c.title,
          contract_ref: c.contract_ref,
          expiry_date:  c.expiry_date!,
          daysLeft:     differenceInDays(new Date(c.expiry_date!), new Date()),
        }))
        .sort((a, b) => a.daysLeft - b.daysLeft)

      const pendingInvoices = invoices.filter((i) =>
        ["submitted", "under_review"].includes(i.status)
      )

      const kpis: ProcurementKPIs = {
        activePOCount:             pos.filter((p) => !["cancelled", "closed"].includes(p.status) && p.po_type !== "blanket").length,
        totalPoSpend:              spendEligiblePos.reduce((s, p) => s + poAmount(p), 0),
        activeContractCount:       activeContracts.length,
        contractsExpiringSoonCount: contractsExpiringSoon.length,
        pendingInvoiceCount:       pendingInvoices.length,
        paidAmount:                invoices.filter((i) => i.status === "paid").reduce((s, i) => s + invoiceAmount(i), 0),
        pendingGRNCount:           grns.filter((g) => g.status === "submitted").length,
        totalPurchaseRequests:     purchaseRequests.length,
      }

      // ── Chart: monthly spend (last 6 months) ───────────────────────────────

      const monthlySpend = Array.from({ length: 6 }, (_, i) => {
        const date     = subMonths(new Date(), 5 - i)
        const monthStr = format(date, "yyyy-MM")
        const value    = spendEligiblePos
          .filter((p) => (p.created_at ?? "").startsWith(monthStr))
          .reduce((s, p) => s + poAmount(p), 0)
        return { month: format(date, "MMM yy"), value }
      })

      // ── Chart: top vendors by spend ────────────────────────────────────────

      const vendorMap: Record<string, number> = {}
      for (const po of spendEligiblePos) {
        const name = (po.vendor as { company_name?: string } | null)?.company_name ?? "Unknown"
        vendorMap[name] = (vendorMap[name] ?? 0) + poAmount(po)
      }
      const spendByVendor = Object.entries(vendorMap)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 6)
        .map(([name, value]) => ({ name, value }))

      // ── Chart: invoice status breakdown ────────────────────────────────────

      const invoiceStatusOrder = ["submitted", "under_review", "matched", "approved", "paid", "partially_paid", "rejected"]
      const invoiceStatus = invoiceStatusOrder
        .map((s) => ({ status: s, count: invoices.filter((i) => i.status === s).length }))
        .filter((d) => d.count > 0)

      // ── Chart: purchase request funnel ─────────────────────────────────────

      const purchaseRequestOrder = ["draft", "pending_approval", "approved", "completed", "rejected", "cancelled"]
      const purchaseRequestFunnel = purchaseRequestOrder
        .map((s) => ({ status: s, count: purchaseRequests.filter((e) => e.status === s).length }))
        .filter((d) => d.count > 0)

      // ── Vendor Ratings leaderboard ──────────────────────────────────────────
      // A running reputation score, not a period metric -- deliberately not
      // sliced by the from/to date range (see analytics.ts's comment).
      const vendorRatingsLeaderboard: VendorRatingSummary[] = vendorRatingsRaw
        .filter((v) => v.vendor_ratings.length > 0)
        .map((v) => {
          const ratings = v.vendor_ratings
          const n = ratings.length
          const avg = (key: keyof RatingRow) => ratings.reduce((s, r) => s + r[key], 0) / n
          return {
            vendorId: v.id,
            name: v.company_name,
            ratingCount: n,
            avgOverall: avg("overall"),
            avgQuality: avg("quality"),
            avgTimeliness: avg("timeliness"),
            avgCommunication: avg("communication"),
            avgCostCompetitiveness: avg("cost_competitiveness"),
            avgCompliance: avg("compliance"),
          }
        })
        .sort((a, b) => b.avgOverall - a.avgOverall)

      // ── Blanket PO utilization ──────────────────────────────────────────────
      // Also a live snapshot, not a period metric -- see analytics.ts.
      const blanketParents = blanketPOs.filter((p) => p.po_type === "blanket")
      const releases       = blanketPOs.filter((p) => p.po_type === "release")
      const blanketPOUtilization: BlanketPOUtilization[] = blanketParents.map((b) => {
        const drawn = releases
          .filter((r) => r.parent_po_id === b.id && r.status !== "cancelled")
          .reduce((s, r) => s + Number(r.total_value), 0)
        return {
          id: b.id,
          poNumber: b.po_number,
          vendorName: b.vendor?.company_name ?? "Unknown",
          currency: b.currency,
          totalValue: Number(b.total_value),
          drawn,
          remaining: Number(b.total_value) - drawn,
          utilizationPct: Number(b.total_value) > 0 ? (drawn / Number(b.total_value)) * 100 : 0,
          validUntil: b.valid_until,
          daysLeft: b.valid_until ? differenceInDays(new Date(b.valid_until), new Date()) : null,
        }
      })

      // ── Match exceptions ─────────────────────────────────────────────────────
      const openExceptions = exceptions.filter((e) => e.status === "open")
      const matchExceptions: MatchExceptionSummary = {
        openCount:     openExceptions.length,
        resolvedCount: exceptions.filter((e) => e.status === "resolved").length,
        waivedCount:   exceptions.filter((e) => e.status === "waived").length,
        exceptionRatePct: invoices.length > 0 ? (exceptions.length / invoices.length) * 100 : 0,
        avgOpenVariancePct: openExceptions.length > 0
          ? openExceptions.reduce((s, e) => s + Math.abs(e.variance_pct ?? 0), 0) / openExceptions.length
          : 0,
      }

      // ── Payment aging ─────────────────────────────────────────────────────
      // invoice_payments carries no base-currency-converted amount of its
      // own -- each invoice's own amount_in_base_currency/total_amount ratio
      // (its FX rate at creation, migration 077) is applied to what's been
      // paid against it so outstanding/overdue totals stay in one currency
      // without needing a new column.
      const paidByInvoice = new Map<string, number>()
      for (const p of payments) {
        paidByInvoice.set(p.invoice_id, (paidByInvoice.get(p.invoice_id) ?? 0) + Number(p.amount))
      }
      const today = new Date()
      const agingBucketDefs = [
        { bucket: "0-30",  min: 0,  max: 30 },
        { bucket: "31-60", min: 31, max: 60 },
        { bucket: "61-90", min: 61, max: 90 },
        { bucket: "90+",   min: 91, max: Infinity },
      ]
      let outstandingAmount = 0
      let overdueAmount = 0
      let overdueCount = 0
      const agingBuckets = agingBucketDefs.map((d) => ({ bucket: d.bucket, amount: 0 }))

      for (const i of invoices) {
        if (i.status === "paid" || i.status === "rejected") continue
        const paidRaw   = paidByInvoice.get(i.id) ?? 0
        const fxRatio    = i.total_amount ? invoiceAmount(i) / i.total_amount : 1
        const paidInBase = paidRaw * fxRatio
        const outstanding = Math.max(0, invoiceAmount(i) - paidInBase)
        if (outstanding <= 0) continue
        outstandingAmount += outstanding

        if (i.due_date) {
          const daysOverdue = differenceInDays(today, new Date(i.due_date))
          if (daysOverdue > 0) {
            overdueAmount += outstanding
            overdueCount += 1
            const matchedBucket = agingBucketDefs.find((d) => daysOverdue >= d.min && daysOverdue <= d.max)
            if (matchedBucket) {
              const bucketEntry = agingBuckets.find((b) => b.bucket === matchedBucket.bucket)!
              bucketEntry.amount += outstanding
            }
          }
        }
      }
      const paymentAging: PaymentAging = { outstandingAmount, overdueAmount, overdueCount, agingBuckets }

      return {
        kpis, baseCurrency,
        charts: { monthlySpend, spendByVendor, invoiceStatus, purchaseRequestFunnel },
        contractsExpiringSoon,
        vendorRatingsLeaderboard,
        blanketPOUtilization,
        matchExceptions,
        paymentAging,
      }
    },
  })
}
