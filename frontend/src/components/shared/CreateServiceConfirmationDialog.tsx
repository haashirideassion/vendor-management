import { useEffect, useState } from "react"
import { useForm, useFieldArray } from "react-hook-form"
import type { Resolver } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { useCreateServiceConfirmation } from "@/hooks/useServiceConfirmations"
import { usePurchaseOrders } from "@/hooks/usePurchaseOrders"
import { useUploadAttachments } from "@/hooks/useAttachments"
import { FileUploadZone } from "./FileUploadZone"
import type { POLineItem } from "@/lib/types"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Separator } from "@/components/ui/separator"
import { Add01Icon, Delete01Icon } from "@/components/shared/SolarIcon"
import { SolarDuotoneIcon } from "@/components/shared/SolarIcon"
import { TaxComponentsField } from "@/components/shared/TaxComponentsField"
import { supabase } from "@/lib/supabase"

const lineItemSchema = z.object({
  po_line_item_id:    z.string().optional(),
  description:        z.string().min(1, "Required"),
  quantity_confirmed: z.coerce.number().positive("Must be > 0"),
  unit_price:         z.coerce.number().min(0),
  tax_rate:           z.coerce.number().min(0),
  tax_components:     z.array(z.object({ name: z.string(), rate: z.coerce.number() })).optional(),
  unit:               z.string().optional(),
})

const createSchema = z.object({
  po_id:          z.string().uuid("Select a PO"),
  vendor_id:      z.string().uuid("Vendor required"),
  confirmed_date: z.string().min(1, "Required"),
  notes:          z.string().optional(),
  line_items:     z.array(lineItemSchema).min(1, "Add at least one line item"),
})
type CreateForm = z.infer<typeof createSchema>

interface CreateServiceConfirmationDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  defaultPOId?: string
  defaultVendorId?: string
  onSuccess?: () => void
}

// A Service Confirmation can be recorded multiple times against the same PO
// (e.g. milestone-based billing) -- each time, only the quantity not yet
// confirmed (across all non-rejected prior confirmations) should be offered
// as the default. Mirrors CreateGRNDialog's fetchRemainingLineItems exactly.
async function fetchRemainingLineItems(poId: string): Promise<(POLineItem & { remaining: number })[]> {
  const { data: lineItems } = await supabase
    .from("po_line_items")
    .select("*")
    .eq("po_id", poId)

  if (!lineItems || lineItems.length === 0) return []

  const { data: scRows } = await supabase
    .from("service_confirmation_line_items")
    .select("po_line_item_id, quantity_confirmed, service_confirmation:service_confirmation_id(status)")
    .in("po_line_item_id", lineItems.map((li) => li.id))

  const confirmedByLine = new Map<string, number>()
  for (const row of scRows ?? []) {
    const sc = row.service_confirmation as unknown as { status?: string } | null
    if (!row.po_line_item_id || sc?.status === "rejected") continue
    confirmedByLine.set(
      row.po_line_item_id,
      (confirmedByLine.get(row.po_line_item_id) ?? 0) + Number(row.quantity_confirmed)
    )
  }

  return lineItems
    .map((li) => ({ ...li, remaining: Number(li.quantity) - (confirmedByLine.get(li.id) ?? 0) }))
    .filter((li) => li.remaining > 1e-6)
}

