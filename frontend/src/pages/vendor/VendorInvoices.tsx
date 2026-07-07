import { useState, useEffect } from "react"
import { useForm } from "react-hook-form"
import type { Resolver } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { useQuery } from "@tanstack/react-query"
import { useInvoices, useSubmitInvoice } from "@/hooks/useInvoices"
import { useUploadAttachments } from "@/hooks/useAttachments"
import { FileUploadZone } from "@/components/shared/FileUploadZone"
import { AttachmentList } from "@/components/shared/AttachmentList"
import { useVendor } from "@/hooks/useVendor"
import { useContracts } from "@/hooks/useContracts"
import { supabase } from "@/lib/supabase"
import { AnimatedPage } from "@/components/shared/AnimatedPage"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import {
  INVOICE_STATUS_LABELS, INVOICE_STATUS_COLORS,
  CURRENCIES,
} from "@/lib/constants"
import { formatCurrency } from "@/lib/utils"
import type { InvoiceStatus } from "@/lib/types"
import { format } from "date-fns"
import { Add01Icon, File01Icon } from "@/components/shared/SolarIcon"
import { SolarDuotoneIcon } from "@/components/shared/SolarIcon"
import { toast } from "sonner"

// Either contract_id OR engagement_id is required; both are optional individually.
const submitSchema = z
  .object({
    contract_id:           z.string().optional(),
    engagement_id:         z.string().optional(),
    vendor_invoice_number: z.string().min(1, "Invoice number is required"),
    total_amount:          z.coerce.number().positive("Must be greater than 0"),
    currency:              z.string().default("INR"),
    invoice_date:          z.string().min(1, "Invoice date is required"),
    due_date:              z.string().optional(),
    notes:                 z.string().optional(),
  })
  .refine(
    (d) => !!(d.contract_id || d.engagement_id),
    { message: "Select a Contract or an Engagement", path: ["contract_id"] }
  )

type SubmitForm = z.infer<typeof submitSchema>

