import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { DOCUMENT_TYPE_LABELS, REQUIRED_DOCUMENTS } from "@/lib/constants"
import type { OnboardingData, LocalDocument } from "./OnboardingWizard"
import { SolarDuotoneIcon } from "@/components/shared/SolarIcon"
import {
  Edit01Icon,
  Building06Icon,
  BankIcon,
  Tag01Icon,
  File01Icon,
  AlertCircleIcon,
} from "@/components/shared/SolarIcon"

interface Props {
  data: Partial<OnboardingData>
  localDocs: LocalDocument[]
  onEdit: (step: number) => void
  onSubmit: () => void
  submitting: boolean
}

function SectionCard({
  title,
  step,
  onEdit,
  children,
  icon,
}: {
  title: string
  step: number
  onEdit: (s: number) => void
  children: React.ReactNode
  icon: typeof Building06Icon
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <SolarDuotoneIcon icon={icon} size={16} strokeWidth={1.5} className="text-primary" />
            <CardTitle className="text-sm font-semibold">{title}</CardTitle>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 text-xs gap-1.5 text-muted-foreground hover:text-foreground"
            onClick={() => onEdit(step)}
          >
            <SolarDuotoneIcon icon={Edit01Icon} size={13} strokeWidth={1.5} primaryColor="currentColor" secondaryColor="currentColor" />
            Edit
          </Button>
        </div>
      </CardHeader>
      <CardContent className="text-sm space-y-1.5">{children}</CardContent>
    </Card>
  )
}

function Row({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className="font-medium text-right">{value}</span>
    </div>
  )
}

export function Step6Review({ data, localDocs, onEdit, onSubmit, submitting }: Props) {
  const hasCompany = !!(data.company_name && data.contact_name && data.contact_email)
  const hasCategories = !!(data.category_ids?.length)
  const uploadedTypes = new Set(localDocs.map((d) => d.type))
  const hasRequiredDocs = REQUIRED_DOCUMENTS.every((t) => uploadedTypes.has(t))

  const missingRequired = !hasCompany || !hasCategories || !hasRequiredDocs

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold">Review Your Application</h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          Confirm all details before final submission. Nothing is saved to the database until you click Submit.
        </p>
      </div>

      {/* Company Details */}
      <SectionCard title="Company Details" step={0} onEdit={onEdit} icon={Building06Icon}>
        <Row label="Company" value={data.company_name} />
        <Row label="Contact" value={data.contact_name} />
        <Row label="Email" value={data.contact_email} />
        <Row label="Phone" value={data.contact_phone} />
        {!hasCompany && (
          <p className="text-xs text-destructive mt-1">Company details incomplete — please edit.</p>
        )}
      </SectionCard>

      {/* Tax & Banking */}
      <SectionCard title="Tax & Banking" step={1} onEdit={onEdit} icon={BankIcon}>
        {data.tax_gst_number || data.bank_name ? (
          <>
            <Row label="Tax / GST" value={data.tax_gst_number} />
            <Row label="PAN" value={data.pan_number} />
            <Row label="Bank" value={data.bank_name} />
            <Row label="Account No." value={data.bank_account_number} />
            <Row label="Routing No." value={data.bank_routing_number} />
          </>
        ) : (
          <p className="text-xs text-muted-foreground">No tax or banking details provided.</p>
        )}
      </SectionCard>

      {/* Service Categories */}
      <SectionCard title="Service Categories" step={2} onEdit={onEdit} icon={Tag01Icon}>
        {hasCategories ? (
          <div className="flex flex-wrap gap-1.5">
            {(data.category_names ?? data.category_ids ?? []).map((name) => (
              <span
                key={name}
                className="rounded-full bg-primary/10 text-primary px-2.5 py-0.5 text-xs font-medium border border-primary/20"
              >
                {name}
              </span>
            ))}
          </div>
        ) : (
          <p className="text-xs text-destructive">No categories selected — please edit.</p>
        )}
      </SectionCard>

      {/* Documents */}
      <SectionCard title="Documents" step={3} onEdit={onEdit} icon={File01Icon}>
        {localDocs.length > 0 && (
          <div className="space-y-1.5">
            {localDocs.map((doc) => (
              <div key={doc.type} className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">{DOCUMENT_TYPE_LABELS[doc.type]}</span>
                <span className="font-medium text-xs text-right truncate max-w-[180px]">{doc.fileName}</span>
              </div>
            ))}
          </div>
        )}
        {!hasRequiredDocs && (
          <div className="space-y-0.5 mt-1">
            {REQUIRED_DOCUMENTS.filter((t) => !uploadedTypes.has(t)).map((t) => (
              <p key={t} className="text-xs text-destructive">
                {DOCUMENT_TYPE_LABELS[t]} is required — please edit and upload.
              </p>
            ))}
          </div>
        )}
      </SectionCard>

      {/* Validation warning */}
      {missingRequired && (
        <div className="flex items-start gap-2.5 rounded-xl border border-destructive/30 bg-destructive/5 p-3">
          <SolarDuotoneIcon icon={AlertCircleIcon} size={16} strokeWidth={1.5} className="text-destructive shrink-0 mt-0.5" />
          <p className="text-xs text-destructive">
            Some required fields are missing. Please edit the highlighted sections before submitting.
          </p>
        </div>
      )}

      {/* Submit */}
      <Button
        type="button"
        className="w-full"
        size="lg"
        onClick={onSubmit}
        disabled={submitting || missingRequired}
      >
        {submitting ? (
          <span className="flex items-center gap-2">
            <span className="h-4 w-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
            Submitting…
          </span>
        ) : (
          "Submit Vendor Onboarding"
        )}
      </Button>

      <p className="text-xs text-muted-foreground text-center">
        By submitting, your application will be sent for review. You will be notified by email once a decision is made.
      </p>
    </div>
  )
}
