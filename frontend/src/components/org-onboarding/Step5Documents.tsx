import { useRef, useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { RequiredLabel } from "@/components/ui/RequiredLabel"
import { SolarDuotoneIcon } from "@/components/shared/SolarIcon"
import { CheckmarkCircle01Icon, Upload01Icon, Delete02Icon } from "@/components/shared/SolarIcon"
import { cn } from "@/lib/utils"
import { REQUIRED_ORG_ONBOARDING_DOCUMENTS, OPTIONAL_ORG_ONBOARDING_DOCUMENTS, ORG_ONBOARDING_DOCUMENT_LABELS } from "@/lib/constants"
import { useUploadOrgOnboardingDocument, useDeleteOrgOnboardingDocument } from "@/hooks/useOrgOnboarding"
import type { OrgOnboardingDraft, OrgOnboardingDocument, OrgOnboardingDocumentType } from "@/lib/types"

// Same 15MB / PDF-JPEG-DOCX validation as vendor onboarding's Step5Documents
// and the backend's upload route (orgOnboarding.ts) -- kept as identical
// constants/messages per the confirmed requirement, not just "similar".
const MAX_FILE_SIZE = 15 * 1024 * 1024
const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
])

interface Props {
  draft: OrgOnboardingDraft
  readOnly: boolean
  onNext: (fields: Record<string, unknown>) => void
  onBack: () => void
}

function DocRow({
  docType, label, required, existingDoc, readOnly, onUpload, onRemove, uploading, deleting,
}: {
  docType: OrgOnboardingDocumentType
  label: string
  required: boolean
  existingDoc: OrgOnboardingDocument | undefined
  readOnly: boolean
  onUpload: (type: OrgOnboardingDocumentType, file: File) => void
  onRemove: (id: string) => void
  uploading: boolean
  deleting: boolean
}) {
  const inputRef = useRef<HTMLInputElement>(null)

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > MAX_FILE_SIZE) {
      toast.error("File must be under 15 MB.")
      e.target.value = ""
      return
    }
    if (!ALLOWED_MIME_TYPES.has(file.type)) {
      toast.error("Only PDF, JPEG, and DOCX files are allowed.")
      e.target.value = ""
      return
    }
    onUpload(docType, file)
    e.target.value = ""
  }

  return (
    <div className={cn(
      "flex items-center justify-between gap-3 rounded-lg border p-3 transition-colors",
      existingDoc ? "border-green-500/40 bg-green-500/10" : "bg-background"
    )}>
      <div className="flex min-w-0 items-center gap-3">
        <SolarDuotoneIcon
          icon={existingDoc ? CheckmarkCircle01Icon : Upload01Icon}
          size={18}
          strokeWidth={1.5}
          className={existingDoc ? "shrink-0 text-green-600" : "shrink-0 text-muted-foreground"}
        />
        <div className="min-w-0">
          <p className="text-sm font-medium">
            {label}
            {required && <span className="ml-1 text-destructive">*</span>}
          </p>
          {existingDoc && <p className="truncate text-xs text-muted-foreground">{existingDoc.file_name}</p>}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {!readOnly && existingDoc && (
          <Button
            type="button" variant="ghost" size="icon"
            className="h-7 w-7 text-muted-foreground hover:text-destructive"
            onClick={() => onRemove(existingDoc.id)}
            disabled={deleting}
            title="Remove file"
          >
            <SolarDuotoneIcon icon={Delete02Icon} size={15} strokeWidth={1.5} primaryColor="currentColor" secondaryColor="currentColor" />
          </Button>
        )}
        {!readOnly && (
          <Button type="button" variant="outline" size="sm" className="h-7 text-xs" disabled={uploading} onClick={() => inputRef.current?.click()}>
            {existingDoc ? "Replace" : "Choose file"}
          </Button>
        )}
        <input ref={inputRef} type="file" accept=".pdf,.docx,.jpg,.jpeg" className="hidden" onChange={handleChange} disabled={readOnly} />
      </div>
    </div>
  )
}

