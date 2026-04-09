import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import type { OnboardingData } from "./OnboardingWizard"

const schema = z.object({
  tax_gst_number: z.string().optional(),
  bank_name: z.string().optional(),
  bank_account_number: z.string().optional(),
  bank_routing_number: z.string().optional(),
})
type FormData = z.infer<typeof schema>

interface Props {
  defaultValues: Partial<OnboardingData>
  onNext: (data: Partial<OnboardingData>) => void
  onBack: () => void
}

export function Step2TaxBanking({ defaultValues, onNext, onBack }: Props) {
  const { register, handleSubmit } = useForm<FormData>({
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
            <Label>Tax / GST number</Label>
            <Input placeholder="GST123456789" {...register("tax_gst_number")} />
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
            <Input placeholder="NBNK0001234" {...register("bank_routing_number")} />
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
