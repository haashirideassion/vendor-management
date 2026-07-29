import { useEffect, useState } from "react"
import { useParams, Link } from "react-router-dom"
import { useForm, useFieldArray } from "react-hook-form"
import type { Resolver } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { useRFQ, useUpdateRFQStatus } from "@/hooks/useRFQs"
import {
  useQuotationByRFQ,
  useCreateQuotation,
  useSubmitQuotationForReview,
  useApproveQuotation,
  useReturnQuotationToAssociate,
} from "@/hooks/useQuotations"
import { useMyVendorPermissions } from "@/hooks/useVendorUsers"
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
import { ArrowLeft01Icon, Add01Icon, Delete01Icon } from "@/components/shared/SolarIcon"
import { SolarDuotoneIcon } from "@/components/shared/SolarIcon"
import { toast } from "sonner"

const lineItemSchema = z.object({
  description: z.string().min(1, "Required"),
  quantity:    z.coerce.number().positive("Must be > 0"),
  unit_price:  z.coerce.number().min(0, "Must be ≥ 0"),
  tax_rate:    z.coerce.number().min(0).max(100).default(0),
  remarks:     z.string().optional(),
}).superRefine((item, ctx) => {
  if (Number(item.unit_price) === 0 && !item.remarks?.trim()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Reason required when rate is ₹0",
      path: ["remarks"],
    })
  }
})

const quotationSchema = z.object({
  notes:      z.string().optional(),
  line_items: z.array(lineItemSchema),
})
type QuotationForm = z.infer<typeof quotationSchema>

