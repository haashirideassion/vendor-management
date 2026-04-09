import { Link } from "react-router-dom"
import { useVendors } from "@/hooks/useVendors"
import { useAuditLog } from "@/hooks/useAuditLog"
import { StatusBadge } from "@/components/shared/StatusBadge"
import { AnimatedPage } from "@/components/shared/AnimatedPage"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { VENDOR_STATUS_LABELS, VENDOR_STATUSES } from "@/lib/constants"
import { formatDistanceToNow, differenceInDays, format } from "date-fns"
import {
  UserGroup02Icon,
  CheckmarkCircle01Icon,
  Clock01Icon,
  AlertCircleIcon,
  Cancel01Icon,
  ChartBarIncreasingIcon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import type { VendorStatus } from "@/lib/types"

const STATUS_META: Record<VendorStatus, { color: string; bg: string; icon: React.ReactNode }> = {
  active: {
    color: "text-green-600 dark:text-green-400",
    bg: "bg-green-50 dark:bg-green-950/30 border-green-100 dark:border-green-900/50",
    icon: <HugeiconsIcon icon={CheckmarkCircle01Icon} size={20} strokeWidth={1.5} className="text-green-600 dark:text-green-400" />,
  },
  pending_review: {
    color: "text-yellow-600 dark:text-yellow-400",
    bg: "bg-yellow-50 dark:bg-yellow-950/30 border-yellow-100 dark:border-yellow-900/50",
    icon: <HugeiconsIcon icon={Clock01Icon} size={20} strokeWidth={1.5} className="text-yellow-600 dark:text-yellow-400" />,
  },
  action_required: {
    color: "text-orange-600 dark:text-orange-400",
    bg: "bg-orange-50 dark:bg-orange-950/30 border-orange-100 dark:border-orange-900/50",
    icon: <HugeiconsIcon icon={AlertCircleIcon} size={20} strokeWidth={1.5} className="text-orange-600 dark:text-orange-400" />,
  },
  suspended: {
    color: "text-red-600 dark:text-red-400",
    bg: "bg-red-50 dark:bg-red-950/30 border-red-100 dark:border-red-900/50",
    icon: <HugeiconsIcon icon={Cancel01Icon} size={20} strokeWidth={1.5} className="text-red-600 dark:text-red-400" />,
  },
  rejected: {
    color: "text-gray-500 dark:text-gray-400",
    bg: "bg-gray-50 dark:bg-gray-950/30 border-gray-100 dark:border-gray-800",
    icon: <HugeiconsIcon icon={Cancel01Icon} size={20} strokeWidth={1.5} className="text-gray-500 dark:text-gray-400" />,
  },
}

export function AdminDashboard() {
  const { data: vendors = [], isLoading } = useVendors()
  const { data: auditLog = [] } = useAuditLog()

  const counts = VENDOR_STATUSES.reduce(
    (acc, s) => ({ ...acc, [s]: vendors.filter((v) => v.status === s).length }),
    {} as Record<VendorStatus, number>
  )

  const renewingSoon = vendors.filter((v) => {
    if (!v.contract_anniversary || v.status !== "active") return false
    const days = differenceInDays(new Date(v.contract_anniversary), new Date())
    return days >= 0 && days <= 30
  })

  const stats = [
    {
      label: "Total Vendors",
      value: vendors.length,
      icon: <HugeiconsIcon icon={UserGroup02Icon} size={20} strokeWidth={1.5} className="text-blue-600 dark:text-blue-400" />,
      bg: "bg-blue-50 dark:bg-blue-950/30 border-blue-100 dark:border-blue-900/50",
      valueColor: "text-blue-700 dark:text-blue-300",
    },
    {
      label: "Active",
      value: counts.active ?? 0,
      icon: STATUS_META.active.icon,
      bg: STATUS_META.active.bg,
      valueColor: "text-green-700 dark:text-green-300",
    },
    {
      label: "Pending Review",
      value: counts.pending_review ?? 0,
      icon: STATUS_META.pending_review.icon,
      bg: STATUS_META.pending_review.bg,
      valueColor: "text-yellow-700 dark:text-yellow-300",
    },
    {
      label: "Action Required",
      value: counts.action_required ?? 0,
      icon: STATUS_META.action_required.icon,
      bg: STATUS_META.action_required.bg,
      valueColor: "text-orange-700 dark:text-orange-300",
    },
    {
      label: "Suspended",
      value: counts.suspended ?? 0,
      icon: STATUS_META.suspended.icon,
      bg: STATUS_META.suspended.bg,
      valueColor: "text-red-700 dark:text-red-300",
    },
    {
      label: "Renewing Soon",
      value: renewingSoon.length,
      icon: <HugeiconsIcon icon={ChartBarIncreasingIcon} size={20} strokeWidth={1.5} className="text-purple-600 dark:text-purple-400" />,
      bg: "bg-purple-50 dark:bg-purple-950/30 border-purple-100 dark:border-purple-900/50",
      valueColor: "text-purple-700 dark:text-purple-300",
    },
  ]

  return (
    <AnimatedPage>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Live overview of all vendors and recent activity.</p>
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {stats.map((s) => (
            <Card key={s.label} className={`border ${s.bg} shadow-none`}>
              <CardContent className="pt-5 pb-4 px-5">
                <div className="flex items-start justify-between mb-3">
                  <div className="p-1.5 rounded-lg bg-white/60 dark:bg-black/20 shadow-sm">
                    {s.icon}
                  </div>
                </div>
                <p className={`text-3xl font-bold tracking-tight ${isLoading ? "text-muted-foreground" : s.valueColor}`}>
                  {isLoading ? "—" : s.value}
                </p>
                <p className="text-xs text-muted-foreground mt-1 leading-tight font-medium">{s.label}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Pending review queue */}
          <Card className="shadow-none">
            <CardHeader className="pb-3 flex-row items-center justify-between border-b">
              <div className="flex items-center gap-2">
                <HugeiconsIcon icon={Clock01Icon} size={16} strokeWidth={1.5} className="text-yellow-600" />
                <CardTitle className="text-sm font-semibold">Pending Review</CardTitle>
              </div>
              <Button asChild variant="ghost" size="sm" className="h-7 text-xs px-2">
                <Link to="/admin/vendors?status=pending_review">View all</Link>
              </Button>
            </CardHeader>
            <CardContent className="pt-3 space-y-1">
              {vendors.filter((v) => v.status === "pending_review").slice(0, 5).length === 0 ? (
                <div className="flex items-center gap-2 py-4">
                  <HugeiconsIcon icon={CheckmarkCircle01Icon} size={16} strokeWidth={1.5} className="text-green-500" />
                  <p className="text-sm text-muted-foreground">No pending applications.</p>
                </div>
              ) : (
                vendors
                  .filter((v) => v.status === "pending_review")
                  .slice(0, 5)
                  .map((v) => (
                    <Link
                      key={v.id}
                      to={`/admin/vendors/${v.id}`}
                      className="flex items-center justify-between p-2.5 rounded-lg hover:bg-accent transition-colors group"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate group-hover:text-primary transition-colors">{v.company_name}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatDistanceToNow(new Date(v.created_at), { addSuffix: true })}
                        </p>
                      </div>
                      <StatusBadge status={v.status} />
                    </Link>
                  ))
              )}
            </CardContent>
          </Card>

          {/* Renewal alerts */}
          <Card className="shadow-none">
            <CardHeader className="pb-3 flex-row items-center justify-between border-b">
              <div className="flex items-center gap-2">
                <HugeiconsIcon icon={ChartBarIncreasingIcon} size={16} strokeWidth={1.5} className="text-purple-600" />
                <CardTitle className="text-sm font-semibold">Renewals Due (30 days)</CardTitle>
              </div>
              <Button asChild variant="ghost" size="sm" className="h-7 text-xs px-2">
                <Link to="/admin/reports">View calendar</Link>
              </Button>
            </CardHeader>
            <CardContent className="pt-3 space-y-1">
              {renewingSoon.length === 0 ? (
                <div className="flex items-center gap-2 py-4">
                  <HugeiconsIcon icon={CheckmarkCircle01Icon} size={16} strokeWidth={1.5} className="text-green-500" />
                  <p className="text-sm text-muted-foreground">No renewals due in the next 30 days.</p>
                </div>
              ) : (
                renewingSoon.slice(0, 5).map((v) => {
                  const days = differenceInDays(new Date(v.contract_anniversary!), new Date())
                  return (
                    <Link
                      key={v.id}
                      to={`/admin/vendors/${v.id}`}
                      className="flex items-center justify-between p-2.5 rounded-lg hover:bg-accent transition-colors group"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate group-hover:text-primary transition-colors">{v.company_name}</p>
                        <p className="text-xs text-muted-foreground">
                          {format(new Date(v.contract_anniversary!), "dd MMM yyyy")}
                        </p>
                      </div>
                      <span
                        className={`text-xs font-semibold px-2 py-0.5 rounded-full shrink-0 ${
                          days <= 7
                            ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                            : "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400"
                        }`}
                      >
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
        <Card className="shadow-none">
          <CardHeader className="pb-3 border-b">
            <div className="flex items-center gap-2">
              <HugeiconsIcon icon={AlertCircleIcon} size={16} strokeWidth={1.5} className="text-muted-foreground" />
              <CardTitle className="text-sm font-semibold">Recent Activity</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="pt-2">
            {auditLog.length === 0 ? (
              <p className="text-sm text-muted-foreground py-3">No activity yet.</p>
            ) : (
              <div className="divide-y divide-border/60">
                {auditLog.slice(0, 10).map((log) => {
                  const v = vendors.find((x) => x.id === log.entity_id)
                  const newStatus = (log.new_value as Record<string, string> | null)?.status as VendorStatus | undefined
                  const oldStatus = (log.old_value as Record<string, string> | null)?.status as VendorStatus | undefined
                  return (
                    <div key={log.id} className="flex items-center justify-between py-3 gap-3 text-sm">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="h-7 w-7 rounded-full bg-muted flex items-center justify-center text-xs font-semibold shrink-0 text-muted-foreground">
                          {v ? v.company_name.charAt(0).toUpperCase() : "?"}
                        </div>
                        <div className="min-w-0">
                          {v ? (
                            <Link to={`/admin/vendors/${v.id}`} className="font-medium hover:underline truncate block">
                              {v.company_name}
                            </Link>
                          ) : (
                            <span className="font-medium text-muted-foreground">Unknown vendor</span>
                          )}
                          <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                            <span className="text-xs text-muted-foreground">
                              {oldStatus ? VENDOR_STATUS_LABELS[oldStatus] : "—"}
                            </span>
                            <span className="text-xs text-muted-foreground">→</span>
                            {newStatus && <StatusBadge status={newStatus} />}
                          </div>
                        </div>
                      </div>
                      <span className="text-xs text-muted-foreground shrink-0 tabular-nums">
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
    </AnimatedPage>
  )
}
