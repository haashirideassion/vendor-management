import { useState, useEffect, useRef } from "react"
import { useNavigate } from "react-router-dom"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { useVendor, useUpdateVendor, useUpdateVendorCategories, useMyOrganizations, useOrganizationSearch, useOrgCodeLookup, useRequestOrganization } from "@/hooks/useVendor"
import { useCategories } from "@/hooks/useCategories"
import { useMyVendorRole } from "@/hooks/useVendorUsers"
import { useUpdateMyProfile } from "@/hooks/useMyProfile"
import { useAuth } from "@/contexts/AuthContext"
import { AnimatedPage } from "@/components/shared/AnimatedPage"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Command, CommandInput, CommandList, CommandItem, CommandEmpty } from "@/components/ui/command"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogBody } from "@/components/ui/dialog"
import { StatusBadge } from "@/components/shared/StatusBadge"
import { SolarDuotoneIcon } from "@/components/shared/SolarIcon"
import {
  UserCircleIcon,
  Edit01Icon,
  Cancel01Icon,
  CheckmarkCircle01Icon,
  Building06Icon,
  Tag01Icon,
  Delete01Icon,
  Add01Icon,
} from "@/components/shared/SolarIcon"
import { toast } from "sonner"
import type { VendorStatus } from "@/lib/types"

const schema = z.object({
  company_name: z.string().min(2, "Required"),
  legal_name: z.string().nullable().optional(),
  contact_name: z.string().min(2, "Required"),
  contact_email: z.email("Invalid email"),
  contact_phone: z.string().nullable().optional(),
  tax_gst_number: z.string().nullable().optional(),
  pan_number: z.string().nullable().optional(),
  registration_number: z.string().nullable().optional(),
  bank_name: z.string().nullable().optional(),
  bank_account_number: z.string().nullable().optional(),
  bank_routing_number: z.string().nullable().optional(),
})
type FormData = z.infer<typeof schema>

type FieldId = keyof FormData

const fields: { id: FieldId; label: string }[] = [
  { id: "company_name", label: "Company name" },
  { id: "legal_name", label: "Legal name (if different)" },
  { id: "contact_name", label: "Contact name" },
  { id: "contact_email", label: "Contact email" },
  { id: "contact_phone", label: "Phone" },
]

const bankFields: { id: FieldId; label: string }[] = [
  { id: "tax_gst_number", label: "Tax / GST number" },
  { id: "pan_number", label: "PAN number" },
  { id: "registration_number", label: "Registration number" },
  { id: "bank_name", label: "Bank name" },
  { id: "bank_account_number", label: "Account number" },
  { id: "bank_routing_number", label: "Routing / SWIFT / IFSC" },
]

