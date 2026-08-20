import { useState, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import { Progress } from "@/components/ui/progress"
import { Step1CompanyInfo } from "./Step1CompanyInfo"
import { Step2TaxBanking } from "./Step2TaxBanking"
import { Step3Categories } from "./Step3Categories"
import { Step5Documents } from "./Step5Documents"
import { Step6Review } from "./Step6Review"
import { api } from "@/lib/api"
import { useAuth } from "@/contexts/AuthContext"
import { useResolveVendorInviteLink, VENDOR_INVITE_TOKEN_KEY } from "@/hooks/useVendorInviteLinks"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { AppLogo } from "@/components/shared/AppLogo"
import { Cancel01Icon } from "@/components/shared/SolarIcon"
import { SolarDuotoneIcon } from "@/components/shared/SolarIcon"
import type { DocumentType } from "@/lib/types"

export interface LocalDocument {
  type: DocumentType
  file: File
  fileName: string
}

// One additional (non-default) Legal Entity, collected client-side during
// onboarding the same way everything else in `data` is -- the vendor
// doesn't exist yet until final submit, so these can't be created via
// /api/legal-entities/create until AFTER /api/vendors/create returns.
// Deliberately one tax registration + one bank account per entity here --
// a vendor with genuinely complex needs (multiple GSTINs per entity, etc.)
// adds those later via the post-onboarding Legal Entity management screens
// (the same /api/legal-entities/* routes), keeping the wizard itself lean.
export interface AdditionalLegalEntityDraft {
  registered_country: string
  legal_name?: string
  registration_number?: string
  entity_type: "individual" | "company"
  tax_registration_type?: string
  tax_country?: string
  tax_state?: string
  tax_value?: string
  bank_country?: string
  bank_currency?: string
  bank_name?: string
  bank_account_number?: string
  bank_ifsc?: string
  bank_swift_bic?: string
  bank_iban?: string
  bank_beneficiary_name?: string
}

export interface OnboardingData {
  // Step 1
  company_name: string
  contact_name: string
  contact_email: string
  contact_phone: string
  is_solo_user: boolean
  org_code?: string
  group_code?: string
  // Step 2
  tax_gst_number: string
  pan_number: string
  bank_name: string
  bank_account_number: string
  bank_routing_number: string
  // Confirmed design: never shows "Legal Entity" for a single-entity
  // vendor -- this toggle (default off) is the only thing that reveals the
  // repeatable multi-entity list, which stays empty/hidden otherwise.
  has_multiple_legal_entities?: boolean
  additional_legal_entities?: AdditionalLegalEntityDraft[]
  // Step 3
  contract_title?: string
  contract_type?: string
  contract_start_date?: string
  contract_end_date?: string
  contract_value?: string
  contract_currency?: string
  auto_renew?: boolean
  // Step 4
  category_ids: string[]
  category_names?: string[]
  // vendor_id only available after final submit
  vendor_id?: string
}

const STEPS = ["Company Info", "Tax & Banking", "Services", "Documents", "Review"]
const STORAGE_KEY = "vms_onboarding_draft"

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.readAsDataURL(file)
    reader.onload = () => resolve((reader.result as string).split(",")[1])
    reader.onerror = reject
  })
}