export function CreateServiceConfirmationDialog({ open, onOpenChange, defaultPOId, defaultVendorId, onSuccess }: CreateServiceConfirmationDialogProps) {
  const { data: allIssuedPOs = [], isLoading: posLoading } = usePurchaseOrders({ status: "issued" })
  // A Blanket PO is never fulfilled directly -- only its Release Orders are.
  const pos = allIssuedPOs.filter((p) => p.fulfillment_type === "service" && p.po_type !== "blanket")
  const createServiceConfirmation = useCreateServiceConfirmation()
  const uploadAttachments        = useUploadAttachments()
  const [stagedFiles, setStagedFiles] = useState<File[]>([])

  const form = useForm<CreateForm>({
    resolver: zodResolver(createSchema) as unknown as Resolver<CreateForm>,
    defaultValues: {
      po_id:          defaultPOId ?? "",
      vendor_id:      defaultVendorId ?? "",
      confirmed_date: new Date().toISOString().slice(0, 10),
      line_items:     [{ description: "", quantity_confirmed: 1, unit_price: 0, tax_rate: 0, tax_components: [], unit: "" }],
    },
  })
  const { fields, append, remove } = useFieldArray({ control: form.control, name: "line_items" })

  useEffect(() => {
    if (!open) { setStagedFiles([]); return }

    async function init() {
      const remaining = defaultPOId ? await fetchRemainingLineItems(defaultPOId) : []
      form.reset({
        po_id:          defaultPOId ?? "",
        vendor_id:      defaultVendorId ?? "",
        confirmed_date: new Date().toISOString().slice(0, 10),
        line_items: remaining.length
          ? remaining.map((li) => ({
              po_line_item_id:    li.id,
              description:        li.description,
              quantity_confirmed: li.remaining,
              unit_price:         li.unit_price,
              tax_rate:           li.tax_rate,
              tax_components:     [],
              unit:               li.unit ?? "",
            }))
          : [{ description: "", quantity_confirmed: 1, unit_price: 0, tax_rate: 0, tax_components: [], unit: "" }],
      })
    }
    init()
  }, [open, defaultPOId, defaultVendorId, form])

  async function handlePOChange(poId: string) {
    form.setValue("po_id", poId)
    const po = pos.find((p) => p.id === poId)
    if (po?.vendor_id) form.setValue("vendor_id", po.vendor_id)

    const remaining = await fetchRemainingLineItems(poId)
    if (remaining.length > 0) {
      form.setValue("line_items", remaining.map((li) => ({
        po_line_item_id:    li.id,
        description:        li.description,
        quantity_confirmed: li.remaining,
        unit_price:         li.unit_price,
        tax_rate:           li.tax_rate,
        tax_components:     [],
        unit:               li.unit ?? "",
      })))
    }
  }

  async function onSubmit(data: CreateForm) {
    let scId: string
    try {
      const sc = await createServiceConfirmation.mutateAsync({
        po_id:          data.po_id,
        vendor_id:      data.vendor_id,
        confirmed_date: data.confirmed_date,
        notes:          data.notes || undefined,
        line_items:     data.line_items.map((item) => ({
          ...item,
          unit:            item.unit ?? null,
          po_line_item_id: item.po_line_item_id ?? null,
          tax_components:  (item.tax_components ?? []).filter((c) => c.name.trim() !== ""),
        })),
      })
      scId = sc.id
    } catch {
      return
    }
    if (stagedFiles.length > 0) {
      try {
        await uploadAttachments.mutateAsync({ entityType: "service_confirmation", entityId: scId, files: stagedFiles })
      } catch { /* hook toasts its own error */ }
    }
    onOpenChange(false)
    onSuccess?.()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="4xl">
        <DialogHeader><DialogTitle>Record Service Confirmation</DialogTitle></DialogHeader>
        <DialogBody>
          <form id="create-service-confirmation-dialog" onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 pt-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Purchase Order <span className="text-destructive">*</span></Label>
                {defaultPOId ? (
                  <Select value={defaultPOId} disabled>
                    <SelectTrigger>
                      <SelectValue>
                        {pos.find((p) => p.id === defaultPOId)?.po_number ?? defaultPOId}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent />
                  </Select>
                ) : (
                  <Select onValueChange={handlePOChange}>
                    <SelectTrigger><SelectValue placeholder="Select issued PO" /></SelectTrigger>
                    <SelectContent loading={posLoading}>
                      {pos.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.po_number} — {p.vendor?.company_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                {form.formState.errors.po_id && (
                  <p className="text-xs text-destructive">{form.formState.errors.po_id.message}</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label>Confirmed Date <span className="text-destructive">*</span></Label>
                <Input type="date" {...form.register("confirmed_date")} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Textarea {...form.register("notes")} placeholder="Scope delivered, milestone reference…" rows={2} />
            </div>
            <Separator />
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-semibold">Services Confirmed <span className="text-destructive">*</span></Label>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs gap-1"
                  onClick={() => append({ description: "", quantity_confirmed: 1, unit_price: 0, tax_rate: 0, tax_components: [], unit: "" })}
                >
                  <SolarDuotoneIcon icon={Add01Icon} size={12} strokeWidth={2} primaryColor="currentColor" secondaryColor="currentColor" />
                  Add Row
                </Button>
              </div>
              <div className="space-y-2">
                <div className="grid grid-cols-12 gap-2 px-0.5 text-[11px] font-medium text-muted-foreground">
                  <div className="col-span-4">Description</div>
                  <div className="col-span-2">Qty Confirmed</div>
                  <div className="col-span-2">Rate</div>
                  <div className="col-span-2">Tax %</div>
                  <div className="col-span-2">Unit</div>
                  <div className="col-span-1" />
                </div>
                {fields.map((field, i) => (
                  <div key={field.id} className="grid grid-cols-12 gap-2 items-start">
                    <div className="col-span-4">
                      <Input {...form.register(`line_items.${i}.description`)} placeholder="Service description" className="h-8 text-xs" />
                    </div>
                    <div className="col-span-2">
                      <Input type="number" min={0.01} step="any" {...form.register(`line_items.${i}.quantity_confirmed`)} placeholder="Qty" className="h-8 text-xs" />
                    </div>
                    <div className="col-span-2">
                      <Input type="number" min={0} step="any" {...form.register(`line_items.${i}.unit_price`)} placeholder="Rate" className="h-8 text-xs" />
                    </div>
                    <div className="col-span-2">
                      <TaxComponentsField
                        flatRate={form.watch(`line_items.${i}.tax_rate`) ?? 0}
                        onFlatRateChange={(rate) => form.setValue(`line_items.${i}.tax_rate`, rate)}
                        components={form.watch(`line_items.${i}.tax_components`) ?? []}
                        onComponentsChange={(components) => form.setValue(`line_items.${i}.tax_components`, components)}
                      />
                    </div>
                    <div className="col-span-2">
                      <Input {...form.register(`line_items.${i}.unit`)} placeholder="Unit" className="h-8 text-xs" />
                    </div>
                    <div className="col-span-1 flex justify-center pt-1">
                      {fields.length > 1 && (
                        <button type="button" onClick={() => remove(i)} className="text-muted-foreground hover:text-destructive">
                          <SolarDuotoneIcon icon={Delete01Icon} size={14} strokeWidth={1.5} />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <Separator />
            <div className="space-y-2">
              <div>
                <p className="text-sm font-semibold">Attachments</p>
                <p className="text-xs text-muted-foreground">Optional supporting documents (uploaded after the confirmation is recorded).</p>
              </div>
              <FileUploadZone
                files={stagedFiles}
                onChange={setStagedFiles}
                disabled={createServiceConfirmation.isPending || uploadAttachments.isPending}
              />
            </div>
          </form>
        </DialogBody>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            type="submit"
            form="create-service-confirmation-dialog"
            disabled={createServiceConfirmation.isPending || uploadAttachments.isPending}
          >
            {createServiceConfirmation.isPending
              ? "Recording…"
              : uploadAttachments.isPending
              ? "Uploading…"
              : "Record Confirmation"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
