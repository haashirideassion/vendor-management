import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { RequiredLabel } from "@/components/ui/RequiredLabel"
import type { OnboardingData } from "./OnboardingWizard"

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

  return (
    <Card>
      <CardHeader>
        <CardTitle>Tax & Banking Details</CardTitle>
        <CardDescription>This information is used for invoicing and payment processing.</CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit(onNext)}>
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
          <div className="flex gap-2 mt-2">
            <Button type="button" variant="outline" className="flex-1" onClick={onBack}>Back</Button>
            <Button type="submit" className="flex-1">Continue</Button>
          </div>
        </CardContent>
      </form>
    </Card>
  )
}
