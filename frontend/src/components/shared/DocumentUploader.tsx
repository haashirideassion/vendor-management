import { useCallback, useState } from "react"
import { useDropzone } from "react-dropzone"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Input } from "@/components/ui/input"
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
  const [file, setFile] = useState<File | null>(null)
  const [internalDocType, setInternalDocType] = useState<DocumentType | "">("")
  const [expiresAt, setExpiresAt] = useState("")
  const upload = useUploadDocument()

  const isControlled = selectedDocType !== undefined
  const docType = isControlled ? selectedDocType : internalDocType
  const setDocType = isControlled ? onDocTypeChange! : setInternalDocType

  const onDrop = useCallback((accepted: File[]) => {
    if (accepted[0]) setFile(accepted[0])
  }, [])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { "application/pdf": [".pdf"], "image/*": [".png", ".jpg", ".jpeg"] },
    maxFiles: 1,
    maxSize: 10 * 1024 * 1024, // 10 MB
  })

  async function handleUpload() {
    if (!file || !docType) {
      toast.error("Please select a file and document type")
      return
    }
    try {
      await upload.mutateAsync({ vendorId, file, documentType: docType, expiresAt: expiresAt || undefined })
      toast.success("Document uploaded successfully")
      setFile(null)
      setDocType("")
      setExpiresAt("")
      onUploaded?.()
    } catch (e: unknown) {
      toast.error((e as Error).message ?? "Upload failed")
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div
        {...getRootProps()}
        className={cn(
          "flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-8 text-center cursor-pointer transition-colors",
          isDragActive ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
        )}
      >
        <input {...getInputProps()} />
        {file ? (
          <div className="flex flex-col items-center gap-1">
            <p className="text-sm font-medium">{file.name}</p>
            <p className="text-xs text-muted-foreground">{(file.size / 1024).toFixed(0)} KB</p>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={(e) => { e.stopPropagation(); setFile(null) }}
            >
              Remove
            </Button>
          </div>
        ) : (
          <>
            <p className="text-sm font-medium">Drag & drop or click to upload</p>
            <p className="text-xs text-muted-foreground mt-1">PDF, PNG, JPG up to 10 MB</p>
          </>
        )}
      </div>

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

      <Button onClick={handleUpload} disabled={!file || !docType || upload.isPending}>
        {upload.isPending ? "Uploading…" : "Upload document"}
      </Button>
    </div>
  )
}
