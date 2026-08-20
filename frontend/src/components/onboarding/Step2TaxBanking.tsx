import { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { RequiredLabel } from "@/components/ui/RequiredLabel"
import type { OnboardingData, AdditionalLegalEntityDraft } from "./OnboardingWizard"

const GST_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/
const PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/
const IFSC_REGEX = /^[A-Z]{4}0[A-Z0-9]{6}$/

const schema = z.object({
  tax_gst_number: z.string()
    .min(1, "Required")
    .regex(GST_REGEX, "Enter a valid 15-character GSTIN (e.g. 22AAAAA0000A1Z5)"),
  pan_number: z.string()
    .min(1, "Required")
    .regex(PAN_REGEX, "Enter a valid 10-character PAN (e.g. AAAAA0000A)"),
  bank_name: z.string().optional(),
  bank_account_number: z.string().optional(),
  bank_routing_number: z.string()
    .optional()
    .refine((v) => !v || v.length < 8 || IFSC_REGEX.test(v), { message: "Enter a valid IFSC code (e.g. SBIN0001234)" }),
})
type FormData = z.infer<typeof schema>

const EMPTY_ENTITY: AdditionalLegalEntityDraft = { registered_country: "", entity_type: "company" }

interface Props {
  defaultValues: Partial<OnboardingData>
  onNext: (data: Partial<OnboardingData>) => void
  onBack: () => void
}

export function Step2TaxBanking({ defaultValues, onNext, onBack }: Props) {
  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues,
  })

  // Confirmed design: never shown for a single-entity vendor -- off by
  // default, and turning it on only ADDS a repeatable list below this same
  // form; the fields above always remain the primary/default Legal Entity.
  const [hasMultiple, setHasMultiple] = useState(!!defaultValues.has_multiple_legal_entities)
  const [entities, setEntities] = useState<AdditionalLegalEntityDraft[]>(
    defaultValues.additional_legal_entities?.length ? defaultValues.additional_legal_entities : [{ ...EMPTY_ENTITY }]
  )

  function updateEntity(index: number, patch: Partial<AdditionalLegalEntityDraft>) {
    setEntities((prev) => prev.map((e, i) => (i === index ? { ...e, ...patch } : e)))
  }
  function addEntity() {
    setEntities((prev) => [...prev, { ...EMPTY_ENTITY }])
  }
  function removeEntity(index: number) {
    setEntities((prev) => prev.filter((_, i) => i !== index))
  }

  function submit(form: FormData) {
    onNext({
      ...form,
      has_multiple_legal_entities: hasMultiple,
      additional_legal_entities: hasMultiple ? entities.filter((e) => e.registered_country.trim()) : [],
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Tax & Banking Details</CardTitle>
        <CardDescription>This information is used for invoicing and payment processing.</CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit(submit)}>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label><RequiredLabel>Tax / GST number</RequiredLabel></Label>
            <Input placeholder="22AAAAA0000A1Z5" {...register("tax_gst_number")} />
            {errors.tax_gst_number && <p className="text-xs text-destructive">{errors.tax_gst_number.message}</p>}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label><RequiredLabel>PAN number</RequiredLabel></Label>
            <Input placeholder="AAAAA0000A" {...register("pan_number")} />
            {errors.pan_number && <p className="text-xs text-destructive">{errors.pan_number.message}</p>}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Bank name</Label>
            <Input placeholder="National Bank" {...register("bank_name")} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Account number</Label>
            <Input placeholder="0001234567890" {...register("bank_account_number")} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Routing / SWIFT / IFSC</Label>
            <Input placeholder="SBIN0001234" {...register("bank_routing_number")} />
            {errors.bank_routing_number && <p className="text-xs text-destructive">{errors.bank_routing_number.message}</p>}
          </div>

          <label className="flex items-start gap-2 text-sm border-t pt-4 mt-1">
            <Checkbox checked={hasMultiple} onCheckedChange={(v) => setHasMultiple(v === true)} className="mt-0.5" />
            <span>
              <span className="font-medium">This vendor operates through more than one legal entity</span>
              <span className="block text-xs text-muted-foreground">
                Add each additional country's registered entity below. The details above always cover your primary entity.
              </span>
            </span>
          </label>

          {hasMultiple && (
            <div className="flex flex-col gap-3">
              {entities.map((entity, i) => (
                <div key={i} className="rounded-lg border p-3 flex flex-col gap-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-muted-foreground">Additional Legal Entity {i + 1}</span>
                    {entities.length > 1 && (
                      <button type="button" onClick={() => removeEntity(i)} className="text-xs text-muted-foreground hover:text-destructive">
                        Remove
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="flex flex-col gap-1">
                      <Label className="text-xs"><RequiredLabel>Registered country</RequiredLabel></Label>
                      <Input value={entity.registered_country} onChange={(e) => updateEntity(i, { registered_country: e.target.value })} placeholder="e.g. UAE" />
                    </div>
                    <div className="flex flex-col gap-1">
                      <Label className="text-xs">Entity type</Label>
                      <select
                        className="h-9 rounded-md border bg-background px-2 text-sm"
                        value={entity.entity_type}
                        onChange={(e) => updateEntity(i, { entity_type: e.target.value as "individual" | "company" })}
                      >
                        <option value="company">Company</option>
                        <option value="individual">Individual</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="flex flex-col gap-1">
                      <Label className="text-xs">Legal name</Label>
                      <Input value={entity.legal_name ?? ""} onChange={(e) => updateEntity(i, { legal_name: e.target.value })} />
                    </div>
                    <div className="flex flex-col gap-1">
                      <Label className="text-xs">Registration number</Label>
                      <Input value={entity.registration_number ?? ""} onChange={(e) => updateEntity(i, { registration_number: e.target.value })} />
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <div className="flex flex-col gap-1">
                      <Label className="text-xs">Tax registration type</Label>
                      <Input value={entity.tax_registration_type ?? ""} onChange={(e) => updateEntity(i, { tax_registration_type: e.target.value.toUpperCase() })} placeholder="VAT / EIN / GSTIN" />
                    </div>
                    <div className="flex flex-col gap-1">
                      <Label className="text-xs">State (if applicable)</Label>
                      <Input value={entity.tax_state ?? ""} onChange={(e) => updateEntity(i, { tax_state: e.target.value })} />
                    </div>
                    <div className="flex flex-col gap-1">
                      <Label className="text-xs">Tax registration value</Label>
                      <Input value={entity.tax_value ?? ""} onChange={(e) => updateEntity(i, { tax_value: e.target.value })} />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="flex flex-col gap-1">
                      <Label className="text-xs">Bank name</Label>
                      <Input value={entity.bank_name ?? ""} onChange={(e) => updateEntity(i, { bank_name: e.target.value })} />
                    </div>
                    <div className="flex flex-col gap-1">
                      <Label className="text-xs">Account number</Label>
                      <Input value={entity.bank_account_number ?? ""} onChange={(e) => updateEntity(i, { bank_account_number: e.target.value })} />
                    </div>
                    <div className="flex flex-col gap-1">
                      <Label className="text-xs">IFSC (India)</Label>
                      <Input value={entity.bank_ifsc ?? ""} onChange={(e) => updateEntity(i, { bank_ifsc: e.target.value })} />
                    </div>
                    <div className="flex flex-col gap-1">
                      <Label className="text-xs">SWIFT/BIC</Label>
                      <Input value={entity.bank_swift_bic ?? ""} onChange={(e) => updateEntity(i, { bank_swift_bic: e.target.value })} />
                    </div>
                  </div>
                </div>
              ))}
              <Button type="button" variant="outline" size="sm" onClick={addEntity}>+ Add another Legal Entity</Button>
            </div>
          )}

          <div className="flex gap-2 mt-2">
            <Button type="button" variant="outline" className="flex-1" onClick={onBack}>Back</Button>
            <Button type="submit" className="flex-1">Continue</Button>
          </div>
        </CardContent>
      </form>
    </Card>
  )
}
