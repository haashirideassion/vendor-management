import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { Progress } from "@/components/ui/progress"
import { Step1CompanyInfo } from "./Step1CompanyInfo"
import { Step2TaxBanking } from "./Step2TaxBanking"
import { Step3Categories } from "./Step3Categories"
import { Step4Documents } from "./Step4Documents"
import { Step5Review } from "./Step5Review"
import { supabase } from "@/lib/supabase"
import { useAuth } from "@/contexts/AuthContext"
import { toast } from "sonner"

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
  category_ids: string[]
  // Step 4 — handled separately via document upload after vendor created
  vendor_id?: string
}

const STEPS = ["Company Info", "Tax & Banking", "Services", "Documents", "Review"]

export function OnboardingWizard() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [step, setStep] = useState(0)
  const [data, setData] = useState<Partial<OnboardingData>>({})
  const [submitting, setSubmitting] = useState(false)

  function next(partial: Partial<OnboardingData>) {
    setData((prev) => ({ ...prev, ...partial }))
    setStep((s) => s + 1)
  }

  function back() {
    setStep((s) => s - 1)
  }

  async function submit(partial: Partial<OnboardingData>) {
    const final = { ...data, ...partial } as OnboardingData
    setSubmitting(true)
    try {
      // Create the vendor record
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

      // Assign categories
      if (final.category_ids?.length) {
        const { error: catError } = await supabase
          .from("vendor_categories")
          .insert(final.category_ids.map((cid) => ({ vendor_id: vendor.id, category_id: cid })))
        if (catError) throw catError
      }

      setData((prev) => ({ ...prev, vendor_id: vendor.id }))
      setStep(3) // go to documents step
      toast.success("Details saved! Please upload your documents.")
    } catch (e: unknown) {
      toast.error((e as Error).message ?? "Submission failed")
    } finally {
      setSubmitting(false)
    }
  }

  function onDocumentsDone() {
    setStep(4)
  }

  function finalize() {
    navigate("/vendor/dashboard")
  }

  return (
    <div className="flex min-h-screen flex-col items-center bg-muted/40 px-4 py-10">
      <div className="w-full max-w-xl">
        {/* Header */}
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold">Vendor Onboarding</h1>
          <p className="text-sm text-muted-foreground mt-1">Step {step + 1} of {STEPS.length}</p>
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
        {step === 2 && <Step3Categories defaultValues={data} onNext={submit} onBack={back} submitting={submitting} />}
        {step === 3 && data.vendor_id && (
          <Step4Documents vendorId={data.vendor_id} onNext={onDocumentsDone} />
        )}
        {step === 4 && <Step5Review data={data as OnboardingData} onFinish={finalize} />}
      </div>
    </div>
  )
}
