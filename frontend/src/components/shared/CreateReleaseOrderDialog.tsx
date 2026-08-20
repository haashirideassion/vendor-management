import { useEffect } from "react"
import { useForm, useFieldArray } from "react-hook-form"
import type { Resolver } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { useCreatePurchaseOrder } from "@/hooks/usePurchaseOrders"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Separator } from "@/components/ui/separator"
import { formatCurrency } from "@/lib/utils"
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
  total_value:            z.coerce.number().positive("Must be > 0"),
  expected_delivery_date: z.string().optional(),
  delivery_address:       z.string().optional(),
  notes:                  z.string().optional(),
  line_items:             z.array(lineItemSchema).min(1, "Add at least one line item"),
})
type FormValues = z.infer<typeof schema>

// Issues a Release Order -- a normal, fully-functional PO that draws down
// from a Blanket PO's remaining authorized balance. Vendor/currency are
// fixed from the parent (a release can't switch vendors mid-agreement);
// everything else (line items, delivery details) works exactly like
// issuing a standard PO.
export function CreateReleaseOrderDialog({
  open, onOpenChange, blanketPoId, vendorId, vendorName, currency, remainingBalance,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  blanketPoId: string
  vendorId: string
  vendorName?: string
  currency: string
  remainingBalance: number
}) {
  const createPO = useCreatePurchaseOrder()

  const form = useForm<FormValues>({
    resolver: zodResolver(schema) as unknown as Resolver<FormValues>,
    defaultValues: {
      total_value: 0,
      line_items: [{ description: "", quantity: 1, unit_price: 0, tax_rate: 0, unit: "" }],
    },
  })
  const { fields, append, remove } = useFieldArray({ control: form.control, name: "line_items" })

  useEffect(() => {
    if (open) {
      form.reset({
        total_value: 0,
        line_items: [{ description: "", quantity: 1, unit_price: 0, tax_rate: 0, unit: "" }],
      })
    }
  }, [open])

  async function onSubmit(data: FormValues) {
    try {
      await createPO.mutateAsync({
        po_type:                "release",
        parent_po_id:           blanketPoId,
        vendor_id:              vendorId,
        total_value:            data.total_value,
        currency,
        expected_delivery_date: data.expected_delivery_date || undefined,
        delivery_address:       data.delivery_address || undefined,
        notes:                  data.notes || undefined,
        line_items:             data.line_items.map((li) => ({ ...li, unit: li.unit ?? null })),
      })
      onOpenChange(false)
    } catch { /* hook toasts its own error */ }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) form.reset(); onOpenChange(o) }}>
      <DialogContent size="4xl">
        <DialogHeader><DialogTitle>Issue Release Order</DialogTitle></DialogHeader>
        <DialogBody>
          <form id="create-release-order-form" onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 pt-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Vendor</Label>
                <Input value={vendorName ?? "—"} readOnly className="bg-muted/40" />
              </div>
              <div className="space-y-1.5">
                <Label>Remaining Balance</Label>
                <Input value={formatCurrency(remainingBalance, currency)} readOnly className="bg-muted/40 font-medium" />
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

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Total Value <span className="text-destructive">*</span></Label>
                <Input type="number" min={0} step="any" {...form.register("total_value")} placeholder="0" />
                {form.formState.errors.total_value && (
                  <p className="text-xs text-destructive">{form.formState.errors.total_value.message}</p>
                )}
                {Number(form.watch("total_value")) > remainingBalance && (
                  <p className="text-xs text-destructive">Exceeds the remaining balance of {formatCurrency(remainingBalance, currency)}</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label>Expected Delivery</Label>
                <Input type="date" {...form.register("expected_delivery_date")} />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Delivery Address</Label>
              <Textarea {...form.register("delivery_address")} placeholder="Delivery address…" rows={2} />
            </div>

            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Textarea {...form.register("notes")} placeholder="Additional notes…" rows={2} />
            </div>
          </form>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => { form.reset(); onOpenChange(false) }}>Cancel</Button>
          <Button
            type="submit"
            form="create-release-order-form"
            disabled={createPO.isPending || Number(form.watch("total_value")) > remainingBalance}
          >
            {createPO.isPending ? "Creating…" : "Issue Release Order"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
