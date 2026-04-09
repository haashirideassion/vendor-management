import { Link } from "react-router-dom"
import { useVendor } from "@/hooks/useVendor"
import { StatusBadge } from "@/components/shared/StatusBadge"
import { RatingStars } from "@/components/shared/RatingStars"
import { AnimatedPage } from "@/components/shared/AnimatedPage"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { DOCUMENT_TYPE_LABELS, REQUIRED_DOCUMENTS } from "@/lib/constants"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  AlertCircleIcon,
  CheckmarkCircle01Icon,
  Clock01Icon,
  Tag01Icon,
  UserCircleIcon,
  Refresh01Icon,
  ChartBarIncreasingIcon,
} from "@hugeicons/core-free-icons"
import { differenceInDays, format } from "date-fns"

export function VendorDashboard() {
  const { data: vendor, isLoading } = useVendor()

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <div className="h-8 w-48 rounded-md bg-muted animate-pulse" />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 rounded-xl bg-muted animate-pulse" />
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
            <HugeiconsIcon icon={UserCircleIcon} size={32} strokeWidth={1.5} className="text-muted-foreground" />
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
  const avgRating = vendor.avg_rating ?? 0

  const completedDocs = REQUIRED_DOCUMENTS.filter((dt) => uploadedTypes.has(dt)).length
  const docProgress = Math.round((completedDocs / REQUIRED_DOCUMENTS.length) * 100)

  const showRenewalAlert =
    vendor.status === "action_required" ||
    (daysToRenewal !== null && daysToRenewal <= 30 && daysToRenewal >= 0)

  return (
    <AnimatedPage>
      <div className="p-6 space-y-6">
        {/* Page title */}
        <div>
          <h1 className="text-xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground">Your vendor account overview.</p>
        </div>

        {/* Renewal alert banner */}
        {showRenewalAlert && (
          <div className="relative overflow-hidden rounded-xl border border-orange-200 bg-gradient-to-r from-orange-50 to-amber-50 p-4">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 h-8 w-8 rounded-full bg-orange-100 flex items-center justify-center shrink-0">
                <HugeiconsIcon icon={AlertCircleIcon} size={18} strokeWidth={1.5} className="text-orange-600" />
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
              <Button asChild size="sm" className="shrink-0 bg-orange-600 hover:bg-orange-700 text-white border-0">
                <Link to="/vendor/renewal">Renew now</Link>
              </Button>
            </div>
          </div>
        )}

        {/* Stat cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {/* Status card */}
          <Card>
            <CardContent className="pt-5 pb-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Status</span>
                <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                  <HugeiconsIcon icon={ChartBarIncreasingIcon} size={16} strokeWidth={1.5} className="text-primary" />
                </div>
              </div>
              <StatusBadge status={vendor.status} />
              {avgRating > 0 && (
                <div className="flex items-center gap-1.5 mt-2">
                  <RatingStars value={Math.round(avgRating)} size="sm" />
                  <span className="text-xs text-muted-foreground">({avgRating.toFixed(1)})</span>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Vendor ID card */}
          <Card>
            <CardContent className="pt-5 pb-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Vendor ID</span>
                <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                  <HugeiconsIcon icon={UserCircleIcon} size={16} strokeWidth={1.5} className="text-primary" />
                </div>
              </div>
              {vendor.vendor_id_code ? (
                <p className="text-lg font-mono font-bold tracking-tight">{vendor.vendor_id_code}</p>
              ) : (
                <p className="text-sm text-muted-foreground">Not assigned yet</p>
              )}
            </CardContent>
          </Card>

          {/* Renewal date card */}
          <Card>
            <CardContent className="pt-5 pb-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Renewal Date</span>
                <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                  <HugeiconsIcon icon={Refresh01Icon} size={16} strokeWidth={1.5} className="text-primary" />
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
                    <HugeiconsIcon
                      icon={uploaded ? CheckmarkCircle01Icon : Clock01Icon}
                      size={18}
                      strokeWidth={1.5}
                      className={uploaded ? "text-green-600 shrink-0" : "text-muted-foreground shrink-0"}
                    />
                    <span className="text-sm">{DOCUMENT_TYPE_LABELS[dt]}</span>
                  </div>
                  {doc && (
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        doc.verified
                          ? "bg-green-100 text-green-700"
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

        {/* Categories */}
        {vendor.vendor_categories && vendor.vendor_categories.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <HugeiconsIcon icon={Tag01Icon} size={16} strokeWidth={1.5} className="text-primary" />
                <CardTitle className="text-base">Service Categories</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {vendor.vendor_categories.map((vc) => (
                  <span
                    key={vc.id}
                    className="rounded-full bg-primary/10 text-primary px-3 py-1 text-xs font-medium border border-primary/20"
                  >
                    {vc.service_categories?.name}
                  </span>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </AnimatedPage>
  )
}
