import { useQuery } from "@tanstack/react-query"
import { api } from "@/lib/api"
import { useAuth } from "@/contexts/AuthContext"
import { format, subMonths, differenceInDays } from "date-fns"

// ─── Narrow row shapes for aggregate queries ──────────────────────────────────

type PORow = {
  id: string
  total_value: number | null
  status: string
  created_at: string
  vendor: { company_name: string } | null
}

type InvoiceRow   = { id: string; total_amount: number | null; status: string }
type ContractRow  = { id: string; status: string; expiry_date: string | null; title: string; contract_ref: string | null; contract_type: string }
type GRNRow       = { id: string; status: string }
type EngagementRow = { id: string; status: string; estimated_value: number | null }

// ─── Return types ─────────────────────────────────────────────────────────────

export interface ProcurementKPIs {
  activePOCount: number
  totalPoSpend: number
  activeContractCount: number
  contractsExpiringSoonCount: number
  pendingInvoiceCount: number
  paidAmount: number
  pendingGRNCount: number
  totalEngagements: number
}

export interface ExpiringContract {
  id: string
  title: string
  contract_ref: string | null
  expiry_date: string
  daysLeft: number
}

export interface ProcurementAnalytics {
  kpis: ProcurementKPIs
  charts: {
    monthlySpend:     { month: string; value: number }[]
    spendByVendor:    { name: string; value: number }[]
    invoiceStatus:    { status: string; count: number }[]
    engagementFunnel: { status: string; count: number }[]
  }
  contractsExpiringSoon: ExpiringContract[]
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useProcurementKPIs() {
  const { accessToken } = useAuth()

  return useQuery<ProcurementAnalytics>({
    queryKey: ["analytics", "procurement"],
    staleTime: 60_000,
    queryFn: async () => {
      let pos: PORow[] = []
      let invoices: InvoiceRow[] = []
      let contracts: ContractRow[] = []
      let grns: GRNRow[] = []
      let engagements: EngagementRow[] = []

      try {
        const raw = await api.post<{ purchase_orders: PORow[], invoices: InvoiceRow[], contracts: ContractRow[], grns: GRNRow[], engagements: EngagementRow[] }>(
          "/api/analytics/procurement-kpis",
          {},
          accessToken
        )
        pos         = raw.purchase_orders ?? []
        invoices    = raw.invoices ?? []
        contracts   = raw.contracts ?? []
        grns        = raw.grns ?? []
        engagements = raw.engagements ?? []
      } catch {
        // Fall through with empty arrays — all KPIs will show 0
      }

      // ── KPIs ───────────────────────────────────────────────────────────────

      const nonCancelledPos = pos.filter((p) => p.status !== "cancelled")
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
        activePOCount:             pos.filter((p) => !["cancelled", "closed"].includes(p.status)).length,
        totalPoSpend:              nonCancelledPos.reduce((s, p) => s + (p.total_value ?? 0), 0),
        activeContractCount:       activeContracts.length,
        contractsExpiringSoonCount: contractsExpiringSoon.length,
        pendingInvoiceCount:       pendingInvoices.length,
        paidAmount:                invoices.filter((i) => i.status === "paid").reduce((s, i) => s + (i.total_amount ?? 0), 0),
        pendingGRNCount:           grns.filter((g) => g.status === "submitted").length,
        totalEngagements:          engagements.length,
      }

      // ── Chart: monthly spend (last 6 months) ───────────────────────────────

      const monthlySpend = Array.from({ length: 6 }, (_, i) => {
        const date     = subMonths(new Date(), 5 - i)
        const monthStr = format(date, "yyyy-MM")
        const value    = nonCancelledPos
          .filter((p) => (p.created_at ?? "").startsWith(monthStr))
          .reduce((s, p) => s + (p.total_value ?? 0), 0)
        return { month: format(date, "MMM yy"), value }
      })

      // ── Chart: top vendors by spend ────────────────────────────────────────

      const vendorMap: Record<string, number> = {}
      for (const po of nonCancelledPos) {
        const name = (po.vendor as { company_name?: string } | null)?.company_name ?? "Unknown"
        vendorMap[name] = (vendorMap[name] ?? 0) + (po.total_value ?? 0)
      }
      const spendByVendor = Object.entries(vendorMap)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 6)
        .map(([name, value]) => ({ name, value }))

      // ── Chart: invoice status breakdown ────────────────────────────────────

      const invoiceStatusOrder = ["submitted", "under_review", "matched", "approved", "paid", "rejected"]
      const invoiceStatus = invoiceStatusOrder
        .map((s) => ({ status: s, count: invoices.filter((i) => i.status === s).length }))
        .filter((d) => d.count > 0)

      // ── Chart: engagement funnel ───────────────────────────────────────────

      const engagementOrder = ["draft", "pending_approval", "approved", "completed", "rejected", "cancelled"]
      const engagementFunnel = engagementOrder
        .map((s) => ({ status: s, count: engagements.filter((e) => e.status === s).length }))
        .filter((d) => d.count > 0)

      return { kpis, charts: { monthlySpend, spendByVendor, invoiceStatus, engagementFunnel }, contractsExpiringSoon }
    },
  })
}