export function VendorProfile() {
  const navigate = useNavigate()
  const { data: vendor, isLoading } = useVendor()
  const { data: allCategories = [] } = useCategories(true)
  const updateVendor = useUpdateVendor()
  const updateVendorCategories = useUpdateVendorCategories()
  const { data: organizations = [] } = useMyOrganizations()
  const { data: myRoleNames = [] } = useMyVendorRole()
  const isViewerAdmin = myRoleNames.includes("Admin")
  const [editing, setEditing] = useState(false)
  const [categoryPickerOpen, setCategoryPickerOpen] = useState(false)
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>([])
  const [addOrgOpen, setAddOrgOpen] = useState(false)
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
          legal_name: vendor.legal_name,
          contact_name: vendor.contact_name,
          contact_email: vendor.contact_email,
          contact_phone: vendor.contact_phone,
          tax_gst_number: vendor.tax_gst_number,
          pan_number: vendor.pan_number,
          registration_number: vendor.registration_number,
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

  if (!vendor || vendor.status === "invited") {
    return (
      <AnimatedPage>
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3 p-6 text-center">
          <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center">
            <SolarDuotoneIcon icon={UserCircleIcon} size={32} strokeWidth={1.5} className="text-muted-foreground" />
          </div>
          <p className="text-sm font-medium">
            {vendor ? "Onboarding not yet started" : "No profile found"}
          </p>
          <p className="text-sm text-muted-foreground">
            Complete your onboarding to set up your vendor profile.
          </p>
          <Button onClick={() => navigate("/onboarding")}>Start onboarding</Button>
        </div>
      </AnimatedPage>
    )
  }

  const vendorAsMap = vendor as unknown as Record<string, string | null>

  return (
    <AnimatedPage>
      <form onSubmit={handleSubmit(onSubmit)}>
        <div className="p-6 space-y-6">
          {/* Actions */}
          {isViewerAdmin && (
            <div className="flex items-center justify-end gap-4">
              {!editing ? (
                <Button size="sm" variant="outline" onClick={() => setEditing(true)} type="button">
                  <SolarDuotoneIcon icon={Edit01Icon} size={15} strokeWidth={1.5} className="mr-1.5" />
                  Edit
                </Button>
              ) : (
                <div className="flex gap-2">
                  <Button type="button" size="sm" variant="outline" onClick={handleCancel}>
                    <SolarDuotoneIcon icon={Cancel01Icon} size={15} strokeWidth={1.5} className="mr-1.5" />
                    Cancel
                  </Button>
                  <Button type="submit" size="sm" disabled={isPending}>
                    <SolarDuotoneIcon icon={CheckmarkCircle01Icon} size={15} strokeWidth={1.5} className="mr-1.5" />
                    {isPending ? "Saving…" : "Save changes"}
                  </Button>
                </div>
              )}
            </div>
          )}

          <MyDetailsCard />

          {/* Company Details */}
          <Card>
            <CardHeader className="pb-4">
              <div className="flex items-center gap-2">
                <SolarDuotoneIcon icon={UserCircleIcon} size={16} strokeWidth={1.5} className="text-primary" />
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
                <SolarDuotoneIcon icon={Building06Icon} size={16} strokeWidth={1.5} className="text-primary" />
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
                <SolarDuotoneIcon icon={Tag01Icon} size={16} strokeWidth={1.5} className="text-primary" />
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
                              <SolarDuotoneIcon icon={Delete01Icon} size={11} strokeWidth={2} />
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

          {/* Organisations */}
          <Card>
            <CardHeader className="pb-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <SolarDuotoneIcon icon={Building06Icon} size={16} strokeWidth={1.5} className="text-primary" />
                  <CardTitle className="text-base">Organisations</CardTitle>
                </div>
                <Button type="button" size="sm" variant="outline" onClick={() => setAddOrgOpen(true)}>
                  <SolarDuotoneIcon icon={Add01Icon} size={15} strokeWidth={1.5} className="mr-1.5" />
                  Add Organisation
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {organizations.length > 0 ? (
                <div className="space-y-2">
                  {organizations.map((row) => (
                    <div
                      key={row.organization.id}
                      className="flex items-center justify-between gap-3 rounded-lg border p-3"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{row.organization.name}</p>
                        {row.vendor_id_code && (
                          <p className="text-xs font-mono text-muted-foreground">{row.vendor_id_code}</p>
                        )}
                      </div>
                      <StatusBadge status={row.status as VendorStatus} className="shrink-0" />
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No organisations yet — use "Add Organisation" to request a relationship with a client organisation.
                </p>
              )}
            </CardContent>
          </Card>

        </div>
      </form>

      <AddOrganizationDialog
        open={addOrgOpen}
        onClose={() => setAddOrgOpen(false)}
        existingOrgIds={organizations.map((row) => row.organization.id)}
      />
    </AnimatedPage>
  )
}

// Personal fields every staff member (any role) can edit for themselves --
// distinct from the Company Details card above, which is the shared company
// record and Admin-only to edit. Not a <form> (the page already has one
// wrapping everything else) -- a plain button + onClick avoids accidentally
// submitting that outer company-profile form.
function MyDetailsCard() {
  const { profile, refreshProfile } = useAuth()
  const updateMyProfile = useUpdateMyProfile()
  const [editing, setEditing] = useState(false)
  const [fullName, setFullName] = useState(profile?.full_name ?? "")
  const [mobile, setMobile] = useState(profile?.mobile ?? "")

  function startEditing() {
    setFullName(profile?.full_name ?? "")
    setMobile(profile?.mobile ?? "")
    setEditing(true)
  }

  async function handleSave() {
    if (!fullName.trim()) return toast.error("Name is required")
    try {
      await updateMyProfile.mutateAsync({ fullName: fullName.trim(), mobile: mobile.trim() })
      await refreshProfile()
      toast.success("Your details were updated")
      setEditing(false)
    } catch (e: unknown) {
      toast.error((e as Error).message ?? "Failed to update your details")
    }
  }

  return (
    <Card>
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <SolarDuotoneIcon icon={UserCircleIcon} size={16} strokeWidth={1.5} className="text-primary" />
            <CardTitle className="text-base">My Details</CardTitle>
          </div>
          {!editing ? (
            <Button type="button" size="sm" variant="outline" onClick={startEditing}>
              <SolarDuotoneIcon icon={Edit01Icon} size={15} strokeWidth={1.5} className="mr-1.5" />
              Edit
            </Button>
          ) : (
            <div className="flex gap-2">
              <Button type="button" size="sm" variant="outline" onClick={() => setEditing(false)}>Cancel</Button>
              <Button type="button" size="sm" onClick={handleSave} disabled={updateMyProfile.isPending}>
                {updateMyProfile.isPending ? "Saving…" : "Save"}
              </Button>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Name</Label>
          {editing ? (
            <Input value={fullName} onChange={(e) => setFullName(e.target.value)} className="h-9" />
          ) : (
            <p className="text-sm font-medium">{profile?.full_name ?? "—"}</p>
          )}
        </div>
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Email</Label>
          <p className="text-sm font-medium">{profile?.email ?? "—"}</p>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Mobile</Label>
          {editing ? (
            <Input value={mobile} onChange={(e) => setMobile(e.target.value)} className="h-9" placeholder="+91XXXXXXXXXX" />
          ) : (
            <p className="text-sm font-medium">{profile?.mobile ?? "—"}</p>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

function AddOrganizationDialog({
  open, onClose, existingOrgIds,
}: {
  open: boolean
  onClose: () => void
  existingOrgIds: string[]
}) {
  const [mode, setMode] = useState<"search" | "code">("search")
  const [query, setQuery] = useState("")
  const [code, setCode] = useState("")
  const { data: results = [], isFetching } = useOrganizationSearch(query)
  const { data: codeResult, isFetching: codeLookupLoading } = useOrgCodeLookup(mode === "code" ? code : "")
  const requestOrg = useRequestOrganization()

  function handleClose() {
    setQuery("")
    setCode("")
    setMode("search")
    onClose()
  }

  async function handleRequest(orgId: string, orgName: string) {
    try {
      await requestOrg.mutateAsync(orgId)
      toast.success(`Requested a relationship with ${orgName}`)
      handleClose()
    } catch (e: unknown) {
      toast.error((e as Error).message ?? "Failed to request organization")
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Add Organisation</DialogTitle></DialogHeader>
        <DialogBody className="space-y-3">
          <div className="flex gap-2">
            <Button type="button" size="sm" variant={mode === "search" ? "default" : "outline"} onClick={() => setMode("search")}>
              Search by name
            </Button>
            <Button type="button" size="sm" variant={mode === "code" ? "default" : "outline"} onClick={() => setMode("code")}>
              Enter a code
            </Button>
          </div>
          {mode === "search" ? (
            <>
              <div className="space-y-1.5">
                <Label>Search organisations</Label>
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Type at least 2 characters…"
                  autoFocus
                />
              </div>
              <div className="space-y-2 max-h-72 overflow-y-auto">
                {isFetching && (
                  <p className="text-xs text-muted-foreground">Searching…</p>
                )}
                {!isFetching && query.trim().length >= 2 && results.length === 0 && (
                  <p className="text-xs text-muted-foreground">No organisations found.</p>
                )}
                {results.map((org) => {
                  const already = existingOrgIds.includes(org.id)
                  return (
                    <div key={org.id} className="flex items-center justify-between gap-3 rounded-lg border p-2.5">
                      <p className="truncate text-sm font-medium">{org.name}</p>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={already || requestOrg.isPending}
                        onClick={() => handleRequest(org.id, org.name)}
                      >
                        {already ? "Already requested" : requestOrg.isPending ? "Requesting…" : "Request"}
                      </Button>
                    </div>
                  )
                })}
              </div>
            </>
          ) : (
            <div className="space-y-1.5">
              <Label>Organisation Code</Label>
              <Input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="e.g. ACMECO-4F2A"
                autoFocus
              />
              {code.trim().length >= 3 && !codeLookupLoading && (
                codeResult ? (
                  <div className="flex items-center justify-between gap-3 rounded-lg border p-2.5 mt-2">
                    <p className="truncate text-sm font-medium">{codeResult.name}</p>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={existingOrgIds.includes(codeResult.id) || requestOrg.isPending}
                      onClick={() => handleRequest(codeResult.id, codeResult.name)}
                    >
                      {existingOrgIds.includes(codeResult.id) ? "Already requested" : requestOrg.isPending ? "Requesting…" : "Request"}
                    </Button>
                  </div>
                ) : (
                  <p className="text-xs text-destructive">Code not found</p>
                )
              )}
            </div>
          )}
        </DialogBody>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={handleClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
