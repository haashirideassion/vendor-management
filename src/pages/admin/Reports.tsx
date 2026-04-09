import { useVendors } from "@/hooks/useVendors"
import { StatusBadge } from "@/components/shared/StatusBadge"
import { AnimatedPage } from "@/components/shared/AnimatedPage"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts"
import { VENDOR_STATUS_LABELS, VENDOR_STATUSES } from "@/lib/constants"
import { differenceInDays, format } from "date-fns"
import { Link } from "react-router-dom"
import { BarChartIcon, Clock01Icon, ChartBarIncreasingIcon, UserGroup02Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import type { VendorStatus } from "@/lib/types"

const CHART_COLORS: Record<VendorStatus, string> = {
  active: "#16a34a",
  pending_review: "#ca8a04",
  action_required: "#ea580c",
  suspended: "#dc2626",
  rejected: "#6b7280",
}

export function Reports() {
  const { data: vendors = [], isLoading } = useVendors()

  const chartData = VENDOR_STATUSES.map((s) => ({
    status: VENDOR_STATUS_LABELS[s],
    count: vendors.filter((v) => v.status === s).length,
    color: CHART_COLORS[s],
    key: s,
  })).filter((d) => d.count > 0)

  const upcomingRenewals = vendors
    .filter((v) => v.contract_anniversary && v.status === "active")
    .map((v) => ({
      ...v,
      daysLeft: differenceInDays(new Date(v.contract_anniversary!), new Date()),
    }))
    .filter((v) => v.daysLeft <= 60)
    .sort((a, b) => a.daysLeft - b.daysLeft)

  const totalActive = vendors.filter((v) => v.status === "active").length
  const pendingCount = vendors.filter((v) => v.status === "pending_review").length
  const renewingIn30 = upcomingRenewals.filter((v) => v.daysLeft <= 30).length

  if (isLoading) return (
    <div className="p-6 flex items-center gap-2 text-sm text-muted-foreground">
      <div className="h-4 w-4 border-2 border-muted-foreground/30 border-t-muted-foreground rounded-full animate-spin" />
      Loading…
    </div>
  )

  return (
    <AnimatedPage>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-xl font-bold tracking-tight">Reports</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Vendor status overview and upcoming renewals.</p>
        </div>

        {/* Quick summary cards */}
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

        {/* Status Chart */}
        <Card className="shadow-none">
          <CardHeader className="pb-3 border-b">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <HugeiconsIcon icon={BarChartIcon} size={16} strokeWidth={1.5} className="text-muted-foreground" />
              Vendors by Status
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-5">
            {chartData.length === 0 ? (
              <div className="flex items-center justify-center h-[200px]">
                <p className="text-sm text-muted-foreground">No vendor data yet.</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                  <XAxis
                    dataKey="status"
                    tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    allowDecimals={false}
                    tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    cursor={{ fill: "hsl(var(--accent))", radius: 4 }}
                    contentStyle={{
                      fontSize: 12,
                      borderRadius: 8,
                      border: "1px solid hsl(var(--border))",
                      boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
                    }}
                  />
                  <Bar dataKey="count" radius={[6, 6, 0, 0]} maxBarSize={60}>
                    {chartData.map((d) => (
                      <Cell key={d.key} fill={d.color} />
                    ))}
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
                      <div className={`w-2 h-2 rounded-full shrink-0 ${
                        v.daysLeft <= 7 ? "bg-red-500" : v.daysLeft <= 30 ? "bg-orange-500" : "bg-yellow-500"
                      }`} />
                      <div className="min-w-0">
                        <Link
                          to={`/admin/vendors/${v.id}`}
                          className="text-sm font-medium hover:underline block truncate"
                        >
                          {v.company_name}
                        </Link>
                        {v.vendor_id_code && (
                          <span className="inline-flex font-mono text-xs bg-muted border border-border/70 rounded px-1.5 py-0.5 text-muted-foreground font-medium mt-0.5">
                            {v.vendor_id_code}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <StatusBadge status={v.status} />
                      <div className="text-right">
                        <p className="text-sm font-medium tabular-nums">
                          {format(new Date(v.contract_anniversary!), "dd MMM yyyy")}
                        </p>
                        <p className={`text-xs font-semibold tabular-nums ${
                          v.daysLeft <= 7
                            ? "text-red-600 dark:text-red-400"
                            : v.daysLeft <= 30
                              ? "text-orange-600 dark:text-orange-400"
                              : "text-yellow-600 dark:text-yellow-400"
                        }`}>
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
    </AnimatedPage>
  )
}
