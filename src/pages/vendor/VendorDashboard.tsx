import { Link } from "react-router-dom"
import { useVendor } from "@/hooks/useVendor"
import { StatusBadge } from "@/components/shared/StatusBadge"
import { PageHeader } from "@/components/shared/PageHeader"
import { RatingStars } from "@/components/shared/RatingStars"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { DOCUMENT_TYPE_LABELS, REQUIRED_DOCUMENTS } from "@/lib/constants"
import { CheckCircle2, Circle, AlertCircle } from "lucide-react"
import { differenceInDays, format } from "date-fns"

export function VendorDashboard() {
  const { data: vendor, isLoading } = useVendor()

  if (isLoading) {
    return <div className="p-6 text-sm text-muted-foreground">Loading…</div>
  }

  if (!vendor) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 p-6">
        <p className="text-sm text-muted-foreground">You haven't completed your vendor application yet.</p>
        <Button asChild><Link to="/onboarding">Start onboarding</Link></Button>
      </div>
    )
  }

  const docs = vendor.vendor_documents ?? []
  const uploadedTypes = new Set(docs.map((d) => d.document_type))
  const daysToRenewal = vendor.contract_anniversary
    ? differenceInDays(new Date(vendor.contract_anniversary), new Date())
    : null
  const avgRating = vendor.avg_rating ?? 0

  return (
    <div>
      <PageHeader title="Dashboard" description="Your vendor account overview." />

      <div className="p-6 flex flex-col gap-6">
        {/* Renewal alert */}
        {(vendor.status === "action_required" || (daysToRenewal !== null && daysToRenewal <= 30 && daysToRenewal >= 0)) && (
          <div className="flex items-start gap-3 rounded-lg border border-orange-200 bg-orange-50 p-4">
            <AlertCircle className="h-5 w-5 text-orange-600 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-medium text-orange-800">
                {vendor.status === "action_required"
                  ? "Action Required: Your renewal is overdue"
                  : `Renewal due in ${daysToRenewal} days`}
              </p>
              <p className="text-xs text-orange-700 mt-0.5">
                Please review the updated T&C and upload a new Certificate of Insurance.
              </p>
            </div>
            <Button asChild size="sm" variant="outline" className="shrink-0">
              <Link to="/vendor/renewal">Renew now</Link>
            </Button>
          </div>
        )}

        {/* Status card */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Account Status</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Status</span>
              <StatusBadge status={vendor.status} />
            </div>
            {vendor.vendor_id_code && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Vendor ID</span>
                <span className="text-sm font-mono font-semibold">{vendor.vendor_id_code}</span>
              </div>
            )}
            {vendor.contract_anniversary && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Contract renewal</span>
                <span className="text-sm">{format(new Date(vendor.contract_anniversary), "dd MMM yyyy")}</span>
              </div>
            )}
            {avgRating > 0 && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Rating</span>
                <div className="flex items-center gap-1.5">
                  <RatingStars value={Math.round(avgRating)} size="sm" />
                  <span className="text-xs text-muted-foreground">({avgRating.toFixed(1)})</span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Documents checklist */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Required Documents</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {REQUIRED_DOCUMENTS.map((dt) => {
              const uploaded = uploadedTypes.has(dt)
              const doc = docs.find((d) => d.document_type === dt)
              return (
                <div key={dt} className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm">
                    {uploaded ? (
                      <CheckCircle2 className="h-4 w-4 text-green-600" />
                    ) : (
                      <Circle className="h-4 w-4 text-muted-foreground" />
                    )}
                    <span>{DOCUMENT_TYPE_LABELS[dt]}</span>
                  </div>
                  {doc && (
                    <span className={`text-xs px-1.5 py-0.5 rounded ${doc.verified ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"}`}>
                      {doc.verified ? "Verified" : "Pending review"}
                    </span>
                  )}
                </div>
              )
            })}
            <Button asChild variant="outline" size="sm" className="mt-2 w-full">
              <Link to="/vendor/documents">Manage documents</Link>
            </Button>
          </CardContent>
        </Card>

        {/* Categories */}
        {vendor.vendor_categories && vendor.vendor_categories.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Service Categories</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              {vendor.vendor_categories.map((vc) => (
                <span key={vc.id} className="rounded-full bg-primary/10 px-3 py-1 text-xs font-medium">
                  {vc.service_categories?.name}
                </span>
              ))}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
