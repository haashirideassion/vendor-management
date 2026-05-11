import { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { useInvoices, useSubmitInvoice } from "@/hooks/useInvoices"
import { useVendor } from "@/hooks/useVendor"
import { useContracts } from "@/hooks/useContracts"
import { AnimatedPage } from "@/components/shared/AnimatedPage"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import {
  INVOICE_STATUS_LABELS, INVOICE_STATUS_COLORS,
  MATCH_STATUS_LABELS, MATCH_STATUS_COLORS,
  CURRENCIES,
} from "@/lib/constants"
import { formatCurrency } from "@/lib/utils"
import type { InvoiceStatus, MatchStatus } from "@/lib/types"
import { format } from "date-fns"
import { Add01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

const submitSchema = z.object({
  contract_id:           z.string().min(1, "Select a contract"),
  vendor_invoice_number: z.string().min(1, "Invoice number is required"),
  total_amount:          z.coerce.number().positive("Must be greater than 0"),
  currency:              z.string().default("INR"),
  invoice_date:          z.string().min(1, "Invoice date is required"),
  due_date:              z.string().optional(),
  notes:                 z.string().optional(),
})
type SubmitForm = z.infer<typeof submitSchema>

export function VendorInvoices() {
  const [submitting, setSubmitting] = useState(false)

  const { data: vendor }                           = useVendor()
  const { data: invoices = [], isLoading }         = useInvoices({ vendor_id: vendor?.id })
  const { data: contracts = [], isLoading: contractsLoading } = useContracts(
    vendor?.id ? { vendor_id: vendor.id, status: "active" } : undefined
  )
  const submitInvoice = useSubmitInvoice()

  const form = useForm<SubmitForm>({
    resolver: zodResolver(submitSchema),
    defaultValues: { currency: "INR", invoice_date: new Date().toISOString().slice(0, 10) },
  })

  async function onSubmit(data: SubmitForm) {
    if (!vendor) return
    await submitInvoice.mutateAsync({
      contract_id:           data.contract_id,
      vendor_invoice_number: data.vendor_invoice_number,
      vendor_id:             vendor.id,
      total_amount:          data.total_amount,
      currency:              data.currency,
      invoice_date:          data.invoice_date,
      due_date:              data.due_date || undefined,
      notes:                 data.notes || undefined,
    })
    setSubmitting(false)
    form.reset()
  }

  return (
    <AnimatedPage>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold tracking-tight">Invoices</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Submit and track invoices for your contracts.
            </p>
          </div>
          <Button size="sm" className="h-8 gap-1.5 text-xs" onClick={() => setSubmitting(true)}>
            <HugeiconsIcon icon={Add01Icon} size={14} strokeWidth={2} primaryColor="currentColor" secondaryColor="currentColor" />
            Submit Invoice
          </Button>
        </div>

        {/* Table */}
        <div className="rounded-xl border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Ref</TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Your Invoice #</TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Contract</TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">PO</TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Amount</TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Match</TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Status</TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Date</TableHead>
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
                      <span className="text-xs text-muted-foreground font-mono">
                        {inv.contract?.contract_ref ?? "—"}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="text-xs text-muted-foreground font-mono">{inv.purchase_order?.po_number ?? "—"}</span>
                    </TableCell>
                    <TableCell>
                      <p className="text-sm font-medium tabular-nums">{formatCurrency(inv.total_amount, inv.currency)}</p>
                    </TableCell>
                    <TableCell>
                      {inv.match_status ? (
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium border ${MATCH_STATUS_COLORS[inv.match_status as MatchStatus]}`}>
                          {MATCH_STATUS_LABELS[inv.match_status as MatchStatus]}
                        </span>
                      ) : <span className="text-xs text-muted-foreground">—</span>}
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
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Submit invoice dialog */}
      <Dialog open={submitting} onOpenChange={setSubmitting}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Submit Invoice</DialogTitle></DialogHeader>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 pt-2">

            {/* Related Contract — required */}
            <div className="space-y-1.5">
              <Label>Related Contract <span className="text-destructive">*</span></Label>
              <Select
                value={form.watch("contract_id") ?? ""}
                onValueChange={(v) => form.setValue("contract_id", v, { shouldValidate: true })}
                disabled={contractsLoading}
              >
                <SelectTrigger>
                  <SelectValue placeholder={contractsLoading ? "Loading contracts…" : "Select a contract"} />
                </SelectTrigger>
                <SelectContent>
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
              {form.formState.errors.contract_id && (
                <p className="text-xs text-destructive">{form.formState.errors.contract_id.message}</p>
              )}
            </div>

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
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => { setSubmitting(false); form.reset() }}>Cancel</Button>
              <Button type="submit" disabled={submitInvoice.isPending}>
                {submitInvoice.isPending ? "Submitting…" : "Submit Invoice"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </AnimatedPage>
  )
}
