import { useRef, useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { RequiredLabel } from "@/components/ui/RequiredLabel"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { SolarDuotoneIcon } from "@/components/shared/SolarIcon"
import { Edit01Icon, Delete02Icon, Add01Icon } from "@/components/shared/SolarIcon"
import { useUpsertOrgOnboardingLocation, useDeleteOrgOnboardingLocation } from "@/hooks/useOrgOnboarding"
import { NATURE_OF_OPERATIONS, NATURE_OF_OPERATIONS_LABELS } from "@/lib/constants"
import type { OrgOnboardingDraft, OrgOnboardingLocation, NatureOfOperations } from "@/lib/types"

interface Props {
  draft: OrgOnboardingDraft
  readOnly: boolean
  onNext: () => void
  onBack: () => void
}

interface FormState {
  location_name: string
  address: string
  state: string
  city: string
  pincode: string
  employee_count: string
  nature_of_operations: NatureOfOperations | ""
  is_registered_office: boolean
  has_women_employees: boolean
  has_contract_labour: boolean
  has_shift_operations: boolean
}

const EMPTY_FORM: FormState = {
  location_name: "", address: "", state: "", city: "", pincode: "", employee_count: "",
  nature_of_operations: "", is_registered_office: false,
  has_women_employees: false, has_contract_labour: false, has_shift_operations: false,
}

function toFormState(loc: OrgOnboardingLocation): FormState {
  return {
    location_name: loc.location_name,
    address: loc.address ?? "",
    state: loc.state ?? "",
    city: loc.city ?? "",
    pincode: loc.pincode ?? "",
    employee_count: loc.employee_count != null ? String(loc.employee_count) : "",
    nature_of_operations: loc.nature_of_operations ?? "",
    is_registered_office: loc.is_registered_office,
    has_women_employees: !!loc.has_women_employees,
    has_contract_labour: !!loc.has_contract_labour,
    has_shift_operations: !!loc.has_shift_operations,
  }
}

export function Step4LocationDetails({ draft, readOnly, onNext, onBack }: Props) {
  const locations = draft.locations ?? []
  const upsert = useUpsertOrgOnboardingLocation()
  const del = useDeleteOrgOnboardingLocation()
  const [editingId, setEditingId] = useState<string | null>(null)
  const [adding, setAdding] = useState(locations.length === 0)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const formTop = useRef<HTMLDivElement>(null)

  function startAdd() {
    setForm(EMPTY_FORM)
    setEditingId(null)
    setAdding(true)
  }

  function startEdit(loc: OrgOnboardingLocation) {
    setForm(toFormState(loc))
    setEditingId(loc.id)
    setAdding(true)
    formTop.current?.scrollIntoView({ behavior: "smooth", block: "nearest" })
  }

  function cancelForm() {
    setAdding(false)
    setEditingId(null)
  }

  function validationError(): string | null {
    if (!form.location_name.trim()) return "Location name is required"
    if (!form.address.trim()) return "Address is required"
    if (!form.state.trim()) return "State is required"
    if (!form.city.trim()) return "City is required"
    if (!form.pincode.trim()) return "Pincode is required"
    if (!form.employee_count.trim()) return "Employee count is required"
    if (!form.nature_of_operations) return "Nature of operations is required"
    return null
  }

  async function handleSave() {
    const error = validationError()
    if (error) {
      toast.error(error)
      return
    }
    try {
      await upsert.mutateAsync({
        id: editingId ?? undefined,
        location_name: form.location_name.trim(),
        address: form.address.trim() || undefined,
        state: form.state.trim() || undefined,
        city: form.city.trim() || undefined,
        pincode: form.pincode.trim() || undefined,
        employee_count: form.employee_count ? Number(form.employee_count) : undefined,
        nature_of_operations: form.nature_of_operations || undefined,
        is_registered_office: form.is_registered_office,
        has_women_employees: form.has_women_employees,
        has_contract_labour: form.has_contract_labour,
        has_shift_operations: form.has_shift_operations,
      })
      toast.success("Location saved")
      cancelForm()
    } catch (e: unknown) {
      toast.error((e as Error).message ?? "Failed to save location")
    }
  }

  async function handleDelete(id: string) {
    try {
      await del.mutateAsync(id)
      toast.success("Location removed")
    } catch (e: unknown) {
      toast.error((e as Error).message ?? "Failed to remove location")
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Location Details</CardTitle>
        <CardDescription>
          {draft.location_setup === "multiple"
            ? "Add each location this organisation operates from."
            : "Add this organisation's location."}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4" ref={formTop}>
        {locations.length > 0 && (
          <div className="space-y-2">
            {locations.map((loc) => (
              <div key={loc.id} className="flex items-center justify-between gap-3 rounded-lg border p-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {loc.location_name}
                    {loc.is_registered_office && <span className="ml-2 text-xs font-normal text-primary">Registered Office</span>}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {[loc.city, loc.state].filter(Boolean).join(", ") || "No address provided"}
                  </p>
                </div>
                {!readOnly && (
                  <div className="flex shrink-0 items-center gap-1">
                    <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => startEdit(loc)}>
                      <SolarDuotoneIcon icon={Edit01Icon} size={14} strokeWidth={1.5} primaryColor="currentColor" secondaryColor="currentColor" />
                    </Button>
                    <Button
                      type="button" variant="ghost" size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-destructive"
                      onClick={() => handleDelete(loc.id)}
                      disabled={del.isPending}
                    >
                      <SolarDuotoneIcon icon={Delete02Icon} size={14} strokeWidth={1.5} primaryColor="currentColor" secondaryColor="currentColor" />
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {!readOnly && !adding && (draft.location_setup === "multiple" || locations.length === 0) && (
          <Button type="button" variant="outline" className="gap-1.5" onClick={startAdd}>
            <SolarDuotoneIcon icon={Add01Icon} size={15} strokeWidth={1.5} primaryColor="currentColor" secondaryColor="currentColor" />
            {locations.length === 0 ? "Add Location" : "Add another Location"}
          </Button>
        )}

        {!readOnly && adding && (
          <div className="space-y-3 rounded-xl border p-4">
            <div className="flex flex-col gap-1.5">
              <Label><RequiredLabel>Location Name</RequiredLabel></Label>
              <Input value={form.location_name} onChange={(e) => setForm({ ...form, location_name: e.target.value })} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label><RequiredLabel>Address</RequiredLabel></Label>
              <Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <Label><RequiredLabel>State</RequiredLabel></Label>
                <Input value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label><RequiredLabel>City</RequiredLabel></Label>
                <Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <Label><RequiredLabel>Pincode</RequiredLabel></Label>
                <Input value={form.pincode} onChange={(e) => setForm({ ...form, pincode: e.target.value })} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label><RequiredLabel>Employee Count</RequiredLabel></Label>
                <Input type="number" min="0" value={form.employee_count} onChange={(e) => setForm({ ...form, employee_count: e.target.value })} />
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label><RequiredLabel>Nature of Operations</RequiredLabel></Label>
              <Select
                value={form.nature_of_operations}
                onValueChange={(v) => setForm({ ...form, nature_of_operations: v as NatureOfOperations })}
              >
                <SelectTrigger className="w-full"><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>
                  {NATURE_OF_OPERATIONS.map((n) => (
                    <SelectItem key={n} value={n}>{NATURE_OF_OPERATIONS_LABELS[n]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={form.is_registered_office} onCheckedChange={(c) => setForm({ ...form, is_registered_office: c === true })} />
                Registered Office/Factory
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={form.has_women_employees} onCheckedChange={(c) => setForm({ ...form, has_women_employees: c === true })} />
                Women Employees Present
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={form.has_contract_labour} onCheckedChange={(c) => setForm({ ...form, has_contract_labour: c === true })} />
                Contract Labour Present
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={form.has_shift_operations} onCheckedChange={(c) => setForm({ ...form, has_shift_operations: c === true })} />
                Shift-based Operations
              </label>
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="outline" className="flex-1" onClick={cancelForm}>Cancel</Button>
              <Button type="button" className="flex-1" onClick={handleSave} disabled={upsert.isPending}>
                {upsert.isPending ? "Saving…" : editingId ? "Update Location" : "Save Location"}
              </Button>
            </div>
          </div>
        )}

        <div className="mt-2 flex gap-2">
          <Button type="button" variant="outline" className="flex-1" onClick={onBack}>Back</Button>
          <Button type="button" className="flex-1" onClick={onNext} disabled={locations.length === 0}>
            Continue
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
