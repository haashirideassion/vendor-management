import { useEffect, useState } from "react"
import { useParams, Link } from "react-router-dom"
import { useForm, useFieldArray } from "react-hook-form"
import type { Resolver } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { useRFQ, useUpdateRFQStatus } from "@/hooks/useRFQs"
import { useQuotationByRFQ, useCreateQuotation, useSubmitQuotation } from "@/hooks/useQuotations"
import { AnimatedPage } from "@/components/shared/AnimatedPage"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { RFQ_STATUS_LABELS, RFQ_STATUS_COLORS, QUOTATION_STATUS_LABELS, QUOTATION_STATUS_COLORS } from "@/lib/constants"
import { formatCurrency } from "@/lib/utils"
import type { RFQStatus, QuotationStatus } from "@/lib/types"
import { format } from "date-fns"
import { ArrowLeft01Icon, Add01Icon, Delete01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { toast } from "sonner"

const lineItemSchema = z.object({
  description: z.string().min(1, "Required"),
  quantity:    z.coerce.number().positive("Must be > 0"),
  unit_price:  z.coerce.number().min(0, "Must be ≥ 0"),
  tax_rate:    z.coerce.number().min(0).max(100).default(0),
  remarks:     z.string().optional(),
})

const quotationSchema = z.object({
  notes:      z.string().optional(),
  line_items: z.array(lineItemSchema).min(1, "Add at least one line item"),
})
type QuotationForm = z.infer<typeof quotationSchema>

export function VendorRFQDetail() {
  const { id } = useParams<{ id: string }>()
  const [showQuotationDialog, setShowQuotationDialog] = useState(false)

  const { data: rfq, isLoading } = useRFQ(id)
  const { data: quotation }      = useQuotationByRFQ(id)
  const updateRFQStatus  = useUpdateRFQStatus()
  const createQuotation  = useCreateQuotation()
  const submitQuotation  = useSubmitQuotation()

  useEffect(() => {
    if (rfq && rfq.status === "pending") {
      updateRFQStatus.mutate({ id: rfq.id, status: "viewed" })
    }
  }, [rfq?.id, rfq?.status])

  const form = useForm<QuotationForm>({
    resolver: zodResolver(quotationSchema) as unknown as Resolver<QuotationForm>,
    defaultValues: { notes: "", line_items: [{ description: "", quantity: 1, unit_price: 0, tax_rate: 0, remarks: "" }] },
  })
  const { fields, append, remove } = useFieldArray({ control: form.control, name: "line_items" })

  const watchedItems = form.watch("line_items")
  const grandTotal = watchedItems.reduce((sum, item) => {
    const qty   = Number(item.quantity)   || 0
    const price = Number(item.unit_price) || 0
    const tax   = Number(item.tax_rate)   || 0
    return sum + qty * price * (1 + tax / 100)
  }, 0)

  async function onSaveDraft(data: QuotationForm) {
    if (!rfq) return
    await createQuotation.mutateAsync({
      rfq_id:        rfq.id,
      engagement_id: rfq.engagement_id,
      vendor_id:     rfq.vendor_id,
      notes:         data.notes ?? undefined,
      line_items:    data.line_items.map((li) => ({ ...li, remarks: li.remarks ?? null })),
    })
    toast.success("Quotation saved as draft")
    setShowQuotationDialog(false)
    form.reset()
  }

  async function onSubmitQuotation(data: QuotationForm) {
    if (!rfq) return
    const quot = await createQuotation.mutateAsync({
      rfq_id:        rfq.id,
      engagement_id: rfq.engagement_id,
      vendor_id:     rfq.vendor_id,
      notes:         data.notes ?? undefined,
      line_items:    data.line_items.map((li) => ({ ...li, remarks: li.remarks ?? null })),
    })
    await submitQuotation.mutateAsync({ id: quot.id, total_amount: grandTotal })
    await updateRFQStatus.mutateAsync({ id: rfq.id, status: "responded" })
    setShowQuotationDialog(false)
    form.reset()
  }

  if (isLoading) {
    return (
      <AnimatedPage>
        <div className="p-6 flex justify-center py-24">
          <div className="h-6 w-6 border-2 border-muted-foreground/30 border-t-muted-foreground rounded-full animate-spin" />
        </div>
      </AnimatedPage>
    )
  }

  if (!rfq) {
    return (
      <AnimatedPage>
        <div className="p-6"><p className="text-sm text-muted-foreground">RFQ not found.</p></div>
      </AnimatedPage>
    )
  }

  const canProvideQuotation = !quotation || quotation.status === "draft"

  return (
    <AnimatedPage>
      <div className="p-6 space-y-6">
        <div>
          <Link to="/vendor/rfqs" className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground mb-3">
            <HugeiconsIcon icon={ArrowLeft01Icon} size={13} strokeWidth={1.5} />
            RFQs
          </Link>
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-xl font-bold tracking-tight font-mono">{rfq.rfq_number ?? "RFQ"}</h1>
              <p className="text-sm text-muted-foreground mt-0.5">{rfq.engagement?.title ?? "—"}</p>
            </div>
            <div className="flex items-center gap-2">
              <span className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-xs font-medium border ${RFQ_STATUS_COLORS[rfq.status as RFQStatus]}`}>
                {RFQ_STATUS_LABELS[rfq.status as RFQStatus]}
              </span>
              {canProvideQuotation && (
                <Button size="sm" onClick={() => setShowQuotationDialog(true)}>
                  Provide Quotation
                </Button>
              )}
            </div>
          </div>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">Engagement Details</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
              {rfq.engagement?.description && (
                <div className="col-span-2">
                  <p className="text-xs text-muted-foreground mb-0.5">Description</p>
                  <p className="whitespace-pre-wrap">{rfq.engagement.description}</p>
                </div>
              )}
              {rfq.engagement?.start_date && (
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">Start Date</p>
                  <p className="font-medium">{format(new Date(rfq.engagement.start_date), "dd MMM yyyy")}</p>
                </div>
              )}
              {rfq.engagement?.end_date && (
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">End Date</p>
                  <p className="font-medium">{format(new Date(rfq.engagement.end_date), "dd MMM yyyy")}</p>
                </div>
              )}
              {rfq.engagement?.estimated_value != null && (
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">Budget</p>
                  <p className="font-medium tabular-nums">
                    {formatCurrency(rfq.engagement.estimated_value, rfq.engagement.currency)}
                  </p>
                </div>
              )}
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">RFQ Received</p>
                <p className="font-medium">{format(new Date(rfq.created_at), "dd MMM yyyy")}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {rfq.engagement?.line_items && rfq.engagement.line_items.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold">Requested Items</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-1">
                <div className="grid grid-cols-12 gap-2 text-xs text-muted-foreground font-medium pb-1 border-b">
                  <span className="col-span-5">Description</span>
                  <span className="col-span-2 text-right">Qty</span>
                  <span className="col-span-2">Unit</span>
                  <span className="col-span-3 text-right">Rate</span>
                </div>
                {rfq.engagement.line_items.map((li) => (
                  <div key={li.id} className="grid grid-cols-12 gap-2 text-sm py-1 border-b last:border-0">
                    <span className="col-span-5">{li.description}</span>
                    <span className="col-span-2 text-right tabular-nums">{li.quantity}</span>
                    <span className="col-span-2 text-muted-foreground">{li.unit ?? "—"}</span>
                    <span className="col-span-3 text-right tabular-nums">{formatCurrency(li.unit_price, rfq.engagement?.currency ?? "INR")}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {quotation && (
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold">Your Quotation</CardTitle>
                <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium border ${QUOTATION_STATUS_COLORS[quotation.status as QuotationStatus]}`}>
                  {QUOTATION_STATUS_LABELS[quotation.status as QuotationStatus]}
                </span>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-xs font-mono text-muted-foreground">{quotation.quot_number}</p>
              {quotation.notes && <p className="text-sm">{quotation.notes}</p>}
              {quotation.total_amount != null && (
                <p className="text-sm font-semibold">Total: {formatCurrency(quotation.total_amount, rfq.engagement?.currency ?? "INR")}</p>
              )}
              {quotation.line_items && quotation.line_items.length > 0 && (
                <div className="space-y-1 pt-1">
                  {quotation.line_items.map((li) => (
                    <div key={li.id} className="flex justify-between text-xs text-muted-foreground border-b pb-1">
                      <span>{li.description} × {li.quantity}</span>
                      <span className="tabular-nums">{formatCurrency(li.total, rfq.engagement?.currency ?? "INR")}</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      <Dialog open={showQuotationDialog} onOpenChange={setShowQuotationDialog}>
        <DialogContent size="2xl">
          <DialogHeader><DialogTitle>Provide Quotation</DialogTitle></DialogHeader>
          <DialogBody>
            <form id="quotation-form" className="space-y-4 pt-2">
              <div className="space-y-1.5">
                <Label>Notes</Label>
                <Textarea {...form.register("notes")} placeholder="Terms, delivery timelines, assumptions…" rows={2} />
              </div>
              <Separator />
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-semibold">Line Items <span className="text-destructive">*</span></Label>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs gap-1"
                    onClick={() => append({ description: "", quantity: 1, unit_price: 0, tax_rate: 0, remarks: "" })}
                  >
                    <HugeiconsIcon icon={Add01Icon} size={12} strokeWidth={2} primaryColor="currentColor" secondaryColor="currentColor" />
                    Add Row
                  </Button>
                </div>
                <div className="space-y-2">
                  <div className="grid grid-cols-12 gap-2 text-xs text-muted-foreground font-medium px-1">
                    <span className="col-span-3">Description</span>
                    <span className="col-span-2">Qty</span>
                    <span className="col-span-2">Rate</span>
                    <span className="col-span-2">Tax %</span>
                    <span className="col-span-2">Remarks</span>
                    <span className="col-span-1" />
                  </div>
                  {fields.map((field, i) => (
                    <div key={field.id} className="grid grid-cols-12 gap-2 items-start">
                      <div className="col-span-3">
                        <Input {...form.register(`line_items.${i}.description`)} placeholder="Item" className="h-8 text-xs" />
                      </div>
                      <div className="col-span-2">
                        <Input type="number" min={0.01} step="any" {...form.register(`line_items.${i}.quantity`)} placeholder="1" className="h-8 text-xs" />
                      </div>
                      <div className="col-span-2">
                        <Input type="number" min={0} step="any" {...form.register(`line_items.${i}.unit_price`)} placeholder="0" className="h-8 text-xs" />
                      </div>
                      <div className="col-span-2">
                        <Input type="number" min={0} max={100} step="any" {...form.register(`line_items.${i}.tax_rate`)} placeholder="0" className="h-8 text-xs" />
                      </div>
                      <div className="col-span-2">
                        <Input {...form.register(`line_items.${i}.remarks`)} placeholder="Optional" className="h-8 text-xs" />
                      </div>
                      <div className="col-span-1 flex justify-center pt-1">
                        {fields.length > 1 && (
                          <button type="button" onClick={() => remove(i)} className="text-muted-foreground hover:text-destructive">
                            <HugeiconsIcon icon={Delete01Icon} size={14} strokeWidth={1.5} />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="flex justify-end pt-1">
                  <p className="text-sm font-semibold">
                    Grand Total: {formatCurrency(grandTotal, rfq.engagement?.currency ?? "INR")}
                  </p>
                </div>
              </div>
            </form>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setShowQuotationDialog(false)}>Cancel</Button>
            <Button
              type="button"
              variant="outline"
              disabled={createQuotation.isPending}
              onClick={form.handleSubmit(onSaveDraft)}
            >
              Save Draft
            </Button>
            <Button
              type="button"
              disabled={createQuotation.isPending || submitQuotation.isPending}
              onClick={form.handleSubmit(onSubmitQuotation)}
            >
              {(createQuotation.isPending || submitQuotation.isPending) ? "Submitting…" : "Submit Quotation"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AnimatedPage>
  )
}
