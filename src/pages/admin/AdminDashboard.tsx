import { Link } from "react-router-dom"
import { useVendors } from "@/hooks/useVendors"
import { useAuditLog } from "@/hooks/useAuditLog"
import { PageHeader } from "@/components/shared/PageHeader"
import { StatusBadge } from "@/components/shared/StatusBadge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { VENDOR_STATUS_LABELS, VENDOR_STATUSES } from "@/lib/constants"
import { formatDistanceToNow, differenceInDays, format } from "date-fns"
import { Users, CheckCircle2, Clock, AlertCircle, XCircle, TrendingUp } from "lucide-react"
import type { VendorStatus } from "@/lib/types"

const STATUS_ICONS: Record<VendorStatus, React.ReactNode> = {
  active:          <CheckCircle2 className="h-5 w-5 text-green-600" />,
  pending_review:  <Clock className="h-5 w-5 text-yellow-600" />,
  action_required: <AlertCircle className="h-5 w-5 text-orange-600" />,
  suspended:       <XCircle className="h-5 w-5 text-red-600" />,
  rejected:        <XCircle className="h-5 w-5 text-gray-500" />,
}

export function AdminDashboard() {
  const { data: vendors = [], isLoading } = useVendors()
  const { data: auditLog = [] } = useAuditLog()

  const counts = VENDOR_STATUSES.reduce((acc, s) => ({ ...acc, [s]: vendors.filter((v) => v.status === s).length }), {} as Record<VendorStatus, number>)

  const renewingSoon = vendors.filter((v) => {
    if (!v.contract_anniversary || v.status !== "active") return false
    const days = differenceInDays(new Date(v.contract_anniversary), new Date())
    return days >= 0 && days <= 30
  })

  const stats = [
    { label: "Total Vendors", value: vendors.length, icon: <Users className="h-5 w-5 text-blue-600" />, bg: "bg-blue-50 dark:bg-blue-950/30" },
    { label: "Active",        value: counts.active ?? 0, icon: STATUS_ICONS.active, bg: "bg-green-50 dark:bg-green-950/30" },
    { label: "Pending Review",value: counts.pending_review ?? 0, icon: STATUS_ICONS.pending_review, bg: "bg-yellow-50 dark:bg-yellow-950/30" },
    { label: "Action Required",value: counts.action_required ?? 0, icon: STATUS_ICONS.action_required, bg: "bg-orange-50 dark:bg-orange-950/30" },
    { label: "Suspended",     value: counts.suspended ?? 0, icon: STATUS_ICONS.suspended, bg: "bg-red-50 dark:bg-red-950/30" },
    { label: "Renewing Soon", value: renewingSoon.length, icon: <TrendingUp className="h-5 w-5 text-purple-600" />, bg: "bg-purple-50 dark:bg-purple-950/30" },
  ]

  return (
    <div>
      <PageHeader title="Dashboard" description="Live overview of all vendors and recent activity." />
      <div className="p-6 space-y-6">
        {/* Stats grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {stats.map((s) => (
            <Card key={s.label} className={s.bg}>
              <CardContent className="pt-4 pb-3">
                <div className="flex items-start justify-between">
                  {s.icon}
                </div>
                <p className="text-2xl font-bold mt-2">{isLoading ? "—" : s.value}</p>
                <p className="text-xs text-muted-foreground mt-0.5 leading-tight">{s.label}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Pending review queue */}
          <Card>
            <CardHeader className="pb-3 flex-row items-center justify-between">
              <CardTitle className="text-sm font-semibold">Pending Review</CardTitle>
              <Button asChild variant="ghost" size="sm" className="h-7 text-xs">
                <Link to="/admin/vendors?status=pending_review">View all</Link>
              </Button>
            </CardHeader>
            <CardContent className="space-y-2">
              {vendors.filter((v) => v.status === "pending_review").slice(0, 5).length === 0 ? (
                <p className="text-sm text-muted-foreground py-2">No pending applications.</p>
              ) : (
                vendors.filter((v) => v.status === "pending_review").slice(0, 5).map((v) => (
                  <Link key={v.id} to={`/admin/vendors/${v.id}`} className="flex items-center justify-between p-2 rounded-md hover:bg-accent transition-colors">
                    <div>
                      <p className="text-sm font-medium">{v.company_name}</p>
                      <p className="text-xs text-muted-foreground">{formatDistanceToNow(new Date(v.created_at), { addSuffix: true })}</p>
                    </div>
                    <StatusBadge status={v.status} />
                  </Link>
                ))
              )}
            </CardContent>
          </Card>

          {/* Renewal alerts */}
          <Card>
            <CardHeader className="pb-3 flex-row items-center justify-between">
              <CardTitle className="text-sm font-semibold">Renewals Due (30 days)</CardTitle>
              <Button asChild variant="ghost" size="sm" className="h-7 text-xs">
                <Link to="/admin/reports">View calendar</Link>
              </Button>
            </CardHeader>
            <CardContent className="space-y-2">
              {renewingSoon.length === 0 ? (
                <p className="text-sm text-muted-foreground py-2">No renewals due in the next 30 days.</p>
              ) : (
                renewingSoon.slice(0, 5).map((v) => {
                  const days = differenceInDays(new Date(v.contract_anniversary!), new Date())
                  return (
                    <Link key={v.id} to={`/admin/vendors/${v.id}`} className="flex items-center justify-between p-2 rounded-md hover:bg-accent transition-colors">
                      <div>
                        <p className="text-sm font-medium">{v.company_name}</p>
                        <p className="text-xs text-muted-foreground">{format(new Date(v.contract_anniversary!), "dd MMM yyyy")}</p>
                      </div>
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${days <= 7 ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" : "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400"}`}>
                        {days === 0 ? "Today" : `${days}d`}
                      </span>
                    </Link>
                  )
                })
              )}
            </CardContent>
          </Card>
        </div>

        {/* Recent activity */}
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-sm font-semibold">Recent Activity</CardTitle></CardHeader>
          <CardContent>
            {auditLog.length === 0 ? (
              <p className="text-sm text-muted-foreground py-2">No activity yet.</p>
            ) : (
              <div className="divide-y">
                {auditLog.slice(0, 10).map((log) => {
                  const v = vendors.find((x) => x.id === log.entity_id)
                  const newStatus = (log.new_value as Record<string, string> | null)?.status as VendorStatus | undefined
                  const oldStatus = (log.old_value as Record<string, string> | null)?.status as VendorStatus | undefined
                  return (
                    <div key={log.id} className="flex items-center justify-between py-2.5 gap-2 text-sm">
                      <div className="min-w-0">
                        {v ? (
                          <Link to={`/admin/vendors/${v.id}`} className="font-medium hover:underline">{v.company_name}</Link>
                        ) : (
                          <span className="font-medium text-muted-foreground">Unknown vendor</span>
                        )}
                        <span className="text-muted-foreground">
                          {" "}status: {oldStatus ? VENDOR_STATUS_LABELS[oldStatus] : "—"} → {" "}
                        </span>
                        {newStatus && <StatusBadge status={newStatus} />}
                      </div>
                      <span className="text-xs text-muted-foreground shrink-0">
                        {formatDistanceToNow(new Date(log.created_at), { addSuffix: true })}
                      </span>
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
