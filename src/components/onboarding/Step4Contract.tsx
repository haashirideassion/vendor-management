import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"
import type { OnboardingData } from "./OnboardingWizard"

const contractSchema = z.object({
  contract_title: z.string().min(2, "Title is required"),
  contract_type: z.string().min(1, "Type is required"),
  contract_start_date: z.string().min(1, "Start date is required"),
  contract_end_date: z.string().min(1, "End date is required"),
  contract_value: z.string().min(1, "Value is required"),
  contract_currency: z.string().min(1, "Currency is required"),
  auto_renew: z.boolean().default(false),
}).refine(
  (d) => !d.contract_start_date || !d.contract_end_date || d.contract_end_date > d.contract_start_date,
  { message: "End date must be after start date", path: ["contract_end_date"] }
)

type FormValues = z.infer<typeof contractSchema>

interface Props {
  defaultValues: Partial<OnboardingData>
  onNext: (data: Partial<OnboardingData>) => void
  onBack: () => void
  submitting?: boolean
}

export function Step4Contract({ defaultValues, onNext, onBack, submitting }: Props) {
  const form = useForm<FormValues>({
    resolver: zodResolver(contractSchema),
    defaultValues: {
      contract_title: defaultValues.contract_title || "",
      contract_type: defaultValues.contract_type || "",
      contract_start_date: defaultValues.contract_start_date || "",
      contract_end_date: defaultValues.contract_end_date || "",
      contract_value: defaultValues.contract_value || "",
      contract_currency: defaultValues.contract_currency || "USD",
      auto_renew: defaultValues.auto_renew || false,
    },
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle>Contract Details</CardTitle>
        <CardDescription>Enter the preliminary contract details for this vendor agreement.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={form.handleSubmit(onNext)} className="space-y-4">
          <div className="space-y-1.5">
            <Label>Contract Title <span className="text-destructive">*</span></Label>
            <Input {...form.register("contract_title")} placeholder="e.g. Annual IT Support MSA" />
            {form.formState.errors.contract_title && (
              <p className="text-xs text-red-500">{form.formState.errors.contract_title.message}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>Contract Type <span className="text-destructive">*</span></Label>
            <Select 
              value={form.watch("contract_type")} 
              onValueChange={(v) => form.setValue("contract_type", v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select type..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="MSA">MSA</SelectItem>
                <SelectItem value="SOW">SOW</SelectItem>
                <SelectItem value="NDA">NDA</SelectItem>
                <SelectItem value="Annual Service">Annual Service</SelectItem>
                <SelectItem value="PO-based">PO-based</SelectItem>
                <SelectItem value="Subscription">Subscription</SelectItem>
              </SelectContent>
            </Select>
            {form.formState.errors.contract_type && (
              <p className="text-xs text-red-500">{form.formState.errors.contract_type.message}</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Start Date <span className="text-destructive">*</span></Label>
              <Input type="date" {...form.register("contract_start_date")} />
              {form.formState.errors.contract_start_date && (
                <p className="text-xs text-red-500">{form.formState.errors.contract_start_date.message}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>End Date <span className="text-destructive">*</span></Label>
              <Input type="date" {...form.register("contract_end_date")} />
              {form.formState.errors.contract_end_date && (
                <p className="text-xs text-red-500">{form.formState.errors.contract_end_date.message}</p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Contract Value <span className="text-destructive">*</span></Label>
              <Input type="number" {...form.register("contract_value")} placeholder="e.g. 50000" />
              {form.formState.errors.contract_value && (
                <p className="text-xs text-red-500">{form.formState.errors.contract_value.message}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Currency <span className="text-destructive">*</span></Label>
              <Select 
                value={form.watch("contract_currency")} 
                onValueChange={(v) => form.setValue("contract_currency", v)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="USD">USD</SelectItem>
                  <SelectItem value="EUR">EUR</SelectItem>
                  <SelectItem value="GBP">GBP</SelectItem>
                  <SelectItem value="INR">INR</SelectItem>
                </SelectContent>
              </Select>
              {form.formState.errors.contract_currency && (
                <p className="text-xs text-red-500">{form.formState.errors.contract_currency.message}</p>
              )}
            </div>
          </div>

          <div className="flex items-center justify-between rounded-lg border p-3">
            <div className="space-y-0.5">
              <Label>Auto-renew Contract</Label>
              <p className="text-xs text-muted-foreground">Automatically extend on the end date</p>
            </div>
            <Switch 
              checked={form.watch("auto_renew")} 
              onCheckedChange={(v) => form.setValue("auto_renew", v)} 
            />
          </div>

          <div className="flex gap-3 pt-4">
            <Button type="button" variant="outline" className="flex-1" onClick={onBack} disabled={submitting}>
              Back
            </Button>
            <Button type="submit" className="flex-1" disabled={submitting}>
              {submitting ? "Saving…" : "Continue"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
