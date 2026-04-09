import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import type { OnboardingData } from "./OnboardingWizard"

const schema = z.object({
  company_name: z.string().min(2, "Required"),
  contact_name: z.string().min(2, "Required"),
  contact_email: z.string().email("Enter a valid email"),
  contact_phone: z.string().optional(),
})
type FormData = z.infer<typeof schema>

interface Props {
  defaultValues: Partial<OnboardingData>
  onNext: (data: Partial<OnboardingData>) => void
}

export function Step1CompanyInfo({ defaultValues, onNext }: Props) {
  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues,
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle>Company Information</CardTitle>
        <CardDescription>Tell us about your company and the primary contact person.</CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit(onNext)}>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label>Company name *</Label>
            <Input placeholder="Acme Corp Ltd." {...register("company_name")} />
            {errors.company_name && <p className="text-xs text-destructive">{errors.company_name.message}</p>}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Contact name *</Label>
            <Input placeholder="Jane Smith" {...register("contact_name")} />
            {errors.contact_name && <p className="text-xs text-destructive">{errors.contact_name.message}</p>}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Contact email *</Label>
            <Input type="email" placeholder="jane@acme.com" {...register("contact_email")} />
            {errors.contact_email && <p className="text-xs text-destructive">{errors.contact_email.message}</p>}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Contact phone</Label>
            <Input type="tel" placeholder="+1 555 123 4567" {...register("contact_phone")} />
          </div>
          <Button type="submit" className="w-full mt-2">Continue</Button>
        </CardContent>
      </form>
    </Card>
  )
}
