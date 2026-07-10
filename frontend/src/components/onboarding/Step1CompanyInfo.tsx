import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { RequiredLabel } from "@/components/ui/RequiredLabel"
import type { OnboardingData } from "./OnboardingWizard"

const schema = z.object({
  company_name: z.string().min(2, "Required"),
  contact_name: z.string().min(2, "Required"),
  contact_email: z.email("Enter a valid email"),
  contact_phone: z
    .string()
    .min(1, "Phone number is required")
    .regex(/^\d{10}$/, "Enter a valid 10-digit phone number (numbers only)"),
})
type FormData = z.infer<typeof schema>

// Strips a "+91" prefix that may have been persisted with an earlier draft.
function toNationalNumber(value?: string) {
  return (value ?? "").replace(/^\+?91/, "").replace(/\D/g, "").slice(0, 10)
}

interface Props {
  defaultValues: Partial<OnboardingData>
  onNext: (data: Partial<OnboardingData>) => void
}

export function Step1CompanyInfo({ defaultValues, onNext }: Props) {
  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      ...defaultValues,
      contact_phone: toNationalNumber(defaultValues.contact_phone),
    },
  })

  function submit(data: FormData) {
    onNext({ ...data, contact_phone: `+91${data.contact_phone}` })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Company Information</CardTitle>
        <CardDescription>Tell us about your company and the primary contact person.</CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit(submit)}>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label><RequiredLabel>Company name</RequiredLabel></Label>
            <Input placeholder="Acme Corp Ltd." {...register("company_name")} />
            {errors.company_name && <p className="text-xs text-destructive">{errors.company_name.message}</p>}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label><RequiredLabel>Contact name</RequiredLabel></Label>
            <Input placeholder="Jane Smith" {...register("contact_name")} />
            {errors.contact_name && <p className="text-xs text-destructive">{errors.contact_name.message}</p>}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label><RequiredLabel>Contact email</RequiredLabel></Label>
            <Input type="email" placeholder="jane@acme.com" {...register("contact_email")} />
            {errors.contact_email && <p className="text-xs text-destructive">{errors.contact_email.message}</p>}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label><RequiredLabel>Contact phone</RequiredLabel></Label>
            <div className="relative">
              <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-base text-muted-foreground">
                +91
              </span>
              <Input
                type="tel"
                inputMode="numeric"
                maxLength={10}
                placeholder="9876543210"
                className="pl-12"
                aria-invalid={!!errors.contact_phone}
                {...register("contact_phone", {
                  onChange: (e) => {
                    e.target.value = e.target.value.replace(/\D/g, "").slice(0, 10)
                  },
                })}
              />
            </div>
            {errors.contact_phone && <p className="text-xs text-destructive">{errors.contact_phone.message}</p>}
          </div>
          <Button type="submit" className="w-full mt-2">Continue</Button>
        </CardContent>
      </form>
    </Card>
  )
}
