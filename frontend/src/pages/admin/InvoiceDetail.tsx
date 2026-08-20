import { useState } from "react"
import { useParams, Link } from "react-router-dom"
import { useInvoice, useReviewInvoice, useRunThreeWayMatch, useInvoicePayments, useInvoiceExceptions, useResolveInvoiceException } from "@/hooks/useInvoices"
import { usePermissions } from "@/hooks/usePermissions"
import { AnimatedPage } from "@/components/shared/AnimatedPage"
import { AttachmentList } from "@/components/shared/AttachmentList"
import { RecordPaymentDialog } from "@/components/shared/RecordPaymentDialog"
import { RateVendorDialog } from "@/components/shared/RateVendorDialog"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import {
  INVOICE_STATUS_LABELS, INVOICE_STATUS_COLORS,
  MATCH_STATUS_LABELS, MATCH_STATUS_COLORS,
  PAYMENT_METHOD_LABELS,
} from "@/lib/constants"
import { formatCurrency } from "@/lib/utils"
import { format } from "date-fns"
import { ArrowLeft01Icon } from "@/components/shared/SolarIcon"
import { SolarDuotoneIcon } from "@/components/shared/SolarIcon"
import { toast } from "sonner"
import type { InvoiceStatus, MatchStatus } from "@/lib/types"