export function VendorRFQDetail() {
  const { id } = useParams<{ id: string }>()
  const [showQuotationDialog, setShowQuotationDialog] = useState(false)
  const [showReturnDialog, setShowReturnDialog] = useState(false)
  const [returnNotes, setReturnNotes] = useState("")

  const { data: rfq, isLoading } = useRFQ(id)
  const { data: quotation }      = useQuotationByRFQ(id)
  const { data: myPermissions }  = useMyVendorPermissions()
  const updateRFQStatus        = useUpdateRFQStatus()
  const createQuotation        = useCreateQuotation()
  const submitForReview        = useSubmitQuotationForReview()
  const approveQuotation       = useApproveQuotation()
  const returnToAssociate      = useReturnQuotationToAssociate()

  const perms = myPermissions ?? []
  // Associate (or Manager/Admin covering for one) can draft/send for review.
  const canDraftOrSubmit = perms.includes("quotations.draft_line_items") || perms.includes("quotations.submit")
  // Only a Manager/Admin (quotations.submit) can approve or return a
  // quotation that's pending their review -- matches the backend gate.
  const canReview = perms.includes("quotations.submit")

  useEffect(() => {
    if (rfq && rfq.status === "pending") {
      updateRFQStatus.mutate({ id: rfq.id, status: "viewed" })
    }
  }, [rfq?.id, rfq?.status])

  const form = useForm<QuotationForm>({
    resolver: zodResolver(quotationSchema) as unknown as Resolver<QuotationForm>,
    defaultValues: { notes: "", line_items: [] },
  })
  const { fields, append, remove } = useFieldArray({ control: form.control, name: "line_items" })

  useEffect(() => {
    if (!showQuotationDialog) return
    // An existing draft (created earlier via Save Draft, or sent back by the
    // Manager for changes) already has real rate/tax/remarks values --
    // previously this always rebuilt from the engagement's line items with
    // unit_price/tax_rate hardcoded to 0, silently discarding whatever the
    // vendor had already entered every time "Edit Quotation" was reopened.
    const seed = quotation?.line_items && quotation.line_items.length > 0
      ? quotation.line_items.map((li) => ({
          description: li.description,
          quantity:    li.quantity,
          unit_price:  li.unit_price,
          tax_rate:    li.tax_rate,
          remarks:     li.remarks ?? "",
        }))
      : (rfq?.engagement?.line_items ?? []).map((li) => ({
          description: li.description,
          quantity:    li.quantity,
          unit_price:  0,
          tax_rate:    0,
          remarks:     "",
        }))
    form.reset({
      notes:      quotation?.notes ?? "",
      line_items: seed,
    })
  }, [showQuotationDialog])

  const watchedItems = form.watch("line_items")
  const grandTotal = watchedItems.reduce((sum, item) => {
    const qty   = Number(item.quantity)   || 0
    const price = Number(item.unit_price) || 0
    const tax   = Number(item.tax_rate)   || 0
    return sum + qty * price * (1 + tax / 100)
  }, 0)

  const quotationTotal = (quotation?.line_items ?? []).reduce((sum, li) => sum + (li.total ?? 0), 0)

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

  async function onSubmitForReview() {
    if (!quotation) return
    await submitForReview.mutateAsync({ id: quotation.id, total_amount: quotationTotal })
  }

  async function onApprove() {
    if (!quotation || !rfq) return
    await approveQuotation.mutateAsync({ id: quotation.id })
    await updateRFQStatus.mutateAsync({ id: rfq.id, status: "responded" })
  }

  async function onReturnToAssociate() {
    if (!quotation || !returnNotes.trim()) return
    await returnToAssociate.mutateAsync({ id: quotation.id, notes: returnNotes.trim() })
    setShowReturnDialog(false)
    setReturnNotes("")
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

  const canProvideQuotation = (!quotation || quotation.status === "draft") && canDraftOrSubmit
  const canSendForReview    = !!quotation && quotation.status === "draft" && canDraftOrSubmit
  const canActOnReview      = !!quotation && quotation.status === "pending_manager_review" && canReview

  return (
    <AnimatedPage>
      <div className="p-6 space-y-6">
        <div>
          <Link to="/vendor/rfqs" className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground mb-3">
            <SolarDuotoneIcon icon={ArrowLeft01Icon} size={13} strokeWidth={1.5} />
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
                  {quotation ? "Edit Quotation" : "Provide Quotation"}
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
                    <span className="col-span-3 text-right tabular-nums">
                      {li.unit_price != null ? formatCurrency(li.unit_price, rfq.engagement?.currency ?? "INR") : "—"}
                    </span>
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
              {quotation.status === "draft" && quotation.manager_review_notes && (
                <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  <span className="font-semibold">Manager requested changes:</span> {quotation.manager_review_notes}
                </div>
              )}
              {quotation.notes && <p className="text-sm">{quotation.notes}</p>}
              {quotation.total_amount != null && (
                <p className="text-sm font-semibold">Total: {formatCurrency(quotation.total_amount, rfq.engagement?.currency ?? "INR")}</p>
              )}
              {quotation.line_items && quotation.line_items.length > 0 && (
                <div className="space-y-1 pt-1">
                  {quotation.line_items.map((li) => (
                    <div key={li.id} className="flex justify-between text-xs text-muted-foreground border-b pb-1">
                      <span>
                        {li.description} × {li.quantity} @ {formatCurrency(li.unit_price, rfq.engagement?.currency ?? "INR")}
                        {li.tax_rate ? ` + ${li.tax_rate}% tax` : ""}
                      </span>
                      <span className="tabular-nums">{formatCurrency(li.total, rfq.engagement?.currency ?? "INR")}</span>
                    </div>
                  ))}
                </div>
              )}

              {canSendForReview && (
                <div className="flex justify-end pt-2">
                  <Button
                    size="sm"
                    disabled={submitForReview.isPending}
                    onClick={onSubmitForReview}
                  >
                    {submitForReview.isPending ? "Sending…" : "Submit for Review"}
                  </Button>
                </div>
              )}

              {canActOnReview && (
                <div className="flex justify-end gap-2 pt-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={returnToAssociate.isPending}
                    onClick={() => setShowReturnDialog(true)}
                  >
                    Return to Associate
                  </Button>
                  <Button
                    size="sm"
                    disabled={approveQuotation.isPending}
                    onClick={onApprove}
                  >
                    {approveQuotation.isPending ? "Approving…" : "Approve & Submit to Organisation"}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      <Dialog open={showQuotationDialog} onOpenChange={(o) => { if (!o) form.reset(); setShowQuotationDialog(o) }}>
        <DialogContent size="4xl">
          <DialogHeader><DialogTitle>Provide Quotation</DialogTitle></DialogHeader>
          <DialogBody>
            <form id="quotation-form" className="space-y-4 pt-2">
              <div className="space-y-1.5">
                <Label>Notes</Label>
                <Textarea {...form.register("notes")} placeholder="Terms, delivery timelines, assumptions…" rows={2} />
              </div>
              <Separator />
              <div className="space-y-3">
                {(rfq?.engagement?.line_items ?? []).length > 0 && (
                  <p className="text-xs text-muted-foreground">Pre-filled from engagement scope — add pricing to each item.</p>
                )}
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-semibold">Line Items</Label>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs gap-1"
                    onClick={() => append({ description: "", quantity: 1, unit_price: 0, tax_rate: 0, remarks: "" })}
                  >
                    <SolarDuotoneIcon icon={Add01Icon} size={12} strokeWidth={2} primaryColor="currentColor" secondaryColor="currentColor" />
                    Add Row
                  </Button>
                </div>
                <div className="space-y-2">
                  <div className="grid grid-cols-[repeat(24,minmax(0,1fr))] gap-2 text-xs text-muted-foreground font-medium px-1">
                    <span className="col-span-6">Description</span>
                    <span className="col-span-3">Qty</span>
                    <span className="col-span-3">Rate</span>
                    <span className="col-span-3">Tax %</span>
                    <span className="col-span-3">Unit</span>
                    <span className="col-span-4">Remarks</span>
                    <span className="col-span-2" />
                  </div>
                  {fields.map((field, i) => (
                    <div key={field.id} className="grid grid-cols-[repeat(24,minmax(0,1fr))] gap-2 items-start">
                      <div className="col-span-6">
                        <Input {...form.register(`line_items.${i}.description`)} placeholder="Item" className="h-8 text-xs" />
                      </div>
                      <div className="col-span-3">
                        <Input type="number" min={0.01} step="any" {...form.register(`line_items.${i}.quantity`)} placeholder="1" className="h-8 text-xs" />
                      </div>
                      <div className="col-span-3">
                        <Input
                          type="number" min={0} step="any"
                          {...form.register(`line_items.${i}.unit_price`, {
                            onChange: () => form.trigger(`line_items.${i}.remarks`),
                          })}
                          placeholder="0" className="h-8 text-xs"
                        />
                      </div>
                      <div className="col-span-3">
                        <Input type="number" min={0} max={100} step="any" {...form.register(`line_items.${i}.tax_rate`)} placeholder="0" className="h-8 text-xs" />
                      </div>
                      <div className="col-span-3 flex items-center h-8">
                        {/* Read-only -- unit is set by the organisation on the engagement's line item, not editable by the vendor. */}
                        <span className="text-xs text-muted-foreground truncate">
                          {rfq?.engagement?.line_items?.[i]?.unit ?? "—"}
                        </span>
                      </div>
                      <div className="col-span-4">
                        <Input {...form.register(`line_items.${i}.remarks`)} placeholder="Optional" className={`h-8 text-xs ${form.formState.errors.line_items?.[i]?.remarks ? "border-destructive" : ""}`} />
                        {form.formState.errors.line_items?.[i]?.remarks && (
                          <p className="text-[10px] text-destructive mt-0.5">{form.formState.errors.line_items[i]!.remarks!.message}</p>
                        )}
                      </div>
                      <div className="col-span-2 flex justify-center pt-1">
                        <button type="button" onClick={() => remove(i)} className="text-muted-foreground hover:text-destructive">
                          <SolarDuotoneIcon icon={Delete01Icon} size={14} strokeWidth={1.5} />
                        </button>
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
              disabled={createQuotation.isPending}
              onClick={form.handleSubmit(onSaveDraft)}
            >
              {createQuotation.isPending ? "Saving…" : "Save Draft"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showReturnDialog} onOpenChange={(o) => { if (!o) setReturnNotes(""); setShowReturnDialog(o) }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Return to Associate</DialogTitle></DialogHeader>
          <DialogBody>
            <div className="space-y-1.5">
              <Label>Remarks <span className="text-destructive">*</span></Label>
              <Textarea
                value={returnNotes}
                onChange={(e) => setReturnNotes(e.target.value)}
                placeholder="Explain what needs to change before this can be re-submitted…"
                rows={4}
              />
            </div>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setShowReturnDialog(false)}>Cancel</Button>
            <Button
              type="button"
              disabled={!returnNotes.trim() || returnToAssociate.isPending}
              onClick={onReturnToAssociate}
            >
              {returnToAssociate.isPending ? "Sending…" : "Send Back"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AnimatedPage>
  )
}
