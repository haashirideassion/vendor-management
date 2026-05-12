import { useVendors } from "@/hooks/useVendors"
import { useProcurementKPIs } from "@/hooks/useAnalytics"
import { StatusBadge } from "@/components/shared/StatusBadge"
import { AnimatedPage } from "@/components/shared/AnimatedPage"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
} from "recharts"
import {
  VENDOR_STATUS_LABELS,
  VENDOR_STATUSES,
  INVOICE_STATUS_LABELS,
  INVOICE_STATUS_COLORS,
  ENGAGEMENT_STATUS_LABELS,
} from "@/lib/constants"
import { formatCurrency } from "@/lib/utils"
import { differenceInDays, format } from "date-fns"
import { Link } from "react-router-dom"
import {
  BarChartIcon,
  Clock01Icon,
  ChartBarIncreasingIcon,
  UserGroup02Icon,
  Briefcase01Icon,
  Invoice01Icon,
  File01Icon,
  AlertCircleIcon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import type { VendorStatus, InvoiceStatus, EngagementStatus } from "@/lib/types"

const VENDOR_CHART_COLORS: Record<VendorStatus, string> = {
  active:          "#16a34a",
  pending_review:  "#ca8a04",
  action_required: "#ea580c",
  suspended:       "#dc2626",
  rejected:        "#6b7280",
}

const INVOICE_CHART_COLORS: Partial<Record<InvoiceStatus, string>> = {
  submitted:    "#6b7280",
  under_review: "#ca8a04",
  matched:      "#2563eb",
  approved:     "#16a34a",
  paid:         "#7c3aed",
  rejected:     "#dc2626",
}

const ENGAGEMENT_CHART_COLORS: Partial<Record<EngagementStatus, string>> = {
  draft:            "#6b7280",
  pending_approval: "#ca8a04",
  approved:         "#2563eb",
  completed:        "#16a34a",
  rejected:         "#dc2626",
  cancelled:        "#9ca3af",
}

function compactNum(v: number): string {
  if (v >= 10_000_000) return `₹${(v / 10_000_000).toFixed(1)}Cr`
  if (v >= 100_000)    return `₹${(v / 100_000).toFixed(1)}L`
  if (v >= 1_000)      return `₹${(v / 1_000).toFixed(0)}K`
  return `₹${Math.round(v)}`
}

const TOOLTIP_STYLE = {
  fontSize: 12,
  borderRadius: 8,
  border: "1px solid hsl(var(--border))",
  boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
  backgroundColor: "hsl(var(--popover))",
  color: "hsl(var(--popover-foreground))",
}

export function Reports() {
  const { data: vendors = [], isLoading } = useVendors()
  const { data: analytics }               = useProcurementKPIs()

  const vendorChartData = VENDOR_STATUSES
    .map((s) => ({
      status: VENDOR_STATUS_LABELS[s],
      count:  vendors.filter((v) => v.status === s).length,
      color:  VENDOR_CHART_COLORS[s],
      key:    s,
    }))
    .filter((d) => d.count > 0)

  const upcomingRenewals = vendors
    .filter((v) => v.contract_anniversary && v.status === "active")
    .map((v) => ({
      ...v,
      daysLeft: differenceInDays(new Date(v.contract_anniversary!), new Date()),
    }))
    .filter((v) => v.daysLeft <= 60)
    .sort((a, b) => a.daysLeft - b.daysLeft)

  const totalActive  = vendors.filter((v) => v.status === "active").length
  const pendingCount = vendors.filter((v) => v.status === "pending_review").length
  const renewingIn30 = upcomingRenewals.filter((v) => v.daysLeft <= 30).length

  const kpis        = analytics?.kpis
  const charts      = analytics?.charts
  const expiring    = analytics?.contractsExpiringSoon ?? []

  if (isLoading) return (
    <div className="p-6 flex items-center gap-2 text-sm text-muted-foreground">
      <div className="h-4 w-4 border-2 border-muted-foreground/30 border-t-muted-foreground rounded-full animate-spin" />
      Loading…
    </div>
  )

  return (
    <AnimatedPage>
      <div className="p-6 space-y-8">

        {/* ── Vendor Overview ─────────────────────────────────────────────── */}
        <div className="space-y-6">
          <div>
            <h1 className="text-xl font-bold tracking-tight">Reports</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Vendor and procurement analytics.</p>
          </div>

          {/* Vendor KPI cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <Card className="shadow-none bg-blue-50 dark:bg-blue-950/30 border-blue-100 dark:border-blue-900/50">
              <CardContent className="pt-5 pb-4 px-5">
                <div className="mb-3 p-1.5 w-fit rounded-lg bg-white/60 dark:bg-black/20 shadow-sm">
                  <HugeiconsIcon icon={UserGroup02Icon} size={18} strokeWidth={1.5} className="text-blue-600 dark:text-blue-400" />
                </div>
                <p className="text-3xl font-bold tracking-tight text-blue-700 dark:text-blue-300">{vendors.length}</p>
                <p className="text-xs text-muted-foreground mt-1 font-medium">Total Vendors</p>
              </CardContent>
            </Card>
            <Card className="shadow-none bg-green-50 dark:bg-green-950/30 border-green-100 dark:border-green-900/50">
              <CardContent className="pt-5 pb-4 px-5">
                <div className="mb-3 p-1.5 w-fit rounded-lg bg-white/60 dark:bg-black/20 shadow-sm">
                  <HugeiconsIcon icon={ChartBarIncreasingIcon} size={18} strokeWidth={1.5} className="text-green-600 dark:text-green-400" />
                </div>
                <p className="text-3xl font-bold tracking-tight text-green-700 dark:text-green-300">{totalActive}</p>
                <p className="text-xs text-muted-foreground mt-1 font-medium">Active Vendors</p>
              </CardContent>
            </Card>
            <Card className="shadow-none bg-orange-50 dark:bg-orange-950/30 border-orange-100 dark:border-orange-900/50">
              <CardContent className="pt-5 pb-4 px-5">
                <div className="mb-3 p-1.5 w-fit rounded-lg bg-white/60 dark:bg-black/20 shadow-sm">
                  <HugeiconsIcon icon={Clock01Icon} size={18} strokeWidth={1.5} className="text-orange-600 dark:text-orange-400" />
                </div>
                <p className="text-3xl font-bold tracking-tight text-orange-700 dark:text-orange-300">{pendingCount}</p>
                <p className="text-xs text-muted-foreground mt-1 font-medium">Pending Review</p>
              </CardContent>
            </Card>
          </div>

          {/* Vendor Status Chart */}
          <Card className="shadow-none">
            <CardHeader className="pb-3 border-b">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <HugeiconsIcon icon={BarChartIcon} size={16} strokeWidth={1.5} className="text-muted-foreground" />
                Vendors by Status
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-5">
              {vendorChartData.length === 0 ? (
                <div className="flex items-center justify-center h-[200px]">
                  <p className="text-sm text-muted-foreground">No vendor data yet.</p>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={vendorChartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                    <XAxis dataKey="status" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                    <Tooltip cursor={{ fill: "rgba(0,0,0,0.04)", radius: 4 }} contentStyle={TOOLTIP_STYLE} />
                    <Bar dataKey="count" radius={[6, 6, 0, 0]} maxBarSize={60}>
                      {vendorChartData.map((d) => <Cell key={d.key} fill={d.color} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          {/* Renewal Calendar */}
          <Card className="shadow-none">
            <CardHeader className="pb-3 border-b">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <HugeiconsIcon icon={Clock01Icon} size={16} strokeWidth={1.5} className="text-muted-foreground" />
                  Upcoming Renewals (next 60 days)
                </CardTitle>
                {renewingIn30 > 0 && (
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400">
                    {renewingIn30} due in 30d
                  </span>
                )}
              </div>
            </CardHeader>
            <CardContent className="pt-3">
              {upcomingRenewals.length === 0 ? (
                <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
                  <HugeiconsIcon icon={ChartBarIncreasingIcon} size={15} strokeWidth={1.5} className="text-green-500" />
                  No renewals due in the next 60 days.
                </div>
              ) : (
                <div className="flex flex-col divide-y divide-border/60">
                  {upcomingRenewals.map((v) => (
                    <div key={v.id} className="flex items-center justify-between py-3 gap-4 hover:bg-accent/40 rounded-lg px-2 -mx-2 transition-colors">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={`w-2 h-2 rounded-full shrink-0 ${v.daysLeft <= 7 ? "bg-red-500" : v.daysLeft <= 30 ? "bg-orange-500" : "bg-yellow-500"}`} />
                        <div className="min-w-0">
                          <Link to={`/admin/vendors/${v.id}`} className="text-sm font-medium hover:underline block truncate">{v.company_name}</Link>
                          {v.vendor_id_code && (
                            <span className="inline-flex font-mono text-xs bg-muted border border-border/70 rounded px-1.5 py-0.5 text-muted-foreground font-medium mt-0.5">{v.vendor_id_code}</span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <StatusBadge status={v.status} />
                        <div className="text-right">
                          <p className="text-sm font-medium tabular-nums">{format(new Date(v.contract_anniversary!), "dd MMM yyyy")}</p>
                          <p className={`text-xs font-semibold tabular-nums ${v.daysLeft <= 7 ? "text-red-600 dark:text-red-400" : v.daysLeft <= 30 ? "text-orange-600 dark:text-orange-400" : "text-yellow-600 dark:text-yellow-400"}`}>
                            {v.daysLeft === 0 ? "Due today" : v.daysLeft < 0 ? "Overdue" : `In ${v.daysLeft} days`}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <Separator />

        {/* ── Procurement Analytics ────────────────────────────────────────── */}
        <div className="space-y-6">
          <div>
            <h2 className="text-base font-semibold tracking-tight">Procurement</h2>
            <p className="text-sm text-muted-foreground mt-0.5">Spend, contracts, and engagement pipeline.</p>
          </div>

          {/* Procurement KPI cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Card className="shadow-none bg-violet-50 dark:bg-violet-950/30 border-violet-100 dark:border-violet-900/50">
              <CardContent className="pt-5 pb-4 px-5">
                <div className="mb-3 p-1.5 w-fit rounded-lg bg-white/60 dark:bg-black/20 shadow-sm">
                  <HugeiconsIcon icon={Invoice01Icon} size={18} strokeWidth={1.5} className="text-violet-600 dark:text-violet-400" />
                </div>
                <p className="text-2xl font-bold tracking-tight text-violet-700 dark:text-violet-300 tabular-nums">
                  {kpis ? compactNum(kpis.totalPoSpend) : "—"}
                </p>
                <p className="text-xs text-muted-foreground mt-1 font-medium">Total PO Spend</p>
              </CardContent>
            </Card>
            <Card className="shadow-none bg-blue-50 dark:bg-blue-950/30 border-blue-100 dark:border-blue-900/50">
              <CardContent className="pt-5 pb-4 px-5">
                <div className="mb-3 p-1.5 w-fit rounded-lg bg-white/60 dark:bg-black/20 shadow-sm">
                  <HugeiconsIcon icon={Briefcase01Icon} size={18} strokeWidth={1.5} className="text-blue-600 dark:text-blue-400" />
                </div>
                <p className="text-2xl font-bold tracking-tight text-blue-700 dark:text-blue-300 tabular-nums">
                  {kpis?.activePOCount ?? "—"}
                </p>
                <p className="text-xs text-muted-foreground mt-1 font-medium">Open Purchase Orders</p>
              </CardContent>
            </Card>
            <Card className="shadow-none bg-green-50 dark:bg-green-950/30 border-green-100 dark:border-green-900/50">
              <CardContent className="pt-5 pb-4 px-5">
                <div className="mb-3 p-1.5 w-fit rounded-lg bg-white/60 dark:bg-black/20 shadow-sm">
                  <HugeiconsIcon icon={File01Icon} size={18} strokeWidth={1.5} className="text-green-600 dark:text-green-400" />
                </div>
                <p className="text-2xl font-bold tracking-tight text-green-700 dark:text-green-300 tabular-nums">
                  {kpis?.activeContractCount ?? "—"}
                </p>
                <p className="text-xs text-muted-foreground mt-1 font-medium">Active Contracts</p>
              </CardContent>
            </Card>
            <Card className="shadow-none bg-orange-50 dark:bg-orange-950/30 border-orange-100 dark:border-orange-900/50">
              <CardContent className="pt-5 pb-4 px-5">
                <div className="mb-3 p-1.5 w-fit rounded-lg bg-white/60 dark:bg-black/20 shadow-sm">
                  <HugeiconsIcon icon={AlertCircleIcon} size={18} strokeWidth={1.5} className="text-orange-600 dark:text-orange-400" />
                </div>
                <p className="text-2xl font-bold tracking-tight text-orange-700 dark:text-orange-300 tabular-nums">
                  {kpis?.pendingInvoiceCount ?? "—"}
                </p>
                <p className="text-xs text-muted-foreground mt-1 font-medium">Pending Invoices</p>
              </CardContent>
            </Card>
          </div>

          {/* Monthly Spend */}
          <Card className="shadow-none">
            <CardHeader className="pb-3 border-b">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <HugeiconsIcon icon={BarChartIcon} size={16} strokeWidth={1.5} className="text-muted-foreground" />
                Monthly PO Spend (last 6 months)
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-5">
              {!charts?.monthlySpend.some((d) => d.value > 0) ? (
                <div className="flex items-center justify-center h-[180px]">
                  <p className="text-sm text-muted-foreground">No PO data yet.</p>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={charts?.monthlySpend} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                    <XAxis dataKey="month" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} tickFormatter={compactNum} width={52} />
                    <Tooltip
                      cursor={{ fill: "rgba(0,0,0,0.04)", radius: 4 }}
                      contentStyle={TOOLTIP_STYLE}
                      formatter={(v: number | undefined) => [formatCurrency(v ?? 0, "INR"), "Spend"]}
                    />
                    <Bar dataKey="value" radius={[6, 6, 0, 0]} maxBarSize={48} fill="oklch(0.52 0.105 223.128)" />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Top Vendors by Spend */}
            <Card className="shadow-none">
              <CardHeader className="pb-3 border-b">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <HugeiconsIcon icon={UserGroup02Icon} size={16} strokeWidth={1.5} className="text-muted-foreground" />
                  Top Vendors by PO Spend
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-5">
                {!charts?.spendByVendor.length ? (
                  <div className="flex items-center justify-center h-[160px]">
                    <p className="text-sm text-muted-foreground">No spend data yet.</p>
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={Math.max(140, (charts.spendByVendor.length * 36) + 16)}>
                    <BarChart data={charts.spendByVendor} layout="vertical" margin={{ top: 0, right: 8, left: 0, bottom: 0 }}>
                      <XAxis type="number" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} tickFormatter={compactNum} />
                      <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} width={100} />
                      <Tooltip
                        cursor={{ fill: "rgba(0,0,0,0.04)", radius: 4 }}
                        contentStyle={TOOLTIP_STYLE}
                        formatter={(v: number | undefined) => [formatCurrency(v ?? 0, "INR"), "Spend"]}
                      />
                      <Bar dataKey="value" radius={[0, 6, 6, 0]} maxBarSize={20} fill="#7c3aed" />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            {/* Invoice Status Breakdown */}
            <Card className="shadow-none">
              <CardHeader className="pb-3 border-b">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <HugeiconsIcon icon={Invoice01Icon} size={16} strokeWidth={1.5} className="text-muted-foreground" />
                  Invoice Status Breakdown
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-5">
                {!charts?.invoiceStatus.length ? (
                  <div className="flex items-center justify-center h-[160px]">
                    <p className="text-sm text-muted-foreground">No invoice data yet.</p>
                  </div>
                ) : (
                  <div className="space-y-2.5 pt-1">
                    {charts.invoiceStatus.map((d) => {
                      const total  = charts.invoiceStatus.reduce((s, x) => s + x.count, 0)
                      const pct    = total > 0 ? Math.round((d.count / total) * 100) : 0
                      const color  = INVOICE_CHART_COLORS[d.status as InvoiceStatus] ?? "#6b7280"
                      const label  = INVOICE_STATUS_LABELS[d.status as InvoiceStatus] ?? d.status
                      const chipCls = INVOICE_STATUS_COLORS[d.status as InvoiceStatus] ?? "bg-gray-100 text-gray-700 border-gray-200"
                      return (
                        <div key={d.status} className="space-y-1">
                          <div className="flex items-center justify-between text-xs">
                            <span className={`inline-flex items-center rounded-full px-2 py-0.5 font-medium border ${chipCls}`}>{label}</span>
                            <span className="tabular-nums text-muted-foreground">{d.count} ({pct}%)</span>
                          </div>
                          <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                            <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: color }} />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Engagement Funnel */}
          {charts?.engagementFunnel && charts.engagementFunnel.length > 0 && (
            <Card className="shadow-none">
              <CardHeader className="pb-3 border-b">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <HugeiconsIcon icon={ChartBarIncreasingIcon} size={16} strokeWidth={1.5} className="text-muted-foreground" />
                  Engagement Pipeline
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-5">
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={charts.engagementFunnel} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                    <XAxis
                      dataKey="status"
                      tickFormatter={(s) => ENGAGEMENT_STATUS_LABELS[s as EngagementStatus] ?? s}
                      tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                    <Tooltip
                      cursor={{ fill: "rgba(0,0,0,0.04)", radius: 4 }}
                      contentStyle={TOOLTIP_STYLE}
                      labelFormatter={(s) => ENGAGEMENT_STATUS_LABELS[s as EngagementStatus] ?? s}
                    />
                    <Bar dataKey="count" radius={[6, 6, 0, 0]} maxBarSize={56}>
                      {charts.engagementFunnel.map((d) => (
                        <Cell key={d.status} fill={ENGAGEMENT_CHART_COLORS[d.status as EngagementStatus] ?? "#6b7280"} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          {/* Contract expiry alerts */}
          {expiring.length > 0 && (
            <Card className="shadow-none border-orange-200 dark:border-orange-900/50">
              <CardHeader className="pb-3 border-b border-orange-100 dark:border-orange-900/30">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2 text-orange-700 dark:text-orange-400">
                    <HugeiconsIcon icon={AlertCircleIcon} size={16} strokeWidth={1.5} />
                    Contracts Expiring in 60 Days ({expiring.length})
                  </CardTitle>
                </div>
              </CardHeader>
              <CardContent className="pt-3">
                <div className="flex flex-col divide-y divide-border/60">
                  {expiring.map((c) => (
                    <div key={c.id} className="flex items-center justify-between py-3 gap-4">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={`w-2 h-2 rounded-full shrink-0 ${c.daysLeft <= 14 ? "bg-red-500" : "bg-orange-400"}`} />
                        <div className="min-w-0">
                          <Link to={`/admin/contracts/${c.id}`} className="text-sm font-medium hover:underline block truncate">{c.title}</Link>
                          {c.contract_ref && <span className="font-mono text-[11px] text-muted-foreground">{c.contract_ref}</span>}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm tabular-nums">{format(new Date(c.expiry_date), "dd MMM yyyy")}</p>
                        <p className={`text-xs font-semibold tabular-nums ${c.daysLeft <= 14 ? "text-red-600" : "text-orange-600"}`}>
                          In {c.daysLeft} day{c.daysLeft !== 1 ? "s" : ""}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </AnimatedPage>
  )
}
