import { useState, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import { Progress } from "@/components/ui/progress"
import { Step1CompanyInfo } from "./Step1CompanyInfo"
import { Step2TaxBanking } from "./Step2TaxBanking"
import { Step3Categories } from "./Step3Categories"
import { Step5Documents } from "./Step5Documents"
import { Step6Review } from "./Step6Review"
import { supabase } from "@/lib/supabase"
import { useAuth } from "@/contexts/AuthContext"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { AppLogo } from "@/components/shared/AppLogo"
import { Cancel01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import type { DocumentType } from "@/lib/types"

export interface LocalDocument {
  type: DocumentType
  file: File
  fileName: string
}

export interface OnboardingData {
  // Step 1
  company_name: string
  contact_name: string
  contact_email: string
  contact_phone: string
  // Step 2
  tax_gst_number: string
  bank_name: string
  bank_account_number: string
  bank_routing_number: string
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

export function OnboardingWizard() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [step, setStep] = useState(() => {
    try { return Number(sessionStorage.getItem(`${STORAGE_KEY}_step`) ?? 0) } catch { return 0 }
  })
  const [data, setData] = useState<Partial<OnboardingData>>(() => {
    try {
      const saved = sessionStorage.getItem(STORAGE_KEY)
      return saved ? (JSON.parse(saved) as Partial<OnboardingData>) : {}
    } catch { return {} }
  })
  const [localDocs, setLocalDocs] = useState<LocalDocument[]>([])
  const [submitting, setSubmitting] = useState(false)

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
      // 1. Create vendor record
      const { data: vendor, error: vendorError } = await supabase
        .from("vendors")
        .insert({
          profile_id: user!.id,
          company_name: final.company_name,
          contact_name: final.contact_name,
          contact_email: final.contact_email,
          contact_phone: final.contact_phone || null,
          tax_gst_number: final.tax_gst_number || null,
          bank_name: final.bank_name || null,
          bank_account_number: final.bank_account_number || null,
          bank_routing_number: final.bank_routing_number || null,
          status: "pending_review",
        })
        .select()
        .single()

      if (vendorError) throw vendorError

      // 2. Assign categories
      if (final.category_ids?.length) {
        const { error: catError } = await supabase
          .from("vendor_categories")
          .insert(final.category_ids.map((cid) => ({ vendor_id: vendor.id, category_id: cid })))
        if (catError) throw catError
      }

      // 3. Upload documents — rollback vendor on failure
      try {
        for (const doc of localDocs) {
          const ext = doc.fileName.split(".").pop() ?? "bin"
          const storagePath = `vendor-documents/${vendor.id}/${doc.type}_${Date.now()}.${ext}`

          const { error: uploadError } = await supabase.storage
            .from("vendor-documents")
            .upload(storagePath, doc.file)
          if (uploadError) throw uploadError

          const { error: docInsertError } = await supabase
            .from("vendor_documents")
            .insert({
              vendor_id: vendor.id,
              document_type: doc.type,
              file_name: doc.fileName,
              storage_path: storagePath,
            })
          if (docInsertError) throw docInsertError
        }
      } catch (docError: unknown) {
        // Roll back: delete vendor record (cascades to vendor_categories)
        await supabase.from("vendors").delete().eq("id", vendor.id)
        throw docError
      }

      try { sessionStorage.removeItem(STORAGE_KEY); sessionStorage.removeItem(`${STORAGE_KEY}_step`) } catch { /* ignore */ }
      toast.success("Application submitted successfully!")
      navigate("/vendor/dashboard")
    } catch (e: unknown) {
      toast.error((e as Error).message ?? "Submission failed. Please try again.")
    } finally {
      setSubmitting(false)
    }
  }

  function handleClose() {
    try { sessionStorage.removeItem(STORAGE_KEY); sessionStorage.removeItem(`${STORAGE_KEY}_step`) } catch { /* ignore */ }
    setData({})
    setLocalDocs([])
    setStep(0)
    navigate("/vendor/dashboard")
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
            <HugeiconsIcon icon={Cancel01Icon} size={20} />
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
        {step === 0 && <Step1CompanyInfo defaultValues={data} onNext={next} />}
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
