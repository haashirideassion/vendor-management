import { useState, useEffect, useRef } from "react"
import { Link } from "react-router-dom"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { useVendor, useUpdateVendor, useUpdateVendorCategories } from "@/hooks/useVendor"
import { useCategories } from "@/hooks/useCategories"
import { AnimatedPage } from "@/components/shared/AnimatedPage"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Command, CommandInput, CommandList, CommandItem, CommandEmpty } from "@/components/ui/command"
import { Checkbox } from "@/components/ui/checkbox"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  UserCircleIcon,
  Edit01Icon,
  Cancel01Icon,
  CheckmarkCircle01Icon,
  Building06Icon,
  Tag01Icon,
  Settings01Icon,
  Delete01Icon,
} from "@hugeicons/core-free-icons"
import { toast } from "sonner"

const schema = z.object({
  company_name: z.string().min(2, "Required"),
  contact_name: z.string().min(2, "Required"),
  contact_email: z.email("Invalid email"),
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
  const { data: allCategories = [] } = useCategories(true)
  const updateVendor = useUpdateVendor()
  const updateVendorCategories = useUpdateVendorCategories()
  const [editing, setEditing] = useState(false)
  const [categoryPickerOpen, setCategoryPickerOpen] = useState(false)
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>([])
  const initializedRef = useRef(false)

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

  // Sync category selection from vendor data when entering edit mode
  useEffect(() => {
    if (vendor?.vendor_categories && !initializedRef.current) {
      setSelectedCategoryIds(vendor.vendor_categories.map((vc) => vc.category_id))
      initializedRef.current = true
    }
  }, [vendor?.vendor_categories])

  function toggleCategory(id: string) {
    setSelectedCategoryIds((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]
    )
  }

  async function onSubmit(data: FormData) {
    try {
      await Promise.all([
        updateVendor.mutateAsync(data),
        updateVendorCategories.mutateAsync(selectedCategoryIds),
      ])
      toast.success("Profile updated")
      setEditing(false)
    } catch (e: unknown) {
      toast.error((e as Error).message ?? "Failed to save profile")
    }
  }

  function handleCancel() {
    reset()
    // Revert categories to saved state
    if (vendor?.vendor_categories) {
      setSelectedCategoryIds(vendor.vendor_categories.map((vc) => vc.category_id))
    }
    setEditing(false)
  }

  const isPending = updateVendor.isPending || updateVendorCategories.isPending

  const selectedCategoryLabels = allCategories
    .filter((c) => selectedCategoryIds.includes(c.id))
    .map((c) => c.name)

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
                <Button type="submit" size="sm" disabled={isPending}>
                  <HugeiconsIcon icon={CheckmarkCircle01Icon} size={15} strokeWidth={1.5} className="mr-1.5" />
                  {isPending ? "Saving…" : "Save changes"}
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

          {/* Service Categories — editable when in edit mode */}
          <Card>
            <CardHeader className="pb-4">
              <div className="flex items-center gap-2">
                <HugeiconsIcon icon={Tag01Icon} size={16} strokeWidth={1.5} className="text-primary" />
                <CardTitle className="text-base">Service Categories</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {editing ? (
                <div className="space-y-3">
                  <Popover open={categoryPickerOpen} onOpenChange={setCategoryPickerOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        type="button"
                        variant="outline"
                        role="combobox"
                        className="w-full justify-start font-normal h-9 text-sm"
                      >
                        {selectedCategoryLabels.length === 0 ? (
                          <span className="text-muted-foreground">Select categories…</span>
                        ) : (
                          <span className="truncate">{selectedCategoryLabels.join(", ")}</span>
                        )}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[320px] p-0" align="start">
                      <Command>
                        <CommandInput placeholder="Search categories…" />
                        <CommandList>
                          <CommandEmpty>No categories found.</CommandEmpty>
                          {allCategories.map((cat) => (
                            <CommandItem
                              key={cat.id}
                              value={cat.name}
                              onSelect={() => toggleCategory(cat.id)}
                            >
                              <Checkbox
                                checked={selectedCategoryIds.includes(cat.id)}
                                className="mr-2 h-4 w-4"
                                onCheckedChange={() => toggleCategory(cat.id)}
                              />
                              <div>
                                <p className="text-sm">{cat.name}</p>
                                {cat.description && (
                                  <p className="text-xs text-muted-foreground">{cat.description}</p>
                                )}
                              </div>
                            </CommandItem>
                          ))}
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>

                  {selectedCategoryIds.length === 0 && (
                    <p className="text-xs text-muted-foreground">No categories selected.</p>
                  )}

                  {selectedCategoryIds.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {allCategories
                        .filter((c) => selectedCategoryIds.includes(c.id))
                        .map((cat) => (
                          <span
                            key={cat.id}
                            className="inline-flex items-center gap-1 rounded-full bg-primary/10 text-primary px-3 py-1 text-xs font-medium border border-primary/20"
                          >
                            {cat.name}
                            <button
                              type="button"
                              onClick={() => toggleCategory(cat.id)}
                              className="ml-0.5 hover:text-destructive transition-colors"
                            >
                              <HugeiconsIcon icon={Delete01Icon} size={11} strokeWidth={2} />
                            </button>
                          </span>
                        ))}
                    </div>
                  )}
                </div>
              ) : vendor.vendor_categories && vendor.vendor_categories.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {vendor.vendor_categories.map((vc) => (
                    <span
                      key={vc.id}
                      className="rounded-full bg-primary/10 text-primary px-3 py-1 text-xs font-medium border border-primary/20"
                    >
                      {vc.service_categories?.name}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No categories assigned yet.</p>
              )}
            </CardContent>
          </Card>

          {/* Service Offerings (read-only) */}
          <Card>
            <CardHeader className="pb-4">
              <div className="flex items-center gap-2">
                <HugeiconsIcon icon={Settings01Icon} size={16} strokeWidth={1.5} className="text-primary" />
                <CardTitle className="text-base">Service Offerings</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              {vendor.vendor_services && vendor.vendor_services.length > 0 ? (
                <div className="space-y-2">
                  {vendor.vendor_services.map((svc) => (
                    <div key={svc.id} className="rounded-lg border p-3">
                      <p className="text-sm font-medium">{svc.name}</p>
                      {svc.description && (
                        <p className="text-xs text-muted-foreground mt-0.5">{svc.description}</p>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No service offerings listed yet.</p>
              )}
            </CardContent>
          </Card>
        </div>
      </form>
    </AnimatedPage>
  )
}
