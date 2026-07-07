import { Link } from "react-router-dom"
import { useVendor } from "@/hooks/useVendor"
import { useContracts } from "@/hooks/useContracts"
import { useEngagements } from "@/hooks/useEngagements"
import { useInvoices } from "@/hooks/useInvoices"
import { AnimatedPage } from "@/components/shared/AnimatedPage"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { DOCUMENT_TYPE_LABELS, REQUIRED_DOCUMENTS } from "@/lib/constants"
import { SolarDuotoneIcon } from "@/components/shared/SolarIcon"
import {
  AlertCircleIcon,
  CheckmarkCircle01Icon,
  Clock01Icon,
  UserCircleIcon,
  Refresh01Icon,
  ContractsIcon,
  Activity01Icon,
  Invoice02Icon,
} from "@/components/shared/SolarIcon"
import { differenceInDays, format } from "date-fns"

export function VendorDashboard() {
  const { data: vendor, isLoading } = useVendor()
  const { data: contracts = [], isLoading: contractsLoading } = useContracts(
    vendor?.id ? { vendor_id: vendor.id } : undefined
  )
  const { data: engagements = [], isLoading: engagementsLoading } = useEngagements()
  const { data: invoices = [], isLoading: invoicesLoading } = useInvoices(
    vendor?.id ? { vendor_id: vendor.id } : undefined
  )

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <div className="h-8 w-48 rounded-md bg-muted animate-pulse" />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {[1, 2].map((i) => (
            <div key={i} className="h-24 rounded-xl bg-muted animate-pulse" />
          ))}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {[1, 2].map((i) => (
            <div key={i} className="h-36 rounded-xl bg-muted animate-pulse" />
          ))}
        </div>
        <div className="h-48 rounded-xl bg-muted animate-pulse" />
      </div>
    )
  }

  if (!vendor) {
    return (
      <AnimatedPage>
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 p-6 text-center">
          <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center">
            <SolarDuotoneIcon icon={UserCircleIcon} size={32} strokeWidth={1.5} className="text-muted-foreground" />
          </div>
          <div className="space-y-1">
            <p className="text-sm font-medium">No vendor account found</p>
            <p className="text-sm text-muted-foreground">You haven't completed your vendor application yet.</p>
          </div>
          <Button asChild>
            <Link to="/onboarding">Start onboarding</Link>
          </Button>
        </div>
      </AnimatedPage>
    )
  }

  const docs = vendor.vendor_documents ?? []
  const uploadedTypes = new Set(docs.map((d) => d.document_type))
  const daysToRenewal = vendor.contract_anniversary
    ? differenceInDays(new Date(vendor.contract_anniversary), new Date())
    : null
  const completedDocs = REQUIRED_DOCUMENTS.filter((dt) => uploadedTypes.has(dt)).length
  const docProgress = Math.round((completedDocs / REQUIRED_DOCUMENTS.length) * 100)

  const showRenewalAlert =
    vendor.status === "action_required" ||
    (daysToRenewal !== null && daysToRenewal <= 30 && daysToRenewal >= 0)

  // Contracts summary
  const activeContracts = contracts.filter((c) => c.status === "active")
  const dormantContracts = contracts.filter((c) => c.status === "expired" || c.status === "terminated")
  const expiringSoon = activeContracts.filter((c) => {
    if (!c.expiry_date) return false
    const d = differenceInDays(new Date(c.expiry_date), new Date())
    return d >= 0 && d <= 30
  })
  const renewalPending = activeContracts.filter((c) => {
    if (!c.expiry_date || !c.auto_renew) return false
    const d = differenceInDays(new Date(c.expiry_date), new Date())
    return d >= 0 && d <= (c.renewal_notice_days ?? 30)
  })

  // Invoices summary
  const paidInvoices = invoices.filter((i) => i.status === "paid")
  const underReviewInvoices = invoices.filter((i) => i.status === "under_review")
  const submittedInvoices = invoices.filter((i) => i.status === "submitted")

  // Engagements summary
  const activeEngagements = engagements.filter((e) => e.status === "approved")
  const pendingEngagements = engagements.filter((e) => e.status === "pending_approval")
  const closedEngagements = engagements.filter((e) => e.status === "completed" || e.status === "cancelled")
  const recentEngagement = engagements[0] ?? null

  return (
    <AnimatedPage>
      <div className="p-6 space-y-6">
        {/* Renewal alert banner */}
        {showRenewalAlert && (
          <div className="relative overflow-hidden rounded-xl border border-amber-200 bg-amber-50/60 dark:bg-amber-950/20 dark:border-amber-800 p-4">
            <div className="absolute left-0 top-0 bottom-0 w-1 rounded-l-xl" style={{ background: "var(--gradient-warning)" }} />
            <div className="flex items-start gap-3 pl-3">
              <div className="mt-0.5 h-8 w-8 rounded-full bg-orange-100 flex items-center justify-center shrink-0">
                <SolarDuotoneIcon icon={AlertCircleIcon} size={18} strokeWidth={1.5} className="text-orange-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-orange-900">
                  {vendor.status === "action_required"
                    ? "Action Required: Your renewal is overdue"
                    : `Renewal due in ${daysToRenewal} day${daysToRenewal === 1 ? "" : "s"}`}
                </p>
                <p className="text-xs text-orange-700 mt-0.5">
                  Please review the updated T&C and upload a new Certificate of Insurance.
                </p>
              </div>
              <Button asChild size="sm" variant="danger" className="shrink-0">
                <Link to="/vendor/renewal">Renew now</Link>
              </Button>
            </div>
          </div>
        )}

        {/* Stat cards — Status + Renewal Date */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Invoices card */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <SolarDuotoneIcon icon={Invoice02Icon} size={16} strokeWidth={1.5} className="text-primary" />
                  <CardTitle className="text-base">Invoices</CardTitle>
                </div>
                <Button asChild variant="ghost" size="sm" className="h-7 text-xs text-primary">
                  <Link to="/vendor/invoices">View all</Link>
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {invoicesLoading ? (
                <div className="space-y-2">
                  {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="h-5 rounded bg-muted animate-pulse" />
                  ))}
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Total</span>
                    <span className="font-semibold">{invoices.length}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Paid</span>
                    <span className="font-semibold">{paidInvoices.length}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Under Review</span>
                    <span className="font-semibold">{underReviewInvoices.length}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Submitted</span>
                    <span className="font-semibold">{submittedInvoices.length}</span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Renewal date card */}
          <Card>
            <CardContent className="pt-5 pb-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Renewal Date</span>
                <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                  <SolarDuotoneIcon icon={Refresh01Icon} size={16} strokeWidth={1.5} className="text-primary" />
                </div>
              </div>
              {vendor.contract_anniversary ? (
                <>
                  <p className="text-lg font-semibold">
                    {format(new Date(vendor.contract_anniversary), "dd MMM yyyy")}
                  </p>
                  {daysToRenewal !== null && daysToRenewal >= 0 && (
                    <p className="text-xs text-muted-foreground mt-0.5">in {daysToRenewal} days</p>
                  )}
                </>
              ) : (
                <p className="text-sm text-muted-foreground">Not set</p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Summary cards — Contracts + Engagements */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Contracts Summary */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <SolarDuotoneIcon icon={ContractsIcon} size={16} strokeWidth={1.5} className="text-primary" />
                  <CardTitle className="text-base">Contracts</CardTitle>
                </div>
                <Button asChild variant="ghost" size="sm" className="h-7 text-xs text-primary">
                  <Link to="/vendor/contracts">View all</Link>
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {contractsLoading ? (
                <div className="space-y-2">
                  {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="h-5 rounded bg-muted animate-pulse" />
                  ))}
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Active</span>
                    <span className="font-semibold">{activeContracts.length}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Expiring Soon</span>
                    <span className={`font-semibold ${expiringSoon.length > 0 ? "text-orange-600" : ""}`}>
                      {expiringSoon.length}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Dormant</span>
                    <span className="font-semibold">{dormantContracts.length}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Renewal Pending</span>
                    <span className={`font-semibold ${renewalPending.length > 0 ? "text-orange-600" : ""}`}>
                      {renewalPending.length}
                    </span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Engagement Summary */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <SolarDuotoneIcon icon={Activity01Icon} size={16} strokeWidth={1.5} className="text-primary" />
                <CardTitle className="text-base">Engagements</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              {engagementsLoading ? (
                <div className="space-y-2">
                  {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="h-5 rounded bg-muted animate-pulse" />
                  ))}
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Active</span>
                    <span className="font-semibold">{activeEngagements.length}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Pending</span>
                    <span className="font-semibold">{pendingEngagements.length}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Closed</span>
                    <span className="font-semibold">{closedEngagements.length}</span>
                  </div>
                  {recentEngagement && (
                    <div className="pt-1 border-t border-border/50 mt-1">
                      <p className="text-xs text-muted-foreground">Latest activity</p>
                      <p className="text-xs font-medium truncate mt-0.5">{recentEngagement.title}</p>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Document checklist */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Required Documents</CardTitle>
              <span className="text-xs text-muted-foreground">{completedDocs}/{REQUIRED_DOCUMENTS.length} uploaded</span>
            </div>
            <Progress value={docProgress} className="h-1.5 mt-2" />
          </CardHeader>
          <CardContent className="space-y-2">
            {REQUIRED_DOCUMENTS.map((dt) => {
              const uploaded = uploadedTypes.has(dt)
              const doc = docs.find((d) => d.document_type === dt)
              return (
                <div
                  key={dt}
                  className="flex items-center justify-between rounded-lg border p-3 gap-3"
                >
                  <div className="flex items-center gap-3">
                    <SolarDuotoneIcon
                      icon={uploaded ? CheckmarkCircle01Icon : Clock01Icon}
                      size={18}
                      strokeWidth={1.5}
                      className={uploaded ? "text-green-600 shrink-0" : "text-muted-foreground shrink-0"}
                    />
                    <span className="text-sm">{DOCUMENT_TYPE_LABELS[dt]}</span>
                  </div>
                  {doc && (
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full font-medium ${doc.verified
                          ? "bg-green-100 text-green-600"
                          : "bg-yellow-100 text-yellow-700"
                        }`}
                    >
                      {doc.verified ? "Verified" : "Pending review"}
                    </span>
                  )}
                  {!doc && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                      Missing
                    </span>
                  )}
                </div>
              )
            })}
            <Button asChild variant="outline" size="sm" className="w-full mt-2">
              <Link to="/vendor/documents">Manage documents</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </AnimatedPage>
  )
}
