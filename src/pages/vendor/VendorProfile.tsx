import { useState } from "react"
import { Link } from "react-router-dom"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { useVendor, useUpdateVendor } from "@/hooks/useVendor"
import { AnimatedPage } from "@/components/shared/AnimatedPage"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { HugeiconsIcon } from "@hugeicons/react"
import { UserCircleIcon, Edit01Icon, Cancel01Icon, CheckmarkCircle01Icon, Building06Icon } from "@hugeicons/core-free-icons"
import { toast } from "sonner"

const schema = z.object({
  company_name: z.string().min(2, "Required"),
  contact_name: z.string().min(2, "Required"),
  contact_email: z.string().email("Invalid email"),
  contact_phone: z.string().nullable().optional(),
  tax_gst_number: z.string().nullable().optional(),
  bank_name: z.string().nullable().optional(),
  bank_account_number: z.string().nullable().optional(),
  bank_routing_number: z.string().nullable().optional(),
})
type FormData = z.infer<typeof schema>

type FieldId = keyof FormData

const fields: { id: FieldId; label: string }[] = [
  { id: "company_name", label: "Company name" },
  { id: "contact_name", label: "Contact name" },
  { id: "contact_email", label: "Contact email" },
  { id: "contact_phone", label: "Phone" },
]

const bankFields: { id: FieldId; label: string }[] = [
  { id: "tax_gst_number", label: "Tax / GST number" },
  { id: "bank_name", label: "Bank name" },
  { id: "bank_account_number", label: "Account number" },
  { id: "bank_routing_number", label: "Routing / SWIFT / IFSC" },
]

export function VendorProfile() {
  const { data: vendor, isLoading } = useVendor()
  const updateVendor = useUpdateVendor()
  const [editing, setEditing] = useState(false)

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    values: vendor
      ? {
          company_name: vendor.company_name,
          contact_name: vendor.contact_name,
          contact_email: vendor.contact_email,
          contact_phone: vendor.contact_phone,
          tax_gst_number: vendor.tax_gst_number,
          bank_name: vendor.bank_name,
          bank_account_number: vendor.bank_account_number,
          bank_routing_number: vendor.bank_routing_number,
        }
      : undefined,
  })

  async function onSubmit(data: FormData) {
    try {
      await updateVendor.mutateAsync(data)
      toast.success("Profile updated")
      setEditing(false)
    } catch (e: unknown) {
      toast.error((e as Error).message)
    }
  }

  function handleCancel() {
    reset()
    setEditing(false)
  }

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <div className="h-8 w-48 rounded-md bg-muted animate-pulse" />
        <div className="h-48 rounded-xl bg-muted animate-pulse" />
        <div className="h-48 rounded-xl bg-muted animate-pulse" />
      </div>
    )
  }

  if (!vendor) {
    return (
      <AnimatedPage>
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 p-6 text-center">
          <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center">
            <HugeiconsIcon icon={UserCircleIcon} size={32} strokeWidth={1.5} className="text-muted-foreground" />
          </div>
          <div className="space-y-1">
            <p className="text-sm font-medium">No profile found</p>
            <p className="text-sm text-muted-foreground">
              Complete your onboarding to set up your vendor profile.
            </p>
          </div>
          <Button asChild>
            <Link to="/onboarding">Complete onboarding</Link>
          </Button>
        </div>
      </AnimatedPage>
    )
  }

  const vendorAsMap = vendor as unknown as Record<string, string | null>

  return (
    <AnimatedPage>
      <form onSubmit={handleSubmit(onSubmit)}>
        <div className="p-6 space-y-6">
          {/* Page header */}
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-xl font-bold tracking-tight">Company Profile</h1>
              <p className="text-sm text-muted-foreground">View and update your company information.</p>
            </div>
            {!editing ? (
              <Button size="sm" variant="outline" onClick={() => setEditing(true)} type="button">
                <HugeiconsIcon icon={Edit01Icon} size={15} strokeWidth={1.5} className="mr-1.5" />
                Edit
              </Button>
            ) : (
              <div className="flex gap-2">
                <Button type="button" size="sm" variant="outline" onClick={handleCancel}>
                  <HugeiconsIcon icon={Cancel01Icon} size={15} strokeWidth={1.5} className="mr-1.5" />
                  Cancel
                </Button>
                <Button type="submit" size="sm" disabled={updateVendor.isPending}>
                  <HugeiconsIcon icon={CheckmarkCircle01Icon} size={15} strokeWidth={1.5} className="mr-1.5" />
                  {updateVendor.isPending ? "Saving…" : "Save changes"}
                </Button>
              </div>
            )}
          </div>

          {/* Company Details */}
          <Card>
            <CardHeader className="pb-4">
              <div className="flex items-center gap-2">
                <HugeiconsIcon icon={UserCircleIcon} size={16} strokeWidth={1.5} className="text-primary" />
                <CardTitle className="text-base">Company Details</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              {fields.map(({ id, label }) => (
                <div key={id} className="flex flex-col gap-1.5">
                  <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    {label}
                  </Label>
                  {editing ? (
                    <>
                      <Input {...register(id)} className="h-9" />
                      {errors[id] && (
                        <p className="text-xs text-destructive">{errors[id]?.message}</p>
                      )}
                    </>
                  ) : (
                    <p className="text-sm font-medium">{vendorAsMap[id] ?? "—"}</p>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Tax & Banking */}
          <Card>
            <CardHeader className="pb-4">
              <div className="flex items-center gap-2">
                <HugeiconsIcon icon={Building06Icon} size={16} strokeWidth={1.5} className="text-primary" />
                <CardTitle className="text-base">Tax & Banking</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              {bankFields.map(({ id, label }) => (
                <div key={id} className="flex flex-col gap-1.5">
                  <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    {label}
                  </Label>
                  {editing ? (
                    <Input {...register(id)} className="h-9" />
                  ) : (
                    <p className="text-sm font-medium">{vendorAsMap[id] ?? "—"}</p>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </form>
    </AnimatedPage>
  )
}
