import { useEffect } from "react"
import { useForm, Controller } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { RequiredLabel } from "@/components/ui/RequiredLabel"
import { useOrgCodeLookup } from "@/hooks/useVendor"
import { useGroupCodeLookup } from "@/hooks/useGroups"
import type { OnboardingData } from "./OnboardingWizard"

const schema = z.object({
  company_name: z.string().min(2, "Required"),
  contact_name: z.string().min(2, "Required"),
  contact_email: z.email("Enter a valid email"),
  contact_phone: z
    .string()
    .min(1, "Phone number is required")
    .regex(/^\d{10}$/, "Enter a valid 10-digit phone number (numbers only)"),
  is_solo_user: z.boolean(),
  org_code: z.string().optional(),
  group_code: z.string().optional(),
}).superRefine((data, ctx) => {
  const hasOrgCode = !!data.org_code?.trim()
  const hasGroupCode = !!data.group_code?.trim()
  if (!hasOrgCode && !hasGroupCode) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Required", path: ["org_code"] })
  }
  if (hasOrgCode && hasGroupCode) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Provide either an Organisation Code or a Group Code, not both", path: ["group_code"] })
  }
})
type FormData = z.infer<typeof schema>

// Strips a "+91" prefix that may have been persisted with an earlier draft.
function toNationalNumber(value?: string) {
  return (value ?? "").replace(/^\+?91/, "").replace(/\D/g, "").slice(0, 10)
}

interface Props {
  defaultValues: Partial<OnboardingData>
  onNext: (data: Partial<OnboardingData>) => void
  inviteLocked?: boolean
}

export function Step1CompanyInfo({ defaultValues, onNext, inviteLocked }: Props) {
  // Locked/prefilled when the vendor arrived via an admin-issued invite link
  // carrying an org or group code; otherwise editable (self-signup).
  const orgGroupCodeLocked = !!inviteLocked

  const { register, handleSubmit, control, watch, setValue, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      ...defaultValues,
      contact_phone: toNationalNumber(defaultValues.contact_phone),
      is_solo_user: defaultValues.is_solo_user ?? false,
      org_code: defaultValues.org_code ?? "",
      group_code: defaultValues.group_code ?? "",
    },
  })

  // The invite-link's org/group code resolves asynchronously (a react-query
  // fetch in the parent wizard) and can arrive after this form has already
  // mounted with its (then-empty) defaultValues -- react-hook-form only
  // reads defaultValues once at mount, so a late-arriving value needs to be
  // pushed in explicitly once it shows up.
  useEffect(() => {
    if (defaultValues.org_code) setValue("org_code", defaultValues.org_code)
    if (defaultValues.group_code) setValue("group_code", defaultValues.group_code)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultValues.org_code, defaultValues.group_code])

  const orgCodeValue = watch("org_code") ?? ""
  const groupCodeValue = watch("group_code") ?? ""
  const { data: orgLookup, isFetching: orgLookupLoading } = useOrgCodeLookup(orgCodeValue)
  const { data: groupLookup, isFetching: groupLookupLoading } = useGroupCodeLookup(groupCodeValue)

  function submit(data: FormData) {
    if (data.org_code?.trim() && !orgLookup) return
    if (data.group_code?.trim() && !groupLookup) return
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
          <div className="flex flex-col gap-1.5">
            <Label><RequiredLabel>Organisation Code</RequiredLabel></Label>
            <Input
              placeholder="e.g. ACMECO-4F2A"
              disabled={orgGroupCodeLocked}
              {...register("org_code")}
            />
            {orgCodeValue.trim().length >= 3 && !orgLookupLoading && (
              orgLookup
                ? <p className="text-xs text-green-600">{orgLookup.name}</p>
                : <p className="text-xs text-destructive">Code not found</p>
            )}
            {errors.org_code && <p className="text-xs text-destructive">{errors.org_code.message}</p>}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Group Code</Label>
            <Input
              placeholder="Instead of an Organisation Code, if you were onboarded via a group"
              disabled={orgGroupCodeLocked}
              {...register("group_code")}
            />
            {groupCodeValue.trim().length >= 3 && !groupLookupLoading && (
              groupLookup
                ? <p className="text-xs text-green-600">{groupLookup.name}</p>
                : <p className="text-xs text-destructive">Code not found</p>
            )}
            {errors.group_code && <p className="text-xs text-destructive">{errors.group_code.message}</p>}
            {orgGroupCodeLocked && (
              <p className="text-xs text-muted-foreground">Set by your invite link -- not editable here.</p>
            )}
          </div>
          <Controller
            name="is_solo_user"
            control={control}
            render={({ field }) => (
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={field.value} onCheckedChange={(checked) => field.onChange(checked === true)} />
                I'm a solo user (no separate staff to invite later)
              </label>
            )}
          />
          <Button type="submit" className="w-full mt-2">Continue</Button>
        </CardContent>
      </form>
    </Card>
  )
}
