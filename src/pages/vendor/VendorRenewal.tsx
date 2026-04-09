import { useVendor } from "@/hooks/useVendor"
import { PageHeader } from "@/components/shared/PageHeader"
import { DocumentUploader } from "@/components/shared/DocumentUploader"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { useNavigate } from "react-router-dom"
import { useDocuments } from "@/hooks/useDocuments"
import { DOCUMENT_TYPE_LABELS } from "@/lib/constants"
import { CheckCircle2, Circle } from "lucide-react"
import { format } from "date-fns"
import type { DocumentType } from "@/lib/types"

const RENEWAL_DOCS: DocumentType[] = ["tc_agreement", "insurance_coi"]

export function VendorRenewal() {
  const { data: vendor, isLoading } = useVendor()
  const { data: docs = [] } = useDocuments(vendor?.id)
  const navigate = useNavigate()

  if (isLoading) return <div className="p-6 text-sm text-muted-foreground">Loading…</div>
  if (!vendor) return null

  // Check if docs were uploaded after the renewal notification
  const renewalDate = vendor.renewal_notified_at ? new Date(vendor.renewal_notified_at) : null
  const uploadedTypes = new Set(
    docs
      .filter((d) => !renewalDate || new Date(d.uploaded_at) > renewalDate)
      .map((d) => d.document_type)
  )
  const allDone = RENEWAL_DOCS.every((t) => uploadedTypes.has(t))

  return (
    <div>
      <PageHeader
        title="Annual Renewal"
        description="Please complete your annual renewal to maintain Active status."
      />
      <div className="p-6 flex flex-col gap-6 max-w-xl">
        <Card className="border-orange-200 bg-orange-50">
          <CardHeader>
            <CardTitle className="text-base text-orange-800">Renewal Required</CardTitle>
            <CardDescription className="text-orange-700">
              {vendor.contract_anniversary
                ? `Your contract anniversary is ${format(new Date(vendor.contract_anniversary), "dd MMM yyyy")}.`
                : "Your annual renewal is due."}{" "}
              Please upload the updated documents below.
            </CardDescription>
          </CardHeader>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Documents to Upload</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 mb-4">
            {RENEWAL_DOCS.map((dt) => (
              <div key={dt} className="flex items-center gap-2 text-sm">
                {uploadedTypes.has(dt) ? (
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                ) : (
                  <Circle className="h-4 w-4 text-muted-foreground" />
                )}
                {DOCUMENT_TYPE_LABELS[dt]}
              </div>
            ))}
          </CardContent>

          <CardContent>
            <DocumentUploader
              vendorId={vendor.id}
              allowedTypes={RENEWAL_DOCS}
            />
          </CardContent>
        </Card>

        <Button
          disabled={!allDone}
          onClick={() => navigate("/vendor/dashboard")}
          className="w-full"
        >
          {allDone ? "Renewal submitted — go to dashboard" : "Upload all required documents to continue"}
        </Button>
      </div>
    </div>
  )
}
