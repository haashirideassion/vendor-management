import { useRef } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { DOCUMENT_TYPE_LABELS, REQUIRED_DOCUMENTS } from "@/lib/constants"
import type { DocumentType } from "@/lib/types"
import type { LocalDocument } from "./OnboardingWizard"
import { SolarDuotoneIcon } from "@/components/shared/SolarIcon"
import { CheckmarkCircle01Icon, Upload01Icon, Delete02Icon } from "@/components/shared/SolarIcon"
import { cn } from "@/lib/utils"

const OPTIONAL_DOCUMENTS: DocumentType[] = ["insurance_coi", "bank_letter", "tax_certificate", "other"]
const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10 MB

interface Props {
  localDocs: LocalDocument[]
  onDocsChange: (docs: LocalDocument[]) => void
  onNext: () => void
  onBack: () => void
}

function DocRow({
  docType,
  label,
  required,
  existingDoc,
  onFileSelected,
  onRemove,
}: {
  docType: DocumentType
  label: string
  required: boolean
  existingDoc: LocalDocument | undefined
  onFileSelected: (type: DocumentType, file: File) => void
  onRemove: (type: DocumentType) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > MAX_FILE_SIZE) {
      toast.error("File must be under 10 MB.")
      e.target.value = ""
      return
    }
    onFileSelected(docType, file)
    e.target.value = ""
  }

  return (
    <div className={cn(
      "flex items-center justify-between rounded-lg border p-3 gap-3 transition-colors",
      existingDoc ? "border-green-500/40 bg-green-500/10" : "bg-background"
    )}>
      <div className="flex items-center gap-3 min-w-0">
        <SolarDuotoneIcon
          icon={existingDoc ? CheckmarkCircle01Icon : Upload01Icon}
          size={18}
          strokeWidth={1.5}
          className={existingDoc ? "text-green-600 shrink-0" : "text-muted-foreground shrink-0"}
        />
        <div className="min-w-0">
          <p className="text-sm font-medium">
            {label}
            {required && <span className="text-destructive ml-1">*</span>}
          </p>
          {existingDoc && (
            <p className="text-xs text-muted-foreground truncate">{existingDoc.fileName}</p>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {existingDoc ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground hover:text-destructive"
            onClick={() => onRemove(docType)}
            title="Remove file"
          >
            <SolarDuotoneIcon icon={Delete02Icon} size={15} strokeWidth={1.5} primaryColor="currentColor" secondaryColor="currentColor" />
          </Button>
        ) : (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={() => inputRef.current?.click()}
          >
            Choose file
          </Button>
        )}
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.png,.jpg,.jpeg"
          className="hidden"
          onChange={handleChange}
        />
      </div>
    </div>
  )
}

export function Step5Documents({ localDocs, onDocsChange, onNext, onBack }: Props) {
  const docMap = new Map(localDocs.map((d) => [d.type, d]))

  function handleFileSelected(type: DocumentType, file: File) {
    const updated = localDocs.filter((d) => d.type !== type)
    onDocsChange([...updated, { type, file, fileName: file.name }])
  }

  function handleRemove(type: DocumentType) {
    onDocsChange(localDocs.filter((d) => d.type !== type))
  }

  const allRequired = REQUIRED_DOCUMENTS.every((t) => docMap.has(t))

  return (
    <Card>
      <CardHeader>
        <CardTitle>Upload Documents</CardTitle>
        <CardDescription>
          Select the required documents. Files are uploaded only after you submit on the Review screen.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Required</p>
          {REQUIRED_DOCUMENTS.map((dt) => (
            <DocRow
              key={dt}
              docType={dt}
              label={DOCUMENT_TYPE_LABELS[dt]}
              required
              existingDoc={docMap.get(dt)}
              onFileSelected={handleFileSelected}
              onRemove={handleRemove}
            />
          ))}
        </div>

        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Optional</p>
          {OPTIONAL_DOCUMENTS.map((dt) => (
            <DocRow
              key={dt}
              docType={dt}
              label={DOCUMENT_TYPE_LABELS[dt]}
              required={false}
              existingDoc={docMap.get(dt)}
              onFileSelected={handleFileSelected}
              onRemove={handleRemove}
            />
          ))}
        </div>

        <div className="flex gap-3 pt-2">
          <Button type="button" variant="outline" className="flex-1" onClick={onBack}>
            Back
          </Button>
          <Button
            type="button"
            className="flex-1"
            onClick={onNext}
            disabled={!allRequired}
          >
            {allRequired ? "Continue to Review" : "Upload required documents to continue"}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
