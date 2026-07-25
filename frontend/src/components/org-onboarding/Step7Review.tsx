import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { SolarDuotoneIcon } from "@/components/shared/SolarIcon"
import {
  Edit01Icon, Building06Icon, BankIcon, Tag01Icon, File01Icon, AlertCircleIcon, UserCircleIcon,
} from "@/components/shared/SolarIcon"
import { LEGAL_ENTITY_TYPE_LABELS, REQUIRED_ORG_ONBOARDING_DOCUMENTS, ORG_ONBOARDING_DOCUMENT_LABELS } from "@/lib/constants"
import type { OrgOnboardingDraft } from "@/lib/types"

interface Props {
  draft: OrgOnboardingDraft
  readOnly: boolean
  submitting: boolean
  onEdit: (step: number) => void
  onSubmit: () => void
  onBack: () => void
}

function SectionCard({
  title, step, onEdit, children, icon, readOnly,
}: {
  title: string
  step: number
  onEdit: (s: number) => void
  children: React.ReactNode
  icon: typeof Building06Icon
  readOnly: boolean
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <SolarDuotoneIcon icon={icon} size={16} strokeWidth={1.5} className="text-primary" />
            <CardTitle className="text-sm font-semibold">{title}</CardTitle>
          </div>
          {!readOnly && (
            <Button
              type="button" variant="ghost" size="sm"
              className="h-7 gap-1.5 text-xs text-muted-foreground hover:text-foreground"
              onClick={() => onEdit(step)}
            >
              <SolarDuotoneIcon icon={Edit01Icon} size={13} strokeWidth={1.5} primaryColor="currentColor" secondaryColor="currentColor" />
              Edit
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-1.5 text-sm">{children}</CardContent>
    </Card>
  )
}

function Row({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  )
}

export function Step7Review({ draft, readOnly, submitting, onEdit, onSubmit, onBack }: Props) {
  const uploadedTypes = new Set((draft.documents ?? []).map((d) => d.document_type))
  const missingDocs = REQUIRED_ORG_ONBOARDING_DOCUMENTS.filter((t) => !uploadedTypes.has(t))
  const hasSignature = uploadedTypes.has("authorized_signatory_signature")
  const locationCount = (draft.locations ?? []).length

  const missingRequired =
    !draft.accepted_terms || !draft.full_name || !draft.work_email || !draft.mobile ||
    !draft.legal_entity_type || !draft.date_of_incorporation || !draft.employee_count_range ||
    !draft.location_setup || locationCount === 0 ||
    !draft.pan_number || !draft.bank_name || !draft.bank_account_number || !draft.bank_ifsc ||
    !draft.signatory_name || !draft.signatory_email || !draft.signatory_mobile ||
    missingDocs.length > 0 || !hasSignature

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold">Review & Submit</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Confirm all details before submitting for platform review.
        </p>
      </div>

      <SectionCard title="Welcome & Account" step={0} onEdit={onEdit} icon={UserCircleIcon} readOnly={readOnly}>
        <Row label="Full Name" value={draft.full_name} />
        <Row label="Designation" value={draft.designation} />
        <Row label="Work Email" value={draft.work_email} />
        <Row label="Mobile" value={draft.mobile} />
        <Row label="Solo User" value={draft.is_solo_user ? "Yes" : "No"} />
      </SectionCard>

      <SectionCard title="Establishment" step={1} onEdit={onEdit} icon={Building06Icon} readOnly={readOnly}>
        <Row label="Company" value={draft.company_name} />
        <Row label="Legal Entity Type" value={draft.legal_entity_type ? LEGAL_ENTITY_TYPE_LABELS[draft.legal_entity_type] : null} />
        <Row label="Date of Incorporation" value={draft.date_of_incorporation} />
        <Row label="Employee Count" value={draft.employee_count_range} />
        <Row label="Group Company" value={draft.is_group_company ? "Yes" : "No"} />
      </SectionCard>

      <SectionCard title="Locations" step={3} onEdit={onEdit} icon={Tag01Icon} readOnly={readOnly}>
        <Row
          label="Setup"
          value={draft.location_setup === "multiple" ? "Multiple Locations" : draft.location_setup === "single" ? "Single Location" : null}
        />
        <Row label="Locations Added" value={String(locationCount)} />
        {locationCount === 0 && <p className="mt-1 text-xs text-destructive">At least one location is required — please edit.</p>}
      </SectionCard>

      <SectionCard title="Documents & Banking" step={4} onEdit={onEdit} icon={File01Icon} readOnly={readOnly}>
        <Row label="PAN Number" value={draft.pan_number} />
        <Row label="Bank" value={draft.bank_name} />
        <Row label="Account No." value={draft.bank_account_number} />
        <Row label="IFSC" value={draft.bank_ifsc} />
        {missingDocs.length > 0 && (
          <div className="mt-1 space-y-0.5">
            {missingDocs.map((t) => (
              <p key={t} className="text-xs text-destructive">{ORG_ONBOARDING_DOCUMENT_LABELS[t]} is required — please edit and upload.</p>
            ))}
          </div>
        )}
      </SectionCard>

      <SectionCard title="Authorized Signatory" step={5} onEdit={onEdit} icon={BankIcon} readOnly={readOnly}>
        <Row label="Name" value={draft.signatory_name} />
        <Row label="Designation" value={draft.signatory_designation} />
        <Row label="Email" value={draft.signatory_email} />
        <Row label="Mobile" value={draft.signatory_mobile} />
        <Row label="Same for all locations" value={draft.signatory_same_for_all_locations ? "Yes" : "No"} />
        {!hasSignature && <p className="mt-1 text-xs text-destructive">Signature is required — please edit and upload.</p>}
      </SectionCard>

      {missingRequired && !readOnly && (
        <div className="flex items-start gap-2.5 rounded-xl border border-destructive/30 bg-destructive/5 p-3">
          <SolarDuotoneIcon icon={AlertCircleIcon} size={16} strokeWidth={1.5} className="mt-0.5 shrink-0 text-destructive" />
          <p className="text-xs text-destructive">Some required fields are missing. Please edit the highlighted sections before submitting.</p>
        </div>
      )}

      <div className="flex gap-2">
        <Button type="button" variant="outline" className="flex-1" onClick={onBack} disabled={submitting}>Back</Button>
        <Button type="button" className="flex-[2]" size="lg" onClick={onSubmit} disabled={submitting || missingRequired || readOnly}>
          {submitting ? "Submitting…" : readOnly ? "Already Submitted" : "Submit for Review"}
        </Button>
      </div>

      <p className="text-center text-xs text-muted-foreground">
        By submitting, this organisation's onboarding will be sent to the platform team for review.
      </p>
    </div>
  )
}
