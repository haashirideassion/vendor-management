import { useState } from "react"
import { Link, useSearchParams } from "react-router-dom"
import { useForm, useFieldArray } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { useGRNs, useCreateGRN, useUpdateGRNStatus } from "@/hooks/useGRNs"
import { usePurchaseOrders } from "@/hooks/usePurchaseOrders"
import { usePermissions } from "@/hooks/usePermissions"
import { AnimatedPage } from "@/components/shared/AnimatedPage"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Separator } from "@/components/ui/separator"
import { GRN_STATUS_LABELS, GRN_STATUS_COLORS } from "@/lib/constants"
import type { GRNStatus } from "@/lib/types"
import { format } from "date-fns"
import { Add01Icon, Cancel01Icon, Delete01Icon, CheckmarkCircle01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

const STATUSES: GRNStatus[] = ["draft", "submitted", "verified", "rejected"]

const lineItemSchema = z.object({
  po_line_item_id:   z.string().optional(),
  description:       z.string().min(1, "Required"),
  quantity_received: z.coerce.number().positive("Must be > 0"),
  unit_price:        z.coerce.number().min(0),
  unit:              z.string().optional(),
})

const createSchema = z.object({
  po_id:         z.string().uuid("Select a PO"),
  vendor_id:     z.string().uuid("Vendor required"),
  received_date: z.string().min(1, "Required"),
  notes:         z.string().optional(),
  line_items:    z.array(lineItemSchema).min(1, "Add at least one line item"),
})
type CreateForm = z.infer<typeof createSchema>

function StatusChip({ status }: { status: GRNStatus }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium border ${GRN_STATUS_COLORS[status]}`}>
      {GRN_STATUS_LABELS[status]}
    </span>
  )
}

export function GRNList() {
  const [searchParams]        = useSearchParams()
  const [status, setStatus]   = useState<GRNStatus | "">("")
  const [creating, setCreating] = useState(false)

  const defaultPOId = searchParams.get("po_id") ?? undefined
  const { canRecordGRN } = usePermissions()
  const { data: grns = [], isLoading } = useGRNs({ status: status || undefined })
  const { data: pos = [] }             = usePurchaseOrders({ status: "issued" })
  const createGRN   = useCreateGRN()
  const updateStatus = useUpdateGRNStatus()

  const form = useForm<CreateForm>({
    resolver: zodResolver(createSchema),
    defaultValues: {
      po_id: defaultPOId,
      received_date: new Date().toISOString().slice(0, 10),
      line_items: [{ description: "", quantity_received: 1, unit_price: 0, unit: "" }],
    },
  })
  const { fields, append, remove } = useFieldArray({ control: form.control, name: "line_items" })

  function handlePOChange(poId: string) {
    form.setValue("po_id", poId)
    const po = pos.find((p) => p.id === poId)
    if (po?.vendor_id) form.setValue("vendor_id", po.vendor_id)
  }

  async function onSubmit(data: CreateForm) {
    await createGRN.mutateAsync({
      po_id:         data.po_id,
      vendor_id:     data.vendor_id,
      received_date: data.received_date,
      notes:         data.notes || undefined,
      line_items:    data.line_items,
    })
    setCreating(false)
    form.reset()
  }

  return (
    <AnimatedPage>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold tracking-tight">Goods Receipt Notes</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {isLoading ? "Loading…" : `${grns.length} GRN${grns.length !== 1 ? "s" : ""}`}
            </p>
          </div>
          {canRecordGRN && (
            <Button size="sm" className="h-8 gap-1.5 text-xs" onClick={() => setCreating(true)}>
              <HugeiconsIcon icon={Add01Icon} size={14} strokeWidth={2} primaryColor="currentColor" secondaryColor="currentColor" />
              Record GRN
            </Button>
          )}
        </div>

        {/* Filter */}
        <div className="flex flex-wrap items-center gap-3 p-4 rounded-xl border bg-card">
          <Select value={status || "all"} onValueChange={(v) => setStatus(v === "all" ? "" : v as GRNStatus)}>
            <SelectTrigger className="w-44 h-9 text-sm"><SelectValue placeholder="All statuses" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {STATUSES.map((s) => <SelectItem key={s} value={s}>{GRN_STATUS_LABELS[s]}</SelectItem>)}
            </SelectContent>
          </Select>
          {status && (
            <Button variant="ghost" size="sm" className="h-9 gap-1.5 text-muted-foreground" onClick={() => setStatus("")}>
              <HugeiconsIcon icon={Cancel01Icon} size={13} strokeWidth={1.5} />
              Clear
            </Button>
          )}
        </div>

        {/* Table */}
        <div className="rounded-xl border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">GRN Number</TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">PO</TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Vendor</TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Received</TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Status</TableHead>
                <TableHead className="w-28" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-12">
                    <div className="flex flex-col items-center gap-2">
                      <div className="h-5 w-5 border-2 border-muted-foreground/30 border-t-muted-foreground rounded-full animate-spin" />
                      <span className="text-sm text-muted-foreground">Loading…</span>
                    </div>
                  </TableCell>
                </TableRow>
              ) : grns.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-12">
                    <p className="text-sm font-medium text-muted-foreground">No GRNs found</p>
                  </TableCell>
                </TableRow>
              ) : (
                grns.map((grn, idx) => (
                  <TableRow key={grn.id} className={`transition-colors hover:bg-accent/50 ${idx % 2 !== 0 ? "bg-muted/20" : ""}`}>
                    <TableCell>
                      <span className="font-mono text-xs bg-muted border border-border/70 rounded px-1.5 py-0.5">
                        {grn.grn_number ?? "—"}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm text-muted-foreground">{grn.purchase_order?.po_number ?? "—"}</span>
                    </TableCell>
                    <TableCell><p className="text-sm">{grn.vendor?.company_name ?? "—"}</p></TableCell>
                    <TableCell>
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {format(new Date(grn.received_date), "dd MMM yyyy")}
                      </span>
                    </TableCell>
                    <TableCell><StatusChip status={grn.status as GRNStatus} /></TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        {grn.status === "submitted" && canRecordGRN && (
                          <>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 px-2 text-xs text-green-700 hover:text-green-800 hover:bg-green-50"
                              onClick={() => updateStatus.mutate({ id: grn.id, status: "verified" })}
                            >
                              <HugeiconsIcon icon={CheckmarkCircle01Icon} size={13} strokeWidth={1.5} />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 px-2 text-xs text-destructive hover:bg-destructive/8"
                              onClick={() => updateStatus.mutate({ id: grn.id, status: "rejected" })}
                            >
                              <HugeiconsIcon icon={Cancel01Icon} size={13} strokeWidth={1.5} />
                            </Button>
                          </>
                        )}
                        {grn.status === "draft" && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2 text-xs"
                            onClick={() => updateStatus.mutate({ id: grn.id, status: "submitted" })}
                          >
                            Submit
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Create GRN dialog */}
      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Record Goods Receipt Note</DialogTitle></DialogHeader>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 pt-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Purchase Order <span className="text-destructive">*</span></Label>
                <Select defaultValue={defaultPOId} onValueChange={handlePOChange}>
                  <SelectTrigger><SelectValue placeholder="Select issued PO" /></SelectTrigger>
                  <SelectContent>
                    {pos.map((p) => <SelectItem key={p.id} value={p.id}>{p.po_number} — {p.vendor?.company_name}</SelectItem>)}
                  </SelectContent>
                </Select>
                {form.formState.errors.po_id && <p className="text-xs text-destructive">{form.formState.errors.po_id.message}</p>}
              </div>
              <div className="space-y-1.5">
                <Label>Received Date <span className="text-destructive">*</span></Label>
                <Input type="date" {...form.register("received_date")} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Textarea {...form.register("notes")} placeholder="Condition of goods, discrepancies…" rows={2} />
            </div>
            <Separator />
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-semibold">Items Received <span className="text-destructive">*</span></Label>
                <Button type="button" size="sm" variant="outline" className="h-7 text-xs gap-1"
                  onClick={() => append({ description: "", quantity_received: 1, unit_price: 0, unit: "" })}>
                  <HugeiconsIcon icon={Add01Icon} size={12} strokeWidth={2} primaryColor="currentColor" secondaryColor="currentColor" />
                  Add Row
                </Button>
              </div>
              <div className="space-y-2">
                {fields.map((field, i) => (
                  <div key={field.id} className="grid grid-cols-12 gap-2 items-start">
                    <div className="col-span-5">
                      <Input {...form.register(`line_items.${i}.description`)} placeholder="Item description" className="h-8 text-xs" />
                    </div>
                    <div className="col-span-2">
                      <Input type="number" min={0.01} step="any" {...form.register(`line_items.${i}.quantity_received`)} placeholder="Qty" className="h-8 text-xs" />
                    </div>
                    <div className="col-span-2">
                      <Input type="number" min={0} step="any" {...form.register(`line_items.${i}.unit_price`)} placeholder="Rate" className="h-8 text-xs" />
                    </div>
                    <div className="col-span-2">
                      <Input {...form.register(`line_items.${i}.unit`)} placeholder="Unit" className="h-8 text-xs" />
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
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => { setCreating(false); form.reset() }}>Cancel</Button>
              <Button type="submit" disabled={createGRN.isPending}>
                {createGRN.isPending ? "Creating…" : "Record GRN"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </AnimatedPage>
  )
}
