import { Link } from "react-router-dom"
import { useVendors } from "@/hooks/useVendors"
import { useProcurementKPIs } from "@/hooks/useAnalytics"
import { StatusBadge } from "@/components/shared/StatusBadge"
import { AnimatedPage } from "@/components/shared/AnimatedPage"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { VENDOR_STATUSES } from "@/lib/constants"
import { formatDistanceToNow } from "date-fns"
import {
  UserGroup02Icon,
  CheckmarkCircle01Icon,
  Clock01Icon,
  File01Icon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import type { VendorStatus } from "@/lib/types"

export function AdminDashboard() {
  const { data: vendors = [], isLoading } = useVendors()
  const { data: analytics }               = useProcurementKPIs()

  const counts = VENDOR_STATUSES.reduce(
    (acc, s) => ({ ...acc, [s]: vendors.filter((v) => v.status === s).length }),
    {} as Record<VendorStatus, number>
  )

  const stats = [
    {
      label: "Total Vendors",
      value: vendors.length,
      icon: <HugeiconsIcon icon={UserGroup02Icon} size={22} strokeWidth={1.5} className="text-white" />,
      bg: "bg-blue-50 dark:bg-blue-950/30 border-blue-100 dark:border-blue-900/50",
      valueColor: "text-blue-700 dark:text-blue-300",
      to: "/admin/vendors",
    },
    {
      label: "All Contracts",
      value: analytics?.kpis.activeContractCount,
      icon: <HugeiconsIcon icon={File01Icon} size={22} strokeWidth={1.5} className="text-white" />,
      bg: "bg-teal-50 dark:bg-teal-950/30 border-teal-100 dark:border-teal-900/50",
      valueColor: "text-teal-700 dark:text-teal-300",
      to: "/admin/contracts",
    },
    {
      label: "Pending Review",
      value: counts.pending_review ?? 0,
      icon: <HugeiconsIcon icon={Clock01Icon} size={22} strokeWidth={1.5} className="text-white" />,
      bg: "bg-yellow-50 dark:bg-yellow-950/30 border-yellow-100 dark:border-yellow-900/50",
      valueColor: "text-yellow-700 dark:text-yellow-300",
      to: "/admin/vendors?status=pending_review",
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

        {/* Stats grid – 3 key cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {stats.map((s) => (
            <Link key={s.label} to={s.to}>
              <Card className={`border ${s.bg} shadow-none hover:shadow-sm transition-shadow cursor-pointer`}>
                <CardContent className="pt-5 pb-4 px-5">
                  <div className="flex items-start justify-between mb-3">
                    <div className="p-2 rounded-lg bg-[image:var(--brand-gradient)] shadow-sm">
                      {s.icon}
                    </div>
                  </div>
                  <p className={`text-3xl font-bold tracking-tight ${isLoading ? "text-muted-foreground" : s.valueColor}`}>
                    {isLoading ? "—" : (s.value ?? "—")}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1 leading-tight font-medium">{s.label}</p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>

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
      </div>
    </AnimatedPage>
  )
}
