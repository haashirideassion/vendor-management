import { useVendor } from "@/hooks/useVendor"
import { useDocuments } from "@/hooks/useDocuments"
import { AnimatedPage } from "@/components/shared/AnimatedPage"
import { DocumentUploader } from "@/components/shared/DocumentUploader"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { useNavigate } from "react-router-dom"
import { DOCUMENT_TYPE_LABELS } from "@/lib/constants"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  CheckmarkCircle01Icon,
  Clock01Icon,
  Refresh01Icon,
  AlertCircleIcon,
  Upload01Icon,
} from "@hugeicons/core-free-icons"
import { format } from "date-fns"
import type { DocumentType } from "@/lib/types"

const RENEWAL_DOCS: DocumentType[] = ["tc_agreement", "insurance_coi"]

export function VendorRenewal() {
  const { data: vendor, isLoading } = useVendor()
  const { data: docs = [] } = useDocuments(vendor?.id)
  const navigate = useNavigate()

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <div className="h-8 w-48 rounded-md bg-muted animate-pulse" />
        <div className="h-28 rounded-xl bg-muted animate-pulse" />
        <div className="h-48 rounded-xl bg-muted animate-pulse" />
      </div>
    )
  }

  if (!vendor) return null

  // Check if docs were uploaded after the renewal notification
  const renewalDate = vendor.renewal_notified_at ? new Date(vendor.renewal_notified_at) : null
  const uploadedTypes = new Set(
    docs
      .filter((d) => !renewalDate || new Date(d.uploaded_at) > renewalDate)
      .map((d) => d.document_type)
  )

  const completedCount = RENEWAL_DOCS.filter((t) => uploadedTypes.has(t)).length
  const allDone = completedCount === RENEWAL_DOCS.length
  const progress = Math.round((completedCount / RENEWAL_DOCS.length) * 100)

  return (
    <AnimatedPage>
      <div className="p-6 space-y-6 max-w-xl">
        {/* Page header */}
        <div>
          <h1 className="text-xl font-bold tracking-tight">Annual Renewal</h1>
          <p className="text-sm text-muted-foreground">
            Complete your annual renewal to maintain Active status.
          </p>
        </div>

        {/* Renewal required banner */}
        <div className="relative overflow-hidden rounded-xl border border-amber-200 bg-amber-50/60 dark:bg-amber-950/20 dark:border-amber-800 p-4">
          <div className="absolute left-0 top-0 bottom-0 w-1 rounded-l-xl" style={{ background: "var(--gradient-warning)" }} />
          <div className="flex items-start gap-3 pl-3">
            <div className="mt-0.5 h-9 w-9 rounded-full bg-orange-100 flex items-center justify-center shrink-0">
              <HugeiconsIcon icon={AlertCircleIcon} size={20} strokeWidth={1.5} className="text-orange-600" />
            </div>
            <div>
              <p className="text-sm font-semibold text-orange-900">Renewal Required</p>
              <p className="text-sm text-orange-700 mt-0.5">
                {vendor.contract_anniversary
                  ? `Your contract anniversary is ${format(new Date(vendor.contract_anniversary), "dd MMM yyyy")}.`
                  : "Your annual renewal is due."}{" "}
                Please upload the updated documents below.
              </p>
            </div>
          </div>
        </div>

        {/* Progress card */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <HugeiconsIcon icon={Refresh01Icon} size={16} strokeWidth={1.5} className="text-primary" />
                <CardTitle className="text-base">Renewal Checklist</CardTitle>
              </div>
              <span className="text-xs text-muted-foreground font-medium">
                {completedCount}/{RENEWAL_DOCS.length} done
              </span>
            </div>
            <Progress value={progress} className="h-1.5 mt-2" />
          </CardHeader>
          <CardContent className="space-y-2">
            {RENEWAL_DOCS.map((dt) => {
              const done = uploadedTypes.has(dt)
              return (
                <div
                  key={dt}
                  className={`flex items-center gap-3 rounded-lg border p-3 transition-colors ${done ? "border-green-200 bg-green-50/50" : "border-border"
                    }`}
                >
                  <HugeiconsIcon
                    icon={done ? CheckmarkCircle01Icon : Clock01Icon}
                    size={18}
                    strokeWidth={1.5}
                    className={done ? "text-green-600 shrink-0" : "text-muted-foreground shrink-0"}
                  />
                  <span className={`text-sm ${done ? "text-green-800 font-medium" : ""}`}>
                    {DOCUMENT_TYPE_LABELS[dt]}
                  </span>
                  {done && (
                    <span className="ml-auto text-xs bg-green-100 text-green-600 px-2 py-0.5 rounded-full font-medium">
                      Uploaded
                    </span>
                  )}
                </div>
              )
            })}
          </CardContent>
        </Card>

        {/* Uploader card */}
        {!allDone && (
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <HugeiconsIcon icon={Upload01Icon} size={16} strokeWidth={1.5} className="text-primary" />
                <CardTitle className="text-base">Upload Documents</CardTitle>
              </div>
              <CardDescription>
                Upload the required documents to complete your renewal.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <DocumentUploader
                vendorId={vendor.id}
                allowedTypes={RENEWAL_DOCS}
              />
            </CardContent>
          </Card>
        )}

        {/* CTA button */}
        <Button
          disabled={!allDone}
          onClick={() => navigate("/vendor/dashboard")}
          className="w-full"
          size="lg"
        >
          {allDone ? (
            <>
              <HugeiconsIcon icon={CheckmarkCircle01Icon} size={18} strokeWidth={1.5} className="mr-2" />
              Renewal submitted — go to dashboard
            </>
          ) : (
            "Upload all required documents to continue"
          )}
        </Button>
      </div>
    </AnimatedPage>
  )
}
