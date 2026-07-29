import { useState } from "react"
import { useParams, Link } from "react-router-dom"
import { useInvoice, useReviewInvoice, useRunThreeWayMatch, useMarkInvoicePaid } from "@/hooks/useInvoices"
import { usePermissions } from "@/hooks/usePermissions"
import { AnimatedPage } from "@/components/shared/AnimatedPage"
import { AttachmentList } from "@/components/shared/AttachmentList"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import {
  INVOICE_STATUS_LABELS, INVOICE_STATUS_COLORS,
  MATCH_STATUS_LABELS, MATCH_STATUS_COLORS,
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

  const { data: invoice, isLoading } = useInvoice(id!)
  const reviewInvoice = useReviewInvoice()
  const runMatch = useRunThreeWayMatch()
  const markPaid = useMarkInvoicePaid()
  const { canApproveInvoice } = usePermissions()

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
                {invoice.engagement?.title && ` · ${invoice.engagement.title}`}
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
            {status === "approved" && (
              <Button
                size="sm" variant="outline"
                onClick={() => markPaid.mutate({ id: invoice.id }, {
                  onSuccess: () => toast.success("Invoice marked as paid."),
                  onError: () => toast.error("Failed to mark as paid. Please try again."),
                })}
                disabled={markPaid.isPending}
              >
                Mark Paid
              </Button>
            )}
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
                {invoice.engagement_id && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-0.5">Engagement</p>
                    <p className="font-medium">{invoice.engagement?.title ?? "—"}</p>
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

          {/* Review history sidebar */}
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
    </AnimatedPage>
  )
}
