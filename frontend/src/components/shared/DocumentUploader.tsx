import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { FileUploadZone } from "@/components/shared/FileUploadZone"
import { DOCUMENT_TYPE_LABELS, ALL_DOCUMENT_TYPES } from "@/lib/constants"
import type { DocumentType } from "@/lib/types"
import { useUploadDocument } from "@/hooks/useDocuments"
import { toast } from "sonner"

interface DocumentUploaderProps {
  vendorId: string
  onUploaded?: () => void
  allowedTypes?: DocumentType[]
  selectedDocType?: DocumentType | ""
  onDocTypeChange?: (t: DocumentType | "") => void
}

export function DocumentUploader({ 
  vendorId, 
  onUploaded, 
  allowedTypes = ALL_DOCUMENT_TYPES,
  selectedDocType,
  onDocTypeChange
}: DocumentUploaderProps) {
  const [files, setFiles] = useState<File[]>([])
  const [internalDocType, setInternalDocType] = useState<DocumentType | "">("")
  const [expiresAt, setExpiresAt] = useState("")
  const upload = useUploadDocument()

  const isControlled = selectedDocType !== undefined
  const docType = isControlled ? selectedDocType : internalDocType
  const setDocType = isControlled ? onDocTypeChange! : setInternalDocType

  async function handleUpload() {
    if (files.length === 0 || !docType) {
      toast.error("Please select at least one file and a document type")
      return
    }
    try {
      const result = await upload.mutateAsync({ vendorId, files, documentType: docType, expiresAt: expiresAt || undefined })
      if (result.uploaded.length > 0) {
        toast.success(`${result.uploaded.length} document${result.uploaded.length !== 1 ? "s" : ""} uploaded successfully`)
      }
      if (result.failed.length > 0) {
        toast.error(`Failed to upload: ${result.failed.join(", ")}`)
      }
      setFiles([])
      setDocType("")
      setExpiresAt("")
      if (result.failed.length === 0) onUploaded?.()
    } catch (e: unknown) {
      toast.error((e as Error).message ?? "Upload failed")
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <FileUploadZone files={files} onChange={setFiles} disabled={upload.isPending} />

      {!isControlled && (
        <div className="flex flex-col gap-1.5">
          <Label>Document type <span className="text-destructive">*</span></Label>
          <Select value={docType} onValueChange={(v) => setDocType(v as DocumentType)}>
            <SelectTrigger>
              <SelectValue placeholder="Select type…" />
            </SelectTrigger>
            <SelectContent>
              {allowedTypes.map((t) => (
                <SelectItem key={t} value={t}>{DOCUMENT_TYPE_LABELS[t]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {(docType === "insurance_coi") && (
        <div className="flex flex-col gap-1.5">
          <Label>Expiry date (optional)</Label>
          <Input type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
        </div>
      )}

      <Button onClick={handleUpload} disabled={files.length === 0 || !docType || upload.isPending}>
        {upload.isPending
          ? "Uploading…"
          : `Upload ${files.length > 1 ? `${files.length} documents` : "document"}`}
      </Button>
    </div>
  )
}