export function OnboardingWizard() {
  const { user, accessToken } = useAuth()
  const navigate = useNavigate()
  const [step, setStep] = useState(() => {
    try { return Number(sessionStorage.getItem(`${STORAGE_KEY}_step`) ?? 0) } catch { return 0 }
  })
  const [data, setData] = useState<Partial<OnboardingData>>(() => {
    try {
      const saved = sessionStorage.getItem(STORAGE_KEY)
      const draft = saved ? (JSON.parse(saved) as Partial<OnboardingData>) : {}
      // Pre-fill contact fields from registered user if not already saved in draft
      return {
        contact_name: user?.fullName ?? "",
        contact_email: user?.email ?? "",
        ...draft,
      }
    } catch { return {} }
  })
  const [localDocs, setLocalDocs] = useState<LocalDocument[]>([])
  const [submitting, setSubmitting] = useState(false)

  // Kept in sessionStorage (not just component state) across the whole
  // wizard so a mid-wizard page refresh doesn't un-lock a field that was
  // populated from an invite link -- cleared only alongside the wizard's
  // own draft, in finalSubmit and handleClose below.
  const [inviteToken] = useState(() => {
    try { return sessionStorage.getItem(VENDOR_INVITE_TOKEN_KEY) } catch { return null }
  })
  const { data: inviteResolved, isSuccess: inviteResolvedOk, isError: inviteResolveFailed } = useResolveVendorInviteLink(inviteToken)
  const inviteLocked = !!inviteToken && inviteResolvedOk && !!inviteResolved

  useEffect(() => {
    if (!inviteResolvedOk || !inviteResolved) return
    setData((prev) => ({
      ...prev,
      org_code: inviteResolved.scope === "org" ? inviteResolved.code : prev.org_code,
      group_code: inviteResolved.scope === "group" ? inviteResolved.code : prev.group_code,
    }))
  }, [inviteResolvedOk, inviteResolved])

  useEffect(() => {
    // An expired/invalid token shouldn't block signup -- just drop it and
    // let the vendor fill the code in themselves, same as walking up cold.
    if (inviteResolveFailed) {
      try { sessionStorage.removeItem(VENDOR_INVITE_TOKEN_KEY) } catch { /* ignore */ }
    }
  }, [inviteResolveFailed])

  useEffect(() => {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(data))
      sessionStorage.setItem(`${STORAGE_KEY}_step`, String(step))
    } catch { /* storage unavailable */ }
  }, [data, step])

  function next(partial: Partial<OnboardingData>) {
    setData((prev) => ({ ...prev, ...partial }))
    setStep((s) => s + 1)
  }

  function back() {
    setStep((s) => s - 1)
  }

  function goToStep(s: number) {
    setStep(s)
  }

  async function finalSubmit() {
    const final = data as OnboardingData
    setSubmitting(true)
    try {
      // 1. Create vendor record + categories via backend
      const { data: vendor } = await api.post<{ data: { id: string } }>(
        "/api/vendors/create",
        {
          company_name: final.company_name,
          contact_name: final.contact_name,
          contact_email: final.contact_email,
          contact_phone: final.contact_phone || null,
          tax_gst_number: final.tax_gst_number || null,
          pan_number: final.pan_number || null,
          bank_name: final.bank_name || null,
          bank_account_number: final.bank_account_number || null,
          bank_routing_number: final.bank_routing_number || null,
          category_ids: final.category_ids ?? [],
          is_solo_user: final.is_solo_user ?? false,
          org_code: final.org_code || null,
          group_code: final.group_code || null,
        },
        accessToken
      )

      // 1b. Additional Legal Entities (the MNC "operates through more than
      // one legal entity" case) -- only reachable now that the vendor (and
      // its vendor_users row, created atomically by create_vendor_with_
      // categories) exists, since /api/legal-entities/create resolves the
      // vendor from the caller's own auth token, not a body param. Created
      // sequentially, not rolled back on partial failure the way the
      // vendor-creation step is below -- a failed additional entity here
      // is a recoverable follow-up action via the vendor's own Legal
      // Entity management screen, not grounds to cancel the whole
      // onboarding that already succeeded.
      if (final.has_multiple_legal_entities && final.additional_legal_entities?.length) {
        for (const entity of final.additional_legal_entities) {
          if (!entity.registered_country?.trim()) continue
          try {
            await api.post(
              "/api/legal-entities/create",
              {
                registeredCountry: entity.registered_country,
                legalName: entity.legal_name || null,
                registrationNumber: entity.registration_number || null,
                entityType: entity.entity_type,
                operatingCountries: [entity.registered_country],
                taxRegistrations: entity.tax_registration_type && entity.tax_value
                  ? [{
                      registrationType: entity.tax_registration_type,
                      country: entity.tax_country || entity.registered_country,
                      state: entity.tax_state || undefined,
                      registrationValue: entity.tax_value,
                    }]
                  : [],
                bankAccounts: entity.bank_account_number
                  ? [{
                      country: entity.bank_country || entity.registered_country,
                      currency: entity.bank_currency || undefined,
                      bankName: entity.bank_name || undefined,
                      accountNumber: entity.bank_account_number,
                      ifsc: entity.bank_ifsc || undefined,
                      swiftBic: entity.bank_swift_bic || undefined,
                      iban: entity.bank_iban || undefined,
                      beneficiaryName: entity.bank_beneficiary_name || undefined,
                      isPrimary: true,
                    }]
                  : [],
              },
              accessToken
            )
          } catch {
            toast.error(`Saved, but "${entity.legal_name || entity.registered_country}" needs to be re-added from your vendor profile.`)
          }
        }
      }

      // 2. Upload documents via backend using service role key — avoids JWT mismatch with Supabase storage
      try {
        for (const doc of localDocs) {
          const base64 = await fileToBase64(doc.file)
          await api.post(
            "/api/vendors/upload-document",
            { vendor_id: vendor.id, document_type: doc.type, file_name: doc.fileName, file_data: base64 },
            accessToken
          )
        }
      } catch (docError: unknown) {
        // Roll back: delete vendor record via backend (cascades to vendor_categories)
        await api.post("/api/vendors/cancel-onboarding", { vendor_id: vendor.id }, accessToken).catch(() => {})
        throw docError
      }

      try {
        sessionStorage.removeItem(STORAGE_KEY)
        sessionStorage.removeItem(`${STORAGE_KEY}_step`)
        sessionStorage.removeItem(VENDOR_INVITE_TOKEN_KEY)
      } catch { /* ignore */ }
      toast.success("Application submitted successfully!")
      navigate("/vendor/dashboard")
    } catch (e: unknown) {
      toast.error((e as Error).message ?? "Submission failed. Please try again.")
    } finally {
      setSubmitting(false)
    }
  }

  function handleClose() {
    try {
      sessionStorage.removeItem(STORAGE_KEY)
      sessionStorage.removeItem(`${STORAGE_KEY}_step`)
      sessionStorage.removeItem(VENDOR_INVITE_TOKEN_KEY)
    } catch { /* ignore */ }
    setData({})
    setLocalDocs([])
    setStep(0)
    navigate("/vendor/profile")
  }

  return (
    <div className="flex min-h-screen flex-col items-center bg-muted/40 px-4 py-10">
      <div className="w-full max-w-xl">
        {/* Header */}
        <div className="mb-6 flex items-start justify-between">
          <div className="text-left">
            <AppLogo className="h-10 w-auto max-w-[180px] mb-3" />
            <h1 className="text-2xl font-bold">Vendor Onboarding</h1>
            <p className="text-sm text-muted-foreground mt-1">Step {step + 1} of {STEPS.length}</p>
          </div>
          <Button variant="ghost" size="icon" className="text-muted-foreground" onClick={handleClose} title="Cancel Onboarding">
            <SolarDuotoneIcon icon={Cancel01Icon} size={20} />
          </Button>
        </div>

        {/* Progress */}
        <div className="mb-2 flex justify-between text-xs text-muted-foreground">
          {STEPS.map((s, i) => (
            <span key={s} className={i === step ? "font-semibold text-foreground" : ""}>{s}</span>
          ))}
        </div>
        <Progress value={((step) / (STEPS.length - 1)) * 100} className="mb-8" />

        {/* Steps */}
        {step === 0 && <Step1CompanyInfo defaultValues={data} onNext={next} inviteLocked={inviteLocked} />}
        {step === 1 && <Step2TaxBanking defaultValues={data} onNext={next} onBack={back} />}
        {step === 2 && <Step3Categories defaultValues={data} onNext={next} onBack={back} />}
        {step === 3 && (
          <Step5Documents
            localDocs={localDocs}
            onDocsChange={setLocalDocs}
            onNext={() => setStep(4)}
            onBack={back}
          />
        )}
        {step === 4 && (
          <Step6Review
            data={data}
            localDocs={localDocs}
            onEdit={goToStep}
            onSubmit={finalSubmit}
            submitting={submitting}
          />
        )}
      </div>
    </div>
  )
}
