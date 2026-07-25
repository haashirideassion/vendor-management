import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import type { OrgOnboardingDraft, LocationSetup } from "@/lib/types"

interface Props {
  draft: OrgOnboardingDraft
  readOnly: boolean
  saving: boolean
  onNext: (fields: Record<string, unknown>) => void
  onBack: () => void
}

const OPTIONS: { value: LocationSetup; label: string; description: string }[] = [
  { value: "single", label: "Single Location", description: "This organisation operates from one location only." },
  { value: "multiple", label: "Multiple Locations", description: "This organisation operates from more than one location." },
]

export function Step3LocationChoice({ draft, readOnly, saving, onNext, onBack }: Props) {
  const [choice, setChoice] = useState<LocationSetup | "">(draft.location_setup ?? "")

  function handleContinue() {
    if (!choice) return
    onNext({ location_setup: choice })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Location Setup</CardTitle>
        <CardDescription>How many locations does this organisation operate from?</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid gap-3 sm:grid-cols-2">
          {OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              disabled={readOnly}
              onClick={() => setChoice(opt.value)}
              className={cn(
                "rounded-xl border p-4 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60",
                choice === opt.value ? "border-primary bg-primary/5" : "bg-background hover:bg-accent"
              )}
            >
              <p className="text-sm font-medium">{opt.label}</p>
              <p className="mt-1 text-xs text-muted-foreground">{opt.description}</p>
            </button>
          ))}
        </div>
        <div className="mt-2 flex gap-2">
          <Button type="button" variant="outline" className="flex-1" onClick={onBack}>Back</Button>
          <Button type="button" className="flex-1" onClick={handleContinue} disabled={!choice || saving || readOnly}>
            {saving ? "Saving…" : "Continue"}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
