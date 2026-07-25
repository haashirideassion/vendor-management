import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { RequiredLabel } from "@/components/ui/RequiredLabel"
import type { OrgOnboardingDraft } from "@/lib/types"

// Strips a "+91" prefix that may have been persisted with an earlier draft.
function toNationalNumber(value?: string | null) {
  return (value ?? "").replace(/^\+?91/, "").replace(/\D/g, "").slice(0, 10)
}

interface Props {
  draft: OrgOnboardingDraft
  readOnly: boolean
  saving: boolean
  onNext: (fields: Record<string, unknown>) => void
}

export function Step1Welcome({ draft, readOnly, saving, onNext }: Props) {
  const [fullName, setFullName] = useState(draft.full_name ?? "")
  const [designation, setDesignation] = useState(draft.designation ?? "")
  const [workEmail, setWorkEmail] = useState(draft.work_email ?? "")
  const [mobile, setMobile] = useState(() => toNationalNumber(draft.mobile))
  const [acceptedTerms, setAcceptedTerms] = useState(draft.accepted_terms)
  const [isSoloUser, setIsSoloUser] = useState(draft.is_solo_user)

  const valid = !!fullName.trim() && !!workEmail.trim() && /^\d{10}$/.test(mobile) && acceptedTerms

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!valid) return
    onNext({
      full_name: fullName.trim(),
      designation: designation.trim() || null,
      work_email: workEmail.trim(),
      mobile: `+91${mobile}`,
      accepted_terms: acceptedTerms,
      is_solo_user: isSoloUser,
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Company Details</CardTitle>
        <CardDescription>Confirm your details before setting up your organisation's profile.</CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit}>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label>Company Name</Label>
            <Input value={draft.company_name ?? ""} disabled />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label><RequiredLabel>Full Name</RequiredLabel></Label>
            <Input value={fullName} onChange={(e) => setFullName(e.target.value)} disabled={readOnly} placeholder="Jane Smith" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Designation</Label>
            <Input value={designation} onChange={(e) => setDesignation(e.target.value)} disabled={readOnly} placeholder="e.g. HR Manager" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label><RequiredLabel>Work Email</RequiredLabel></Label>
            <Input type="email" value={workEmail} onChange={(e) => setWorkEmail(e.target.value)} disabled={readOnly} placeholder="jane@acme.com" />
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
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={isSoloUser} onCheckedChange={(c) => setIsSoloUser(c === true)} disabled={readOnly} />
            Solo User — I'll manage this organisation on my own (no separate tiered roles)
          </label>
          <label className="flex items-start gap-2 text-sm">
            <Checkbox checked={acceptedTerms} onCheckedChange={(c) => setAcceptedTerms(c === true)} disabled={readOnly} className="mt-0.5" />
            <span>I have read and accept the Terms &amp; Conditions<span className="ml-0.5 text-destructive">*</span></span>
          </label>
          <Button type="submit" className="mt-2 w-full" disabled={!valid || saving || readOnly}>
            {saving ? "Saving…" : "Continue"}
          </Button>
        </CardContent>
      </form>
    </Card>
  )
}
