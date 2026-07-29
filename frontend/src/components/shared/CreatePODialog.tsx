import { useEffect } from "react"
import { useForm, useFieldArray } from "react-hook-form"
import type { Resolver } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { useCreatePurchaseOrder } from "@/hooks/usePurchaseOrders"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Separator } from "@/components/ui/separator"
import { Add01Icon, Delete01Icon } from "@/components/shared/SolarIcon"
import { SolarDuotoneIcon } from "@/components/shared/SolarIcon"

const lineItemSchema = z.object({
  description: z.string().min(1, "Required"),
  quantity:    z.coerce.number().positive("Must be > 0"),
  unit_price:  z.coerce.number().min(0, "Must be ≥ 0"),
  tax_rate:    z.coerce.number().min(0).max(100).default(0),
  unit:        z.string().optional(),
})

const schema = z.object({
  vendor_id:   z.string().uuid("Select a vendor"),
  total_value: z.coerce.number().positive("Must be > 0"),
  currency:    z.string().default("INR"),
  notes:       z.string().optional(),
  line_items:  z.array(lineItemSchema).min(1, "Add at least one line item"),
})
type FormValues = z.infer<typeof schema>

export interface CreatePODialogProps {
  open:              boolean
  onOpenChange:      (o: boolean) => void
  defaultEngagementId?: string
  defaultVendors?:   { id: string; company_name: string }[]
  defaultLineItems?: { description: string; quantity: number; unit_price: number | null; tax_rate?: number; unit?: string | null }[]
  currency?:         string
}

export function CreatePODialog({
  open,
  onOpenChange,
  defaultEngagementId,
  defaultVendors = [],
  defaultLineItems = [],
  currency = "INR",
}: CreatePODialogProps) {
  const createPO = useCreatePurchaseOrder()

  const form = useForm<FormValues>({
    resolver: zodResolver(schema) as unknown as Resolver<FormValues>,
    defaultValues: {
      vendor_id:   defaultVendors[0]?.id ?? "",
      total_value: 0,
      currency,
      notes:       "",
      line_items:  defaultLineItems.length > 0
        ? defaultLineItems.map((li) => ({ description: li.description, quantity: li.quantity, unit_price: li.unit_price ?? 0, tax_rate: li.tax_rate ?? 0, unit: li.unit ?? "" }))
        : [{ description: "", quantity: 1, unit_price: 0, tax_rate: 0, unit: "" }],
    },
  })

  const { fields, append, remove } = useFieldArray({ control: form.control, name: "line_items" })

  useEffect(() => {
    if (!open) return
    form.reset({
      vendor_id:   defaultVendors[0]?.id ?? "",
      total_value: 0,
      currency,
      notes:       "",
      line_items:  defaultLineItems.length > 0
        ? defaultLineItems.map((li) => ({ description: li.description, quantity: li.quantity, unit_price: li.unit_price ?? 0, tax_rate: li.tax_rate ?? 0, unit: li.unit ?? "" }))
        : [{ description: "", quantity: 1, unit_price: 0, tax_rate: 0, unit: "" }],
    })
  }, [open])

  const watchedItems = form.watch("line_items")
  const computedTotal = watchedItems.reduce(
    (sum, li) => sum + (Number(li.quantity) || 0) * (Number(li.unit_price) || 0) * (1 + (Number(li.tax_rate) || 0) / 100),
    0
  )

  async function onSubmit(data: FormValues) {
    await createPO.mutateAsync({
      engagement_id: defaultEngagementId,
      vendor_id:     data.vendor_id,
      total_value:   data.total_value || computedTotal,
      currency:      data.currency,
      notes:         data.notes || undefined,
      line_items:    data.line_items.map((li) => ({ ...li, unit: li.unit ?? null })),
    })
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) form.reset(); onOpenChange(o) }}>
      <DialogContent size="4xl">
        <DialogHeader><DialogTitle>Issue Purchase Order</DialogTitle></DialogHeader>
        <DialogBody>
          <form id="create-po-form" onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 pt-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Vendor <span className="text-destructive">*</span></Label>
                {defaultVendors.length > 0 ? (
                  <Select
                    value={form.watch("vendor_id")}
                    onValueChange={(v) => form.setValue("vendor_id", v, { shouldValidate: true })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select vendor" />
                    </SelectTrigger>
                    <SelectContent>
                      {defaultVendors.map((v) => (
                        <SelectItem key={v.id} value={v.id}>{v.company_name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <p className="text-sm text-muted-foreground">No vendors on this engagement.</p>
                )}
                {form.formState.errors.vendor_id && (
                  <p className="text-xs text-destructive">{form.formState.errors.vendor_id.message}</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label>Currency</Label>
                <Input value={currency} readOnly className="bg-muted/40" />
              </div>
            </div>

            <Separator />

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-semibold">Line Items <span className="text-destructive">*</span></Label>
                <Button
                  type="button" size="sm" variant="outline" className="h-7 text-xs gap-1"
                  onClick={() => append({ description: "", quantity: 1, unit_price: 0, tax_rate: 0, unit: "" })}
                >
                  <SolarDuotoneIcon icon={Add01Icon} size={12} strokeWidth={2} />
                  Add row
                </Button>
              </div>
              <div className="grid grid-cols-12 gap-2 px-1">
                <span className="col-span-4 text-xs text-muted-foreground">Description</span>
                <span className="col-span-2 text-xs text-muted-foreground">Qty</span>
                <span className="col-span-2 text-xs text-muted-foreground">Unit Price</span>
                <span className="col-span-1 text-xs text-muted-foreground">Tax %</span>
                <span className="col-span-2 text-xs text-muted-foreground">Unit</span>
                <span className="col-span-1" />
              </div>
              {fields.map((field, i) => (
                <div key={field.id} className="grid grid-cols-12 gap-2 items-start">
                  <div className="col-span-4">
                    <Input {...form.register(`line_items.${i}.description`)} placeholder="Description" className="h-8 text-xs" />
                  </div>
                  <div className="col-span-2">
                    <Input type="number" min={0.01} step="any" {...form.register(`line_items.${i}.quantity`)} placeholder="1" className="h-8 text-xs" />
                  </div>
                  <div className="col-span-2">
                    <Input type="number" min={0} step="any" {...form.register(`line_items.${i}.unit_price`)} placeholder="0" className="h-8 text-xs" />
                  </div>
                  <div className="col-span-1">
                    <Input type="number" min={0} max={100} step="any" {...form.register(`line_items.${i}.tax_rate`)} placeholder="0" className="h-8 text-xs" />
                  </div>
                  <div className="col-span-2">
                    <Input {...form.register(`line_items.${i}.unit`)} placeholder="pcs" className="h-8 text-xs" />
                  </div>
                  <div className="col-span-1 flex justify-center pt-1">
                    {fields.length > 1 && (
                      <button type="button" onClick={() => remove(i)} className="text-muted-foreground hover:text-destructive transition-colors">
                        <SolarDuotoneIcon icon={Delete01Icon} size={14} strokeWidth={1.5} />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <Separator />

            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Total Value</span>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Auto: {currency} {computedTotal.toLocaleString()}</span>
                <Input
                  type="number"
                  min={0}
                  step="any"
                  {...form.register("total_value")}
                  placeholder={String(computedTotal || 0)}
                  className="h-8 w-36 text-xs text-right"
                />
              </div>
            </div>
          </form>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => { form.reset(); onOpenChange(false) }}>Cancel</Button>
          <Button type="submit" form="create-po-form" disabled={createPO.isPending}>
            {createPO.isPending ? "Creating…" : "Issue PO"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
