import { useState } from "react"
import { Link, useSearchParams } from "react-router-dom"
import { useForm, useFieldArray } from "react-hook-form"
import type { Resolver } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { usePurchaseOrders, useCreatePurchaseOrder } from "@/hooks/usePurchaseOrders"
import { useEngagements } from "@/hooks/useEngagements"
import { useVendors } from "@/hooks/useVendors"
import { usePermissions } from "@/hooks/usePermissions"
import { AnimatedPage } from "@/components/shared/AnimatedPage"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Separator } from "@/components/ui/separator"
import { PO_STATUS_LABELS, PO_STATUS_COLORS, CURRENCIES } from "@/lib/constants"
import { formatCurrency } from "@/lib/utils"
import type { POStatus } from "@/lib/types"
import { format } from "date-fns"
import { Cancel01Icon, Add01Icon, EyeIcon, Delete01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { FileUploadZone } from "@/components/shared/FileUploadZone"
import { useUploadAttachments } from "@/hooks/useAttachments"

const STATUSES: POStatus[] = ["draft", "issued", "partially_received", "fully_received", "cancelled", "closed"]

const lineItemSchema = z.object({
  description: z.string().min(1, "Required"),
  quantity:    z.coerce.number().positive("Must be > 0"),
  unit_price:  z.coerce.number().min(0, "Must be ≥ 0"),
  unit:        z.string().optional(),
})

const createSchema = z.object({
  engagement_id:          z.string().optional(),
  vendor_id:              z.string().uuid("Select a vendor"),
  total_value:            z.coerce.number().positive("Must be > 0"),
  currency:               z.string().default("INR"),
  expected_delivery_date: z.string().optional(),
  delivery_address:       z.string().optional(),
  payment_terms:          z.string().optional(),
  notes:                  z.string().optional(),
  line_items:             z.array(lineItemSchema).min(1, "Add at least one line item"),
})
type CreateForm = z.infer<typeof createSchema>

function StatusChip({ status }: { status: POStatus }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium border ${PO_STATUS_COLORS[status]}`}>
      {PO_STATUS_LABELS[status]}
    </span>
  )
}

export function PurchaseOrderList() {
  const [searchParams]        = useSearchParams()
  const [status, setStatus]   = useState<POStatus | "">("")
  const [creating,    setCreating]    = useState(false)
  const [stagedFiles, setStagedFiles] = useState<File[]>([])

  const { canCreatePO } = usePermissions()
  const defaultEngagementId = searchParams.get("engagement_id") ?? undefined
  const { data: pos = [], isLoading } = usePurchaseOrders({ status: status || undefined })
  const { data: engagements = [] }    = useEngagements({ status: "approved" })
  const { data: vendors = [] }        = useVendors({ status: "active" })
  const createPO          = useCreatePurchaseOrder()
  const uploadAttachments = useUploadAttachments()

  const form = useForm<CreateForm>({
    resolver: zodResolver(createSchema) as unknown as Resolver<CreateForm>,
    defaultValues: {
      engagement_id: defaultEngagementId,
      currency: "INR",
      line_items: [{ description: "", quantity: 1, unit_price: 0, unit: "" }],
    },
  })

  const { fields, append, remove } = useFieldArray({ control: form.control, name: "line_items" })

  // Auto-fill vendor from engagement
  function handleEngagementChange(engId: string) {
    form.setValue("engagement_id", engId)
    const eng = engagements.find((e) => e.id === engId)
    if (eng?.vendor_id) form.setValue("vendor_id", eng.vendor_id)
  }

  function closeDialog() {
    setCreating(false)
    setStagedFiles([])
    form.reset()
  }

  async function onSubmit(data: CreateForm) {
    let poId: string
    try {
      const po = await createPO.mutateAsync({
        engagement_id:          data.engagement_id || undefined,
        vendor_id:              data.vendor_id,
        total_value:            data.total_value,
        currency:               data.currency,
        expected_delivery_date: data.expected_delivery_date || undefined,
        delivery_address:       data.delivery_address || undefined,
        payment_terms:          data.payment_terms || undefined,
        notes:                  data.notes || undefined,
        line_items:             data.line_items.map((item) => ({ ...item, unit: item.unit ?? null })),
      })
      poId = po.id
    } catch {
      return
    }
    if (stagedFiles.length > 0) {
      try {
        await uploadAttachments.mutateAsync({ entityType: "purchase_order", entityId: poId, files: stagedFiles })
      } catch { /* hook toasts its own error */ }
    }
    closeDialog()
  }

  return (
    <AnimatedPage>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold tracking-tight">Purchase Orders</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {isLoading ? "Loading…" : `${pos.length} PO${pos.length !== 1 ? "s" : ""}`}
            </p>
          </div>
          {canCreatePO && (
            <Button size="sm" className="h-8 gap-1.5 text-xs" onClick={() => setCreating(true)}>
              <HugeiconsIcon icon={Add01Icon} size={14} strokeWidth={2} primaryColor="currentColor" secondaryColor="currentColor" />
              New PO
            </Button>
          )}
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3 p-4 rounded-xl border bg-card">
          <Select value={status || "all"} onValueChange={(v) => setStatus(v === "all" ? "" : v as POStatus)}>
            <SelectTrigger className="w-52 h-9 text-sm"><SelectValue placeholder="All statuses" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {STATUSES.map((s) => <SelectItem key={s} value={s}>{PO_STATUS_LABELS[s]}</SelectItem>)}
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
                <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">PO Number</TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Vendor</TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Engagement</TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Value</TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Status</TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Issued</TableHead>
                <TableHead className="w-16" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-12">
                    <div className="flex flex-col items-center gap-2">
                      <div className="h-5 w-5 border-2 border-muted-foreground/30 border-t-muted-foreground rounded-full animate-spin" />
                      <span className="text-sm text-muted-foreground">Loading…</span>
                    </div>
                  </TableCell>
                </TableRow>
              ) : pos.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-12">
                    <p className="text-sm font-medium text-muted-foreground">No purchase orders found</p>
                  </TableCell>
                </TableRow>
              ) : (
                pos.map((po, idx) => (
                  <TableRow key={po.id} className={`transition-colors hover:bg-accent/50 ${idx % 2 !== 0 ? "bg-muted/20" : ""}`}>
                    <TableCell>
                      <span className="font-mono text-xs bg-muted border border-border/70 rounded px-1.5 py-0.5">
                        {po.po_number ?? "—"}
                      </span>
                    </TableCell>
                    <TableCell><p className="text-sm">{po.vendor?.company_name ?? "—"}</p></TableCell>
                    <TableCell>
                      <p className="text-sm text-muted-foreground">{po.engagement?.title ?? "—"}</p>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm tabular-nums">{formatCurrency(po.total_value, po.currency)}</span>
                    </TableCell>
                    <TableCell><StatusChip status={po.status as POStatus} /></TableCell>
                    <TableCell>
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {po.issue_date ? format(new Date(po.issue_date), "dd MMM yyyy") : "—"}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Button asChild size="sm" variant="ghost" className="h-8 px-2 gap-1.5 text-xs">
                        <Link to={`/admin/purchase-orders/${po.id}`}>
                          <HugeiconsIcon icon={EyeIcon} size={14} strokeWidth={1.5} />
                          View
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Create PO dialog */}
      <Dialog open={creating} onOpenChange={(open) => { if (!open) closeDialog() }}>
        <DialogContent size="2xl">
          <DialogHeader><DialogTitle>New Purchase Order</DialogTitle></DialogHeader>
          <DialogBody>
          <form id="create-po" onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 pt-2">
            {/* Header fields */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Engagement (optional)</Label>
                <Select
                  defaultValue={defaultEngagementId}
                  onValueChange={handleEngagementChange}
                >
                  <SelectTrigger><SelectValue placeholder="Select engagement" /></SelectTrigger>
                  <SelectContent>
                    {engagements.map((e) => <SelectItem key={e.id} value={e.id}>{e.title}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Vendor <span className="text-destructive">*</span></Label>
                <Select onValueChange={(v) => form.setValue("vendor_id", v)}>
                  <SelectTrigger><SelectValue placeholder="Select vendor" /></SelectTrigger>
                  <SelectContent>
                    {vendors.map((v) => <SelectItem key={v.id} value={v.id}>{v.company_name}</SelectItem>)}
                  </SelectContent>
                </Select>
                {form.formState.errors.vendor_id && <p className="text-xs text-destructive">{form.formState.errors.vendor_id.message}</p>}
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2 space-y-1.5">
                <Label>Total Value <span className="text-destructive">*</span></Label>
                <Input type="number" min={0} {...form.register("total_value")} placeholder="100000" />
                {form.formState.errors.total_value && <p className="text-xs text-destructive">{form.formState.errors.total_value.message}</p>}
              </div>
              <div className="space-y-1.5">
                <Label>Currency</Label>
                <Select defaultValue="INR" onValueChange={(v) => form.setValue("currency", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{CURRENCIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Expected Delivery</Label>
                <Input type="date" {...form.register("expected_delivery_date")} />
              </div>
              <div className="space-y-1.5">
                <Label>Payment Terms</Label>
                <Input {...form.register("payment_terms")} placeholder="Net 30, Net 60…" />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Delivery Address</Label>
              <Textarea {...form.register("delivery_address")} placeholder="Delivery address…" rows={2} />
            </div>

            <Separator />

            {/* Line items */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-semibold">Line Items <span className="text-destructive">*</span></Label>
                <Button type="button" size="sm" variant="outline" className="h-7 text-xs gap-1"
                  onClick={() => append({ description: "", quantity: 1, unit_price: 0, unit: "" })}>
                  <HugeiconsIcon icon={Add01Icon} size={12} strokeWidth={2} primaryColor="currentColor" secondaryColor="currentColor" />
                  Add Row
                </Button>
              </div>
              {form.formState.errors.line_items?.root && (
                <p className="text-xs text-destructive">{form.formState.errors.line_items.root.message}</p>
              )}
              <div className="space-y-2">
                {fields.map((field, i) => (
                  <div key={field.id} className="grid grid-cols-12 gap-2 items-start">
                    <div className="col-span-5">
                      <Input {...form.register(`line_items.${i}.description`)} placeholder="Description" className="h-8 text-xs" />
                    </div>
                    <div className="col-span-2">
                      <Input type="number" min={0.01} step="any" {...form.register(`line_items.${i}.quantity`)} placeholder="Qty" className="h-8 text-xs" />
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
                <div className="grid grid-cols-12 gap-2 text-[10px] text-muted-foreground pl-0.5">
                  <div className="col-span-5">Description</div>
                  <div className="col-span-2">Qty</div>
                  <div className="col-span-2">Unit Rate</div>
                  <div className="col-span-2">Unit</div>
                </div>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Textarea {...form.register("notes")} placeholder="Additional notes…" rows={2} />
            </div>

            {/* Attachments */}
            <Separator />
            <div className="space-y-2">
              <div>
                <p className="text-sm font-semibold">Attachments</p>
                <p className="text-xs text-muted-foreground">Optional PO documents (uploaded after creation).</p>
              </div>
              <FileUploadZone
                files={stagedFiles}
                onChange={setStagedFiles}
                disabled={createPO.isPending || uploadAttachments.isPending}
              />
            </div>

          </form>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={closeDialog}>Cancel</Button>
            <Button
              type="submit"
              form="create-po"
              disabled={createPO.isPending || uploadAttachments.isPending}
            >
              {createPO.isPending
                ? "Creating…"
                : uploadAttachments.isPending
                ? "Uploading…"
                : "Create PO"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AnimatedPage>
  )
}
