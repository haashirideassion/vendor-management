import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { useCategories } from "@/hooks/useCategories"
import type { OnboardingData } from "./OnboardingWizard"

interface Props {
  defaultValues: Partial<OnboardingData>
  onNext: (data: Partial<OnboardingData>) => void
  onBack: () => void
}

export function Step3Categories({ defaultValues, onNext, onBack }: Props) {
  const [selected, setSelected] = useState<string[]>(defaultValues.category_ids ?? [])
  const { data: categories, isLoading } = useCategories(true)
  const [error, setError] = useState("")

  function toggle(id: string) {
    setSelected((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id])
    setError("")
  }

  function handleSubmit() {
    if (!selected.length) {
      setError("Please select at least one service category.")
      return
    }
    onNext({ category_ids: selected })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Service Categories <span className="text-destructive">*</span></CardTitle>
        <CardDescription>Select the categories of services your company provides.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading categories…</p>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {categories?.map((cat) => (
              <label
                key={cat.id}
                className="flex items-start gap-2.5 rounded-lg border p-3 cursor-pointer hover:bg-accent transition-colors"
              >
                <Checkbox
                  checked={selected.includes(cat.id)}
                  onCheckedChange={() => toggle(cat.id)}
                  id={`cat-${cat.id}`}
                />
                <div>
                  <Label htmlFor={`cat-${cat.id}`} className="cursor-pointer font-medium">{cat.name}</Label>
                  {cat.description && (
                    <p className="text-xs text-muted-foreground mt-0.5">{cat.description}</p>
                  )}
                </div>
              </label>
            ))}
          </div>
        )}
        {error && <p className="text-xs text-destructive">{error}</p>}
        <div className="flex gap-2 mt-2">
          <Button type="button" variant="outline" className="flex-1" onClick={onBack}>Back</Button>
          <Button type="button" className="flex-1" onClick={handleSubmit}>
            Continue
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
