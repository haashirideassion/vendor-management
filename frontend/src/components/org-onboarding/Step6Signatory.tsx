import { useRef, useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { RequiredLabel } from "@/components/ui/RequiredLabel"
import { SolarDuotoneIcon } from "@/components/shared/SolarIcon"
import { CheckmarkCircle01Icon, Upload01Icon, Delete02Icon } from "@/components/shared/SolarIcon"
import { cn } from "@/lib/utils"
import { useUploadOrgOnboardingDocument, useDeleteOrgOnboardingDocument } from "@/hooks/useOrgOnboarding"
import type { OrgOnboardingDraft } from "@/lib/types"

// Strips a "+91" prefix that may have been persisted with an earlier draft.
function toNationalNumber(value?: string | null) {
  return (value ?? "").replace(/^\+?91/, "").replace(/\D/g, "").slice(0, 10)
}

const MAX_FILE_SIZE = 15 * 1024 * 1024
const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
])

interface Props {
  draft: OrgOnboardingDraft
  readOnly: boolean
  saving: boolean
  onNext: (fields: Record<string, unknown>) => void
  onBack: () => void
}

export function Step6Signatory({ draft, readOnly, saving, onNext, onBack }: Props) {
  const [name, setName] = useState(draft.signatory_name ?? "")
  const [designation, setDesignation] = useState(draft.signatory_designation ?? "")
  const [email, setEmail] = useState(draft.signatory_email ?? "")
  const [mobile, setMobile] = useState(() => toNationalNumber(draft.signatory_mobile))
  const [sameForAll, setSameForAll] = useState(draft.signatory_same_for_all_locations)

  const upload = useUploadOrgOnboardingDocument()
  const del = useDeleteOrgOnboardingDocument()
  const inputRef = useRef<HTMLInputElement>(null)
  const signatureDoc = (draft.documents ?? []).find((d) => d.document_type === "authorized_signatory_signature")

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
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
    upload.mutate({ document_type: "authorized_signatory_signature", file }, {
      onError: (err: unknown) => toast.error((err as Error).message ?? "Failed to upload signature"),
    })
    e.target.value = ""
  }

  async function handleRemove() {
    if (!signatureDoc) return
    try {
      await del.mutateAsync(signatureDoc.id)
    } catch (e: unknown) {
      toast.error((e as Error).message ?? "Failed to remove signature")
    }
  }

  const valid = !!name.trim() && !!email.trim() && /^\d{10}$/.test(mobile) && !!signatureDoc

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!valid) return
    onNext({
      signatory_name: name.trim(),
      signatory_designation: designation.trim() || null,
      signatory_email: email.trim(),
      signatory_mobile: `+91${mobile}`,
      signatory_same_for_all_locations: sameForAll,
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Authorized Signatory</CardTitle>
        <CardDescription>The person authorized to sign on behalf of this organisation.</CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit}>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label><RequiredLabel>Name</RequiredLabel></Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} disabled={readOnly} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Designation</Label>
            <Input value={designation} onChange={(e) => setDesignation(e.target.value)} disabled={readOnly} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label><RequiredLabel>Email</RequiredLabel></Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} disabled={readOnly} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label><RequiredLabel>Mobile</RequiredLabel></Label>
            <div className="relative">
              <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-base text-muted-foreground">
                +91
              </span>
              <Input
                type="tel"
                inputMode="numeric"
                maxLength={10}
                placeholder="9876543210"
                className="pl-12"
                value={mobile}
                disabled={readOnly}
                onChange={(e) => setMobile(e.target.value.replace(/\D/g, "").slice(0, 10))}
              />
            </div>
          </div>

          <div className={cn(
            "flex items-center justify-between gap-3 rounded-lg border p-3",
            signatureDoc ? "border-green-500/40 bg-green-500/10" : "bg-background"
          )}>
            <div className="flex min-w-0 items-center gap-3">
              <SolarDuotoneIcon
                icon={signatureDoc ? CheckmarkCircle01Icon : Upload01Icon}
                size={18}
                strokeWidth={1.5}
                className={signatureDoc ? "shrink-0 text-green-600" : "shrink-0 text-muted-foreground"}
              />
              <div className="min-w-0">
                <p className="text-sm font-medium">Signature<span className="ml-1 text-destructive">*</span></p>
                {signatureDoc && <p className="truncate text-xs text-muted-foreground">{signatureDoc.file_name}</p>}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {!readOnly && signatureDoc && (
                <Button
                  type="button" variant="ghost" size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-destructive"
                  onClick={handleRemove}
                  disabled={del.isPending}
                >
                  <SolarDuotoneIcon icon={Delete02Icon} size={15} strokeWidth={1.5} primaryColor="currentColor" secondaryColor="currentColor" />
                </Button>
              )}
              {!readOnly && (
                <Button type="button" variant="outline" size="sm" className="h-7 text-xs" disabled={upload.isPending} onClick={() => inputRef.current?.click()}>
                  {signatureDoc ? "Replace" : "Choose file"}
                </Button>
              )}
              <input ref={inputRef} type="file" accept=".pdf,.docx,.jpg,.jpeg" className="hidden" onChange={handleFileChange} disabled={readOnly} />
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={sameForAll} onCheckedChange={(c) => setSameForAll(c === true)} disabled={readOnly} />
            Same signatory for all locations
          </label>

          <div className="mt-2 flex gap-2">
            <Button type="button" variant="outline" className="flex-1" onClick={onBack}>Back</Button>
            <Button type="submit" className="flex-1" disabled={!valid || saving || readOnly}>
              {saving ? "Saving…" : "Continue"}
            </Button>
          </div>
        </CardContent>
      </form>
    </Card>
  )
}