export function VendorInvoices() {
  const [submitting,    setSubmitting]    = useState(false)
  const [stagedFiles,   setStagedFiles]   = useState<File[]>([])
  const [docsInvoiceId, setDocsInvoiceId] = useState<string | null>(null)

  const { data: vendor }                           = useVendor()
  const { data: invoices = [], isLoading }         = useInvoices({ vendor_id: vendor?.id })
  const { data: contracts = [], isLoading: contractsLoading } = useContracts(
    vendor?.id ? { vendor_id: vendor.id, status: "active" } : undefined
  )
  const submitInvoice     = useSubmitInvoice()
  const uploadAttachments = useUploadAttachments()

  // Fetch vendor's engagements (those they've been invited to via RFQs)
  const { data: vendorEngagements = [], isLoading: engagementsLoading } = useQuery({
    queryKey: ["vendor-engagements-for-invoice", vendor?.id],
    enabled: !!vendor?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("engagement_vendors")
        .select("engagement:engagement_id ( id, title, status )")
        .eq("vendor_id", vendor!.id)
      if (error) throw error
      const seen = new Set<string>()
      return (data ?? [])
        .map((r) => r.engagement as unknown as { id: string; title: string; status: string } | null)
        .filter((e): e is { id: string; title: string; status: string } => {
          if (!e || seen.has(e.id)) return false
          seen.add(e.id)
          return true
        })
    },
  })

  const form = useForm<SubmitForm>({
    resolver: zodResolver(submitSchema) as unknown as Resolver<SubmitForm>,
    defaultValues: { currency: "INR", invoice_date: new Date().toISOString().slice(0, 10) },
  })

  const watchedContractId   = form.watch("contract_id")
  const watchedEngagementId = form.watch("engagement_id")

  const { data: linkedPO } = useQuery({
    queryKey: ["linked-po-for-invoice", watchedEngagementId, vendor?.id],
    enabled: !!watchedEngagementId && !!vendor?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from("purchase_orders")
        .select("id, po_number")
        .eq("engagement_id", watchedEngagementId!)
        .eq("vendor_id", vendor!.id)
        .limit(1)
        .maybeSingle()
      return data
    },
  })

  useEffect(() => {
    if (submitting) {
      form.reset({
        contract_id:           "",
        engagement_id:         "",
        vendor_invoice_number: "",
        total_amount:          undefined,
        currency:              "INR",
        invoice_date:          new Date().toISOString().slice(0, 10),
        due_date:              "",
        notes:                 "",
      })
      setStagedFiles([])
    }
  }, [submitting])

  function closeDialog() {
    setSubmitting(false)
    setStagedFiles([])
    form.reset({ currency: "INR", invoice_date: new Date().toISOString().slice(0, 10) })
  }

  async function onSubmit(data: SubmitForm) {
    if (!vendor) return
    let invoiceId: string
    try {
      const invoice = await submitInvoice.mutateAsync({
        contract_id:           data.contract_id || undefined,
        engagement_id:         data.engagement_id || undefined,
        vendor_invoice_number: data.vendor_invoice_number,
        vendor_id:             vendor.id,
        total_amount:          data.total_amount,
        currency:              data.currency,
        invoice_date:          data.invoice_date,
        due_date:              data.due_date || undefined,
        notes:                 data.notes || undefined,
      })
      invoiceId = invoice.id
    } catch (e: unknown) {
      toast.error((e as Error).message ?? "Failed to submit invoice. Please try again.")
      return
    }
    if (stagedFiles.length > 0) {
      try {
        await uploadAttachments.mutateAsync({ entityType: "invoice", entityId: invoiceId, files: stagedFiles })
      } catch { /* hook toasts its own error */ }
    }
    closeDialog()
  }

  return (
    <AnimatedPage>
      <div className="flex-1 flex flex-col min-h-0 p-6 gap-6">
        {/* Header */}
        <div className="shrink-0 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold tracking-tight">Invoices</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Submit and track invoices for your contracts or engagements.
            </p>
          </div>
          <Button size="sm" className="h-8 gap-1.5 text-xs" onClick={() => setSubmitting(true)}>
            <SolarDuotoneIcon icon={Add01Icon} size={14} strokeWidth={2} primaryColor="currentColor" secondaryColor="currentColor" />
            Submit Invoice
          </Button>
        </div>

        {/* Table */}
        <div className="flex-1 min-h-0 overflow-auto rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Ref</TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Your Invoice #</TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Linked To</TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">PO</TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Amount</TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Status</TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Date</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-12">
                    <div className="flex flex-col items-center gap-2">
                      <div className="h-5 w-5 border-2 border-muted-foreground/30 border-t-muted-foreground rounded-full animate-spin" />
                      <span className="text-sm text-muted-foreground">Loading…</span>
                    </div>
                  </TableCell>
                </TableRow>
              ) : invoices.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-12">
                    <p className="text-sm font-medium text-muted-foreground">No invoices submitted yet</p>
                    <p className="text-xs text-muted-foreground/70 mt-1">
                      Click "Submit Invoice" to upload your first invoice.
                    </p>
                  </TableCell>
                </TableRow>
              ) : (
                invoices.map((inv, idx) => (
                  <TableRow key={inv.id} className={`transition-colors hover:bg-accent/50 ${idx % 2 !== 0 ? "bg-muted/20" : ""}`}>
                    <TableCell>
                      <span className="font-mono text-xs bg-muted border border-border/70 rounded px-1.5 py-0.5">
                        {inv.invoice_ref ?? "—"}
                      </span>
                    </TableCell>
                    <TableCell><p className="text-sm">{inv.vendor_invoice_number}</p></TableCell>
                    <TableCell>
                      {inv.contract?.contract_ref ? (
                        <span className="text-xs text-muted-foreground font-mono">{inv.contract.contract_ref}</span>
                      ) : inv.engagement?.title ? (
                        <span className="text-xs text-muted-foreground">{inv.engagement.title}</span>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <span className="text-xs text-muted-foreground font-mono">{inv.purchase_order?.po_number ?? "—"}</span>
                    </TableCell>
                    <TableCell>
                      <p className="text-sm font-medium tabular-nums">{formatCurrency(inv.total_amount, inv.currency)}</p>
                    </TableCell>
                    <TableCell>
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium border ${INVOICE_STATUS_COLORS[inv.status as InvoiceStatus]}`}>
                        {INVOICE_STATUS_LABELS[inv.status as InvoiceStatus]}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {format(new Date(inv.invoice_date), "dd MMM yyyy")}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 gap-1.5 text-muted-foreground"
                        onClick={() => setDocsInvoiceId(inv.id)}
                      >
                        <SolarDuotoneIcon icon={File01Icon} size={13} strokeWidth={1.5} />
                        <span className="text-xs">Document</span>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Invoice attachments dialog */}
      <Dialog open={!!docsInvoiceId} onOpenChange={(o) => !o && setDocsInvoiceId(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Invoice Attachments</DialogTitle></DialogHeader>
          {docsInvoiceId && (
            <AttachmentList
              entityType="invoice"
              entityId={docsInvoiceId}
              canDelete={false}
              canUpload={false}
              className="pt-2"
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Submit invoice dialog */}
      <Dialog open={submitting} onOpenChange={(open) => { if (!open) closeDialog() }}>
        <DialogContent size="lg">
          <DialogHeader><DialogTitle>Submit Invoice</DialogTitle></DialogHeader>
          <DialogBody>
          <form id="submit-invoice-form" onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-2">

            {/* ── Contract OR Engagement ── */}
            <div className="rounded-lg border divide-y">
              {/* Contract option */}
              <div className="p-3 space-y-1.5">
                <Label className="text-sm font-medium">Related Contract</Label>
                <p className="text-xs text-muted-foreground">Select if this invoice is against an active contract.</p>
                <Select
                  value={form.watch("contract_id") ?? ""}
                  onValueChange={(v) => {
                    form.setValue("contract_id", v === "__clear__" ? "" : v, { shouldValidate: true })
                    if (v && v !== "__clear__") form.setValue("engagement_id", "", { shouldValidate: false })
                  }}
                  disabled={contractsLoading || !!watchedEngagementId}
                >
                  <SelectTrigger className={watchedEngagementId ? "opacity-50" : ""}>
                    <SelectValue placeholder={contractsLoading ? "Loading contracts…" : "Select a contract"} />
                  </SelectTrigger>
                  <SelectContent>
                    {watchedContractId && (
                      <SelectItem value="__clear__">— Clear selection —</SelectItem>
                    )}
                    {contracts.length === 0 && !contractsLoading ? (
                      <SelectItem value="__none__" disabled>No active contracts found</SelectItem>
                    ) : (
                      contracts.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.contract_ref ? `${c.contract_ref} — ` : ""}{c.title}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>

              {/* Divider with OR label */}
              <div className="relative flex items-center justify-center py-1 bg-muted/30">
                <span className="px-3 text-xs font-semibold text-muted-foreground bg-muted/30">OR</span>
              </div>

              {/* Engagement option */}
              <div className="p-3 space-y-1.5">
                <Label className="text-sm font-medium">Related Engagement</Label>
                <p className="text-xs text-muted-foreground">Select if this invoice is against a specific engagement.</p>
                <Select
                  value={form.watch("engagement_id") ?? ""}
                  onValueChange={(v) => {
                    form.setValue("engagement_id", v === "__clear__" ? "" : v, { shouldValidate: true })
                    if (v && v !== "__clear__") form.setValue("contract_id", "", { shouldValidate: false })
                  }}
                  disabled={engagementsLoading || !!watchedContractId}
                >
                  <SelectTrigger className={watchedContractId ? "opacity-50" : ""}>
                    <SelectValue placeholder={engagementsLoading ? "Loading engagements…" : "Select an engagement"} />
                  </SelectTrigger>
                  <SelectContent>
                    {watchedEngagementId && (
                      <SelectItem value="__clear__">— Clear selection —</SelectItem>
                    )}
                    {vendorEngagements.length === 0 && !engagementsLoading ? (
                      <SelectItem value="__none__" disabled>No engagements found</SelectItem>
                    ) : (
                      vendorEngagements.map((e) => (
                        <SelectItem key={e.id} value={e.id}>{e.title}</SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
                {watchedEngagementId && linkedPO && (
                  <p className="text-xs text-muted-foreground mt-1">Auto-linked PO: {linkedPO.po_number}</p>
                )}
              </div>
            </div>

            {/* Validation error for the OR rule */}
            {form.formState.errors.contract_id && !watchedContractId && !watchedEngagementId && (
              <p className="text-xs text-destructive">{form.formState.errors.contract_id.message}</p>
            )}

            <div className="space-y-1.5">
              <Label>Your Invoice Number <span className="text-destructive">*</span></Label>
              <Input {...form.register("vendor_invoice_number")} placeholder="INV-2026-001" />
              {form.formState.errors.vendor_invoice_number && (
                <p className="text-xs text-destructive">{form.formState.errors.vendor_invoice_number.message}</p>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Total Amount <span className="text-destructive">*</span></Label>
                <Input type="number" min={0} step="any" {...form.register("total_amount")} placeholder="50000" />
                {form.formState.errors.total_amount && (
                  <p className="text-xs text-destructive">{form.formState.errors.total_amount.message}</p>
                )}
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
                <Label>Invoice Date <span className="text-destructive">*</span></Label>
                <Input type="date" {...form.register("invoice_date")} />
                {form.formState.errors.invoice_date && (
                  <p className="text-xs text-destructive">{form.formState.errors.invoice_date.message}</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label>Due Date</Label>
                <Input type="date" {...form.register("due_date")} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Textarea {...form.register("notes")} placeholder="Additional details…" rows={2} />
            </div>

            {/* Attachments */}
            <div className="space-y-2 pt-1">
              <div>
                <p className="text-sm font-semibold">Attachments</p>
                <p className="text-xs text-muted-foreground">Attach invoice PDF or supporting docs (uploaded after submission).</p>
              </div>
              <FileUploadZone
                files={stagedFiles}
                onChange={setStagedFiles}
                disabled={submitInvoice.isPending || uploadAttachments.isPending}
              />
            </div>

          </form>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={closeDialog}>Cancel</Button>
            <Button
              type="submit"
              form="submit-invoice-form"
              disabled={submitInvoice.isPending || uploadAttachments.isPending}
            >
              {submitInvoice.isPending
                ? "Submitting…"
                : uploadAttachments.isPending
                ? "Uploading…"
                : "Submit Invoice"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AnimatedPage>
  )
}
