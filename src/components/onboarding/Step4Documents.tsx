import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { DocumentUploader } from "@/components/shared/DocumentUploader"
import { useDocuments } from "@/hooks/useDocuments"
import { DOCUMENT_TYPE_LABELS, REQUIRED_DOCUMENTS } from "@/lib/constants"
import { CheckCircle2, Circle } from "lucide-react"

interface Props {
  vendorId: string
  onNext: () => void
}

export function Step4Documents({ vendorId, onNext }: Props) {
  const { data: docs } = useDocuments(vendorId)
  const [uploading, setUploading] = useState(false)
  void uploading

  const uploadedTypes = new Set(docs?.map((d) => d.document_type) ?? [])
  const allRequired = REQUIRED_DOCUMENTS.every((t) => uploadedTypes.has(t))

  return (
    <Card>
      <CardHeader>
        <CardTitle>Upload Documents</CardTitle>
        <CardDescription>Please upload the required documents to complete your application.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        {/* Required documents checklist */}
        <div className="rounded-lg border p-4 flex flex-col gap-2">
          <p className="text-sm font-medium mb-1">Required documents</p>
          {REQUIRED_DOCUMENTS.map((dt) => (
            <div key={dt} className="flex items-center gap-2 text-sm">
              {uploadedTypes.has(dt) ? (
                <CheckCircle2 className="h-4 w-4 text-green-600" />
              ) : (
                <Circle className="h-4 w-4 text-muted-foreground" />
              )}
              <span className={uploadedTypes.has(dt) ? "line-through text-muted-foreground" : ""}>
                {DOCUMENT_TYPE_LABELS[dt]}
              </span>
            </div>
          ))}
        </div>

        <DocumentUploader
          vendorId={vendorId}
          onUploaded={() => setUploading(false)}
        />

        <Button
          onClick={onNext}
          disabled={!allRequired}
          className="w-full"
        >
          {allRequired ? "Continue to review" : "Upload required documents to continue"}
        </Button>

        <p className="text-xs text-muted-foreground text-center">
          You can upload additional documents after submission from your dashboard.
        </p>
      </CardContent>
    </Card>
  )
}
