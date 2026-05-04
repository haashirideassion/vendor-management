import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { DocumentUploader } from "@/components/shared/DocumentUploader"
import { useDocuments } from "@/hooks/useDocuments"
import { DOCUMENT_TYPE_LABELS, REQUIRED_DOCUMENTS } from "@/lib/constants"
import type { DocumentType } from "@/lib/types"
import { cn } from "@/lib/utils"
import { CheckCircle2, Circle } from "lucide-react"

interface Props {
  vendorId: string
  onNext: () => void
}

export function Step5Documents({ vendorId, onNext }: Props) {
  const { data: docs } = useDocuments(vendorId)
  const [uploading, setUploading] = useState(false)
  const [selectedDocType, setSelectedDocType] = useState<DocumentType | "">("")
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
          <p className="text-sm font-medium mb-1">Select document to upload</p>
          {REQUIRED_DOCUMENTS.map((dt) => (
            <div 
              key={dt} 
              className={cn(
                "flex items-center gap-2 text-sm cursor-pointer p-2 rounded-md transition-colors",
                selectedDocType === dt ? "bg-primary/10" : "hover:bg-muted/50"
              )}
              onClick={() => setSelectedDocType(dt)}
            >
              {uploadedTypes.has(dt) ? (
                <CheckCircle2 className="h-4 w-4 text-green-600" />
              ) : selectedDocType === dt ? (
                <div className="h-4 w-4 rounded-full border-[4px] border-primary" /> 
              ) : (
                <Circle className="h-4 w-4 text-muted-foreground" />
              )}
              <span className={cn(
                uploadedTypes.has(dt) && "text-muted-foreground line-through",
                selectedDocType === dt && "font-medium"
              )}>
                {DOCUMENT_TYPE_LABELS[dt]}
              </span>
            </div>
          ))}
        </div>

        <DocumentUploader
          vendorId={vendorId}
          onUploaded={() => {
            setUploading(false)
            setSelectedDocType("")
          }}
          selectedDocType={selectedDocType}
          onDocTypeChange={setSelectedDocType}
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
