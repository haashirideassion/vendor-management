import { useEffect, useState } from "react"
import { AnimatedPage } from "@/components/shared/AnimatedPage"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { toast } from "sonner"
import {
  useOrgOnboardingDraft, useStartOrgOnboarding, useSaveOrgOnboardingStep, useSubmitOrgOnboarding,
} from "@/hooks/useOrgOnboarding"
import { Step1Welcome } from "./Step1Welcome"
import { Step2Establishment } from "./Step2Establishment"
import { Step3LocationChoice } from "./Step3LocationChoice"
import { Step4LocationDetails } from "./Step4LocationDetails"
import { Step5Documents } from "./Step5Documents"
import { Step6Signatory } from "./Step6Signatory"
import { Step7Review } from "./Step7Review"

const STEPS = ["Welcome", "Establishment", "Location Setup", "Location Details", "Documents", "Signatory", "Review"]

// Organisation onboarding wizard shell. Unlike vendor onboarding
// (OnboardingWizard.tsx), which holds everything in sessionStorage until a
// single final submit, this autosaves each step to the backend as soon as
// it's completed (POST /api/org-onboarding/save-step and friends) -- the
// draft is the single source of truth, so a refresh mid-wizard just resumes
// from wherever the server says current_step is.
export function OrgOnboardingWizard() {
  const { data: draft, isLoading, isError, error } = useOrgOnboardingDraft()
  const startOnboarding = useStartOrgOnboarding()
  const saveStep = useSaveOrgOnboardingStep()
  const submit = useSubmitOrgOnboarding()
  const [stepIndex, setStepIndex] = useState(0)

  useEffect(() => {
    if (draft) setStepIndex(Math.min(Math.max(draft.current_step - 1, 0), STEPS.length - 1))
    // Only re-sync when a different draft loads, not on every field autosave
    // (which would otherwise yank the user back to wherever current_step
    // last landed while they're actively navigating backward to edit).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft?.id])

  async function handleStart() {
    try {
      await startOnboarding.mutateAsync()
    } catch (e: unknown) {
      toast.error((e as Error).message ?? "Failed to start onboarding")
    }
  }

  async function saveAndNext(step: number, fields: Record<string, unknown>) {
    try {
      await saveStep.mutateAsync({ step, fields })
      setStepIndex((s) => Math.min(s + 1, STEPS.length - 1))
    } catch (e: unknown) {
      toast.error((e as Error).message ?? "Failed to save")
    }
  }

  function goBack() {
    setStepIndex((s) => Math.max(s - 1, 0))
  }

  async function handleSubmit() {
    try {
      await submit.mutateAsync()
      toast.success("Onboarding submitted for review")
    } catch (e: unknown) {
      toast.error((e as Error).message ?? "Failed to submit onboarding")
    }
  }

  if (isLoading) {
    return <div className="flex justify-center py-16 text-sm text-muted-foreground">Loading…</div>
  }

  if (isError) {
    return (
      <div className="mx-auto max-w-md py-16 text-center text-sm text-destructive">
        {(error as Error)?.message ?? "Failed to load onboarding"}
      </div>
    )
  }

  if (!draft) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-4 py-16 text-center">
        <h1 className="text-xl font-semibold">Organisation Onboarding</h1>
        <p className="text-sm text-muted-foreground">
          Complete your organisation's profile, locations, and compliance documents for platform review.
        </p>
        <Button onClick={handleStart} disabled={startOnboarding.isPending}>
          {startOnboarding.isPending ? "Starting…" : "Start Onboarding"}
        </Button>
      </div>
    )
  }

  const readOnly = draft.status === "submitted" || draft.status === "approved"

  return (
    <AnimatedPage className="mx-auto w-full max-w-3xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Organisation Onboarding</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Step {stepIndex + 1} of {STEPS.length}: {STEPS[stepIndex]}
        </p>
      </div>

      {draft.status === "rejected" && draft.rejection_reason && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          <p className="font-medium">Changes requested by the platform team</p>
          <p className="mt-0.5">{draft.rejection_reason}</p>
        </div>
      )}
      {readOnly && (
        <div className="rounded-xl border bg-muted/40 p-3 text-sm text-muted-foreground">
          This submission is {draft.status === "approved" ? "approved" : "awaiting platform review"} and is no longer editable.
        </div>
      )}

      <div className="flex justify-between text-xs text-muted-foreground">
        {STEPS.map((s, i) => (
          <span key={s} className={i === stepIndex ? "font-semibold text-foreground" : ""}>{s}</span>
        ))}
      </div>
      <Progress value={(stepIndex / (STEPS.length - 1)) * 100} />

      {stepIndex === 0 && (
        <Step1Welcome draft={draft} readOnly={readOnly} saving={saveStep.isPending} onNext={(fields) => saveAndNext(1, fields)} />
      )}
      {stepIndex === 1 && (
        <Step2Establishment draft={draft} readOnly={readOnly} saving={saveStep.isPending} onNext={(fields) => saveAndNext(2, fields)} onBack={goBack} />
      )}
      {stepIndex === 2 && (
        <Step3LocationChoice draft={draft} readOnly={readOnly} saving={saveStep.isPending} onNext={(fields) => saveAndNext(3, fields)} onBack={goBack} />
      )}
      {stepIndex === 3 && (
        <Step4LocationDetails draft={draft} readOnly={readOnly} onNext={() => saveAndNext(4, {})} onBack={goBack} />
      )}
      {stepIndex === 4 && (
        <Step5Documents draft={draft} readOnly={readOnly} onNext={(fields) => saveAndNext(5, fields)} onBack={goBack} />
      )}
      {stepIndex === 5 && (
        <Step6Signatory draft={draft} readOnly={readOnly} saving={saveStep.isPending} onNext={(fields) => saveAndNext(6, fields)} onBack={goBack} />
      )}
      {stepIndex === 6 && (
        <Step7Review draft={draft} readOnly={readOnly} submitting={submit.isPending} onEdit={setStepIndex} onSubmit={handleSubmit} onBack={goBack} />
      )}
    </AnimatedPage>
  )
}