// Shared by both the org-side and vendor-side routes (/admin/invoices/:id and
// /vendor/invoices/:id) -- same shape as ContractDetail.tsx: review/match/
// pay actions are gated behind canApproveInvoice, which is false for a
// vendor viewer, so the action bar simply doesn't render for them.
export function InvoiceDetail() {
  const { id } = useParams<{ id: string }>()

  const [reviewAction, setReviewAction] = useState<"approve" | "reject" | null>(null)
  const [notes, setNotes] = useState("")
  const [showPaymentDialog, setShowPaymentDialog] = useState(false)
  const [exceptionAction, setExceptionAction] = useState<"resolved" | "waived" | null>(null)
  const [exceptionNotes, setExceptionNotes] = useState("")
  const [showRateDialog, setShowRateDialog] = useState(false)

  const { data: invoice, isLoading } = useInvoice(id!)
  const { data: payments = [] } = useInvoicePayments(id)
  const { data: exceptions = [] } = useInvoiceExceptions(id ? { invoiceId: id } : undefined)
  const openException = exceptions.find((e) => e.status === "open")
  const reviewInvoice = useReviewInvoice()
  const runMatch = useRunThreeWayMatch()
  const resolveException = useResolveInvoiceException()
  const { canApproveInvoice, canRateVendors } = usePermissions()

  async function handleResolveException() {
    if (!exceptionAction || !openException) return
    try {
      await resolveException.mutateAsync({ id: openException.id, status: exceptionAction, notes: exceptionNotes.trim() || undefined })
      setExceptionAction(null); setExceptionNotes("")
    } catch { /* hook toasts its own error */ }
  }

  async function handleReview() {
    if (!reviewAction || !id) return
    try {
      await reviewInvoice.mutateAsync({ id, status: reviewAction === "approve" ? "approved" : "rejected", notes })
      toast.success(reviewAction === "approve" ? "Invoice approved." : "Invoice rejected.")
      setReviewAction(null); setNotes("")
    } catch {
      toast.error("Failed to update invoice. Please try again.")
    }
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

  if (!invoice) {
    return (
      <AnimatedPage>
        <div className="p-6"><p className="text-sm text-muted-foreground">Invoice not found.</p></div>
      </AnimatedPage>
    )
  }

  const listPath = canApproveInvoice ? "/admin/invoices" : "/vendor/invoices"
  const status = invoice.status as InvoiceStatus

  return (
    <AnimatedPage>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div>
          <Link to={listPath} className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground mb-3">
            <SolarDuotoneIcon icon={ArrowLeft01Icon} size={13} strokeWidth={1.5} />
            Invoices
          </Link>
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-xl font-bold tracking-tight font-mono">{invoice.invoice_ref ?? invoice.vendor_invoice_number}</h1>
              <p className="text-sm text-muted-foreground mt-0.5">
                {invoice.vendor?.company_name}
                {invoice.contract?.title && ` · ${invoice.contract.title}`}
                {invoice.purchase_request?.title && ` · ${invoice.purchase_request.title}`}
              </p>
            </div>
            <div className="flex flex-col items-end gap-1.5">
              <span className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-xs font-medium border ${INVOICE_STATUS_COLORS[status]}`}>
                {INVOICE_STATUS_LABELS[status]}
              </span>
              {/* invoice.status already becomes "matched" alongside
                  match_status once the 3-way match runs clean, so a second
                  "Matched" pill here was pure duplication -- only surface
                  match_status when it adds information the status pill
                  doesn't already carry (a variance flag). */}
              {invoice.match_status === "variance" && (
                <span className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[11px] font-medium border ${MATCH_STATUS_COLORS[invoice.match_status as MatchStatus]}`}>
                  {MATCH_STATUS_LABELS[invoice.match_status as MatchStatus]}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Actions — org reviewers only */}
        {canApproveInvoice && (
          <div className="flex flex-wrap gap-2">
            {invoice.po_id && invoice.match_status === "pending" && (
              <Button
                size="sm" variant="outline"
                onClick={() => runMatch.mutate({ invoiceId: invoice.id }, {
                  onSuccess: () => toast.success("3-way match completed."),
                  onError: () => toast.error("Match failed. Please try again."),
                })}
                disabled={runMatch.isPending}
              >
                {runMatch.isPending ? "Matching…" : "Run 3-Way Match"}
              </Button>
            )}
            {["submitted", "under_review", "matched"].includes(status) && (
              <>
                <Button size="sm" variant="success" onClick={() => setReviewAction("approve")}>
                  Approve
                </Button>
                <Button size="sm" variant="danger" onClick={() => setReviewAction("reject")}>
                  Reject
                </Button>
              </>
            )}
            {["approved", "partially_paid"].includes(status) && (
              <Button size="sm" variant="outline" onClick={() => setShowPaymentDialog(true)}>
                Record Payment
              </Button>
            )}
          </div>
        )}

        {/* Rating is a separate (Admin-tier) permission from invoice review/
            payment -- shown once the invoice is fully paid, independent of
            canApproveInvoice. */}
        {canRateVendors && status === "paid" && (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => setShowRateDialog(true)}>
              Rate Vendor
            </Button>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Details */}
          <Card className="md:col-span-2">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold">Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">Vendor</p>
                  <p className="font-medium">{invoice.vendor?.company_name ?? "—"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">Amount</p>
                  <p className="font-medium tabular-nums">{formatCurrency(invoice.total_amount, invoice.currency)}</p>
                  {invoice.match_variance !== null && invoice.match_variance !== 0 && (
                    <p className="text-xs text-orange-600 tabular-nums">
                      Δ {formatCurrency(Math.abs(invoice.match_variance), invoice.currency)} variance
                    </p>
                  )}
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">Invoice Date</p>
                  <p className="font-medium">{format(new Date(invoice.invoice_date), "dd MMM yyyy")}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">Due Date</p>
                  <p className="font-medium">{invoice.due_date ? format(new Date(invoice.due_date), "dd MMM yyyy") : "—"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">Purchase Order</p>
                  {invoice.po_id ? (
                    <Link to={`/admin/purchase-orders/${invoice.po_id}`} className="font-medium text-primary hover:underline">
                      {invoice.purchase_order?.po_number ?? "View PO"}
                    </Link>
                  ) : <p className="font-medium">—</p>}
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">GRN</p>
                  {invoice.grns && invoice.grns.length > 0 ? (
                    <p className="font-medium">
                      {invoice.grns.map((g, i) => (
                        <span key={g.id}>
                          <Link to={`/admin/grns/${g.id}`} className="text-primary hover:underline">
                            {g.grn_number ?? "View GRN"}
                          </Link>
                          {i < invoice.grns!.length - 1 && ", "}
                        </span>
                      ))}
                    </p>
                  ) : <p className="font-medium">—</p>}
                </div>
                {invoice.contract_id && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-0.5">Contract</p>
                    <Link to={`/admin/contracts/${invoice.contract_id}`} className="font-medium text-primary hover:underline">
                      {invoice.contract?.contract_ref ?? invoice.contract?.title ?? "View Contract"}
                    </Link>
                  </div>
                )}
                {invoice.purchase_request_id && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-0.5">Purchase Request</p>
                    <p className="font-medium">{invoice.purchase_request?.title ?? "—"}</p>
                  </div>
                )}
                {status === "paid" && invoice.paid_at && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-0.5">Paid On</p>
                    <p className="font-medium">{format(new Date(invoice.paid_at), "dd MMM yyyy")}</p>
                  </div>
                )}
              </div>
              {invoice.notes && (
                <>
                  <Separator />
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Notes</p>
                    <p className="text-sm whitespace-pre-wrap">{invoice.notes}</p>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Review + Payments sidebar */}
          <div className="space-y-4">
            {openException && (
              <Card className="border-orange-200">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold text-orange-800">Match Exception</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                    <div>
                      <p className="text-xs text-muted-foreground mb-0.5">Expected</p>
                      <p className="font-medium tabular-nums">{formatCurrency(openException.expected_amount, invoice.currency)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground mb-0.5">Invoiced</p>
                      <p className="font-medium tabular-nums">{formatCurrency(openException.invoiced_amount, invoice.currency)}</p>
                    </div>
                    <div className="col-span-2">
                      <p className="text-xs text-muted-foreground mb-0.5">Variance</p>
                      <p className="font-medium tabular-nums text-orange-700">
                        {formatCurrency(openException.variance, invoice.currency)}
                        {openException.variance_pct != null && ` (${openException.variance_pct.toFixed(1)}%)`}
                      </p>
                    </div>
                  </div>
                  {canApproveInvoice && (
                    <div className="flex gap-2 pt-1">
                      <Button size="sm" variant="outline" className="flex-1" onClick={() => setExceptionAction("resolved")}>
                        Mark Resolved
                      </Button>
                      <Button size="sm" variant="outline" className="flex-1" onClick={() => setExceptionAction("waived")}>
                        Waive
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold">Review</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                {invoice.reviewed_at ? (
                  <div>
                    <p className="text-xs text-muted-foreground mb-0.5">Reviewed On</p>
                    <p className="font-medium">{format(new Date(invoice.reviewed_at), "dd MMM yyyy")}</p>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">Not yet reviewed.</p>
                )}
              </CardContent>
            </Card>

            {(payments.length > 0 || status === "partially_paid") && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold">Payments ({payments.length})</CardTitle>
                </CardHeader>
                <CardContent>
                  {payments.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No payments recorded yet.</p>
                  ) : (
                    <div className="space-y-2">
                      {payments.map((p) => (
                        <div key={p.id} className="rounded-lg border px-2.5 py-2 text-sm">
                          <div className="flex items-center justify-between">
                            <span className="font-medium tabular-nums">{formatCurrency(p.amount, invoice.currency)}</span>
                            <span className="text-xs text-muted-foreground">{format(new Date(p.paid_date), "dd MMM yyyy")}</span>
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {PAYMENT_METHOD_LABELS[p.payment_method]}
                            {p.reference_number && ` · ${p.reference_number}`}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </div>
        </div>

        <AttachmentList
          entityType="invoice"
          entityId={invoice.id}
          canDelete={false}
          canUpload={false}
        />
      </div>

      <Dialog open={!!reviewAction} onOpenChange={(o) => { if (!o) { setReviewAction(null); setNotes("") } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{reviewAction === "approve" ? "Approve Invoice" : "Reject Invoice"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pt-2">
            <p className="text-sm text-muted-foreground">
              {reviewAction === "approve"
                ? "Approving will mark this invoice ready for payment."
                : "Rejecting will notify the vendor to resubmit with corrections."}
            </p>
            <Textarea
              placeholder={reviewAction === "approve" ? "Notes (optional)…" : "Reason for rejection…"}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setReviewAction(null); setNotes("") }} disabled={reviewInvoice.isPending}>
              Cancel
            </Button>
            <Button
              variant={reviewAction === "approve" ? "success" : "danger"}
              disabled={reviewInvoice.isPending}
              onClick={handleReview}
            >
              {reviewInvoice.isPending ? "Processing…" : reviewAction === "approve" ? "Approve" : "Reject"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {showPaymentDialog && (
        <RecordPaymentDialog
          open={showPaymentDialog}
          onOpenChange={setShowPaymentDialog}
          invoice={invoice}
        />
      )}

      <Dialog open={!!exceptionAction} onOpenChange={(o) => { if (!o) { setExceptionAction(null); setExceptionNotes("") } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{exceptionAction === "resolved" ? "Mark Exception Resolved" : "Waive Exception"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pt-2">
            <p className="text-sm text-muted-foreground">
              {exceptionAction === "resolved"
                ? "Confirms the discrepancy has been addressed (e.g. a correction was made or additional deliveries were verified)."
                : "Accepts the variance without further action — you can still approve or reject this invoice normally."}
            </p>
            <Textarea
              placeholder="Notes (optional)…"
              value={exceptionNotes}
              onChange={(e) => setExceptionNotes(e.target.value)}
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setExceptionAction(null); setExceptionNotes("") }} disabled={resolveException.isPending}>
              Cancel
            </Button>
            <Button disabled={resolveException.isPending} onClick={handleResolveException}>
              {resolveException.isPending ? "Saving…" : exceptionAction === "resolved" ? "Mark Resolved" : "Waive"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <RateVendorDialog
        open={showRateDialog}
        onOpenChange={setShowRateDialog}
        vendorId={invoice.vendor_id}
        vendorName={invoice.vendor?.company_name}
      />
    </AnimatedPage>
  )
}
