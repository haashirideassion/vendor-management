import { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { useVendor, useUpdateVendor } from "@/hooks/useVendor"
import { PageHeader } from "@/components/shared/PageHeader"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
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

  const { register, handleSubmit, reset, formState: { errors } } = useForm<FormData>({
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

  if (isLoading) return <div className="p-6 text-sm text-muted-foreground">Loading…</div>
  if (!vendor) return null

  const vendorAsMap = vendor as unknown as Record<string, string | null>

  return (
    <div>
      <PageHeader title="Company Profile" description="View and update your company information.">
        {!editing && <Button size="sm" onClick={() => setEditing(true)}>Edit</Button>}
      </PageHeader>

      <form onSubmit={handleSubmit(onSubmit)}>
        <div className="p-6 flex flex-col gap-6">
          <Card>
            <CardHeader><CardTitle className="text-base">Company Details</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {fields.map(({ id, label }) => (
                <div key={id} className="flex flex-col gap-1.5">
                  <Label>{label}</Label>
                  {editing ? (
                    <>
                      <Input {...register(id)} />
                      {errors[id] && (
                        <p className="text-xs text-destructive">{errors[id]?.message}</p>
                      )}
                    </>
                  ) : (
                    <p className="text-sm">{vendorAsMap[id] ?? "—"}</p>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Tax & Banking</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {bankFields.map(({ id, label }) => (
                <div key={id} className="flex flex-col gap-1.5">
                  <Label>{label}</Label>
                  {editing ? (
                    <Input {...register(id)} />
                  ) : (
                    <p className="text-sm">{vendorAsMap[id] ?? "—"}</p>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>

          {editing && (
            <div className="flex gap-3">
              <Button type="button" variant="outline" onClick={handleCancel}>Cancel</Button>
              <Button type="submit" disabled={updateVendor.isPending}>
                {updateVendor.isPending ? "Saving…" : "Save changes"}
              </Button>
            </div>
          )}
        </div>
      </form>
    </div>
  )
}
