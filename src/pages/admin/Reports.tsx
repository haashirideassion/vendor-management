import { useVendors } from "@/hooks/useVendors"
import { PageHeader } from "@/components/shared/PageHeader"
import { StatusBadge } from "@/components/shared/StatusBadge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts"
import { VENDOR_STATUS_LABELS, VENDOR_STATUSES } from "@/lib/constants"
import { differenceInDays, format } from "date-fns"
import { Link } from "react-router-dom"
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

  if (isLoading) return <div className="p-6 text-sm text-muted-foreground">Loading…</div>

  return (
    <div>
      <PageHeader title="Reports" description="Vendor status overview and upcoming renewals." />

      <div className="p-6 flex flex-col gap-6">
        {/* Status Chart */}
        <Card>
          <CardHeader><CardTitle className="text-base">Vendors by Status</CardTitle></CardHeader>
          <CardContent>
            {chartData.length === 0 ? (
              <p className="text-sm text-muted-foreground">No vendor data yet.</p>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={chartData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                  <XAxis dataKey="status" tick={{ fontSize: 12 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Bar dataKey="count" radius={[4, 4, 0, 0]}>
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
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Upcoming Renewals (next 60 days)</CardTitle>
          </CardHeader>
          <CardContent>
            {upcomingRenewals.length === 0 ? (
              <p className="text-sm text-muted-foreground">No renewals due in the next 60 days.</p>
            ) : (
              <div className="flex flex-col gap-2">
                {upcomingRenewals.map((v) => (
                  <div key={v.id} className="flex items-center justify-between py-2 border-b last:border-0">
                    <div className="flex items-center gap-3">
                      <div className={`w-2 h-2 rounded-full ${v.daysLeft <= 7 ? "bg-red-500" : v.daysLeft <= 30 ? "bg-orange-500" : "bg-yellow-500"}`} />
                      <div>
                        <Link to={`/admin/vendors/${v.id}`} className="text-sm font-medium hover:underline">
                          {v.company_name}
                        </Link>
                        <p className="text-xs text-muted-foreground">{v.vendor_id_code}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <StatusBadge status={v.status} />
                      <div className="text-right">
                        <p className="text-sm font-medium">
                          {format(new Date(v.contract_anniversary!), "dd MMM yyyy")}
                        </p>
                        <p className={`text-xs font-semibold ${v.daysLeft <= 7 ? "text-red-600" : v.daysLeft <= 30 ? "text-orange-600" : "text-yellow-600"}`}>
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
    </div>
  )
}