export function Step5Documents({ draft, readOnly, onNext, onBack }: Props) {
  const [panNumber, setPanNumber] = useState(draft.pan_number ?? "")
  const [bankName, setBankName] = useState(draft.bank_name ?? "")
  const [bankAccountNumber, setBankAccountNumber] = useState(draft.bank_account_number ?? "")
  const [bankIfsc, setBankIfsc] = useState(draft.bank_ifsc ?? "")

  const upload = useUploadOrgOnboardingDocument()
  const del = useDeleteOrgOnboardingDocument()
  const docMap = new Map((draft.documents ?? []).map((d) => [d.document_type, d]))

  async function handleUpload(type: OrgOnboardingDocumentType, file: File) {
    try {
      await upload.mutateAsync({ document_type: type, file })
    } catch (e: unknown) {
      toast.error((e as Error).message ?? "Failed to upload document")
    }
  }

  async function handleRemove(id: string) {
    try {
      await del.mutateAsync(id)
    } catch (e: unknown) {
      toast.error((e as Error).message ?? "Failed to remove document")
    }
  }

  const allRequiredDocs = REQUIRED_ORG_ONBOARDING_DOCUMENTS.every((t) => docMap.has(t))
  const fieldsValid = !!panNumber.trim() && !!bankName.trim() && !!bankAccountNumber.trim() && !!bankIfsc.trim()
  const canContinue = allRequiredDocs && fieldsValid

  function handleContinue() {
    if (!canContinue) return
    onNext({
      pan_number: panNumber.trim(),
      bank_name: bankName.trim(),
      bank_account_number: bankAccountNumber.trim(),
      bank_ifsc: bankIfsc.trim(),
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Documents</CardTitle>
        <CardDescription>
          Files are uploaded as soon as you choose them. PDF, JPEG, or DOCX only, up to 15 MB each.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label><RequiredLabel>PAN Number</RequiredLabel></Label>
            <Input value={panNumber} onChange={(e) => setPanNumber(e.target.value.toUpperCase())} disabled={readOnly} placeholder="ABCDE1234F" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label><RequiredLabel>Bank Name</RequiredLabel></Label>
            <Input value={bankName} onChange={(e) => setBankName(e.target.value)} disabled={readOnly} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label><RequiredLabel>Account Number</RequiredLabel></Label>
            <Input value={bankAccountNumber} onChange={(e) => setBankAccountNumber(e.target.value)} disabled={readOnly} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label><RequiredLabel>IFSC Code</RequiredLabel></Label>
            <Input value={bankIfsc} onChange={(e) => setBankIfsc(e.target.value.toUpperCase())} disabled={readOnly} placeholder="SBIN0001234" />
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Required</p>
          {REQUIRED_ORG_ONBOARDING_DOCUMENTS.map((dt) => (
            <DocRow
              key={dt} docType={dt} label={ORG_ONBOARDING_DOCUMENT_LABELS[dt]} required
              existingDoc={docMap.get(dt)} readOnly={readOnly}
              onUpload={handleUpload} onRemove={handleRemove}
              uploading={upload.isPending} deleting={del.isPending}
            />
          ))}
        </div>

        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Optional</p>
          {OPTIONAL_ORG_ONBOARDING_DOCUMENTS.map((dt) => (
            <DocRow
              key={dt} docType={dt} label={ORG_ONBOARDING_DOCUMENT_LABELS[dt]} required={false}
              existingDoc={docMap.get(dt)} readOnly={readOnly}
              onUpload={handleUpload} onRemove={handleRemove}
              uploading={upload.isPending} deleting={del.isPending}
            />
          ))}
        </div>

        <div className="mt-2 flex gap-2">
          <Button type="button" variant="outline" className="flex-1" onClick={onBack}>Back</Button>
          <Button type="button" className="flex-1" onClick={handleContinue} disabled={!canContinue || readOnly}>
            {canContinue ? "Continue" : "Complete required fields & documents"}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
