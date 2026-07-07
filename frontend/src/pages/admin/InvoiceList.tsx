import { useState, useEffect } from "react"
import { useInvoices, useReviewInvoice, useRunThreeWayMatch, useMarkInvoicePaid } from "@/hooks/useInvoices"
import { usePermissions } from "@/hooks/usePermissions"
import { usePagination } from "@/hooks/usePagination"
import { AnimatedPage } from "@/components/shared/AnimatedPage"
import { PaginationBar } from "@/components/shared/PaginationBar"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import {
  INVOICE_STATUS_LABELS, INVOICE_STATUS_COLORS,
  MATCH_STATUS_LABELS, MATCH_STATUS_COLORS,
} from "@/lib/constants"
import { formatCurrency } from "@/lib/utils"
import type { InvoiceStatus, MatchStatus, Invoice } from "@/lib/types"
import { format } from "date-fns"
import { CheckmarkCircle01Icon, Cancel01Icon } from "@/components/shared/SolarIcon"
import { SolarDuotoneIcon } from "@/components/shared/SolarIcon"
import { toast } from "sonner"

const STATUSES: InvoiceStatus[] = ["submitted", "under_review", "matched", "approved", "rejected", "paid"]

type ReviewDialog = { invoice: Invoice; action: "approve" | "reject" } | null

export function InvoiceList() {
  const [status, setStatus] = useState<InvoiceStatus | "">("")
  const [reviewDialog, setReviewDialog] = useState<ReviewDialog>(null)
  const [notes, setNotes] = useState("")

  const { canApproveInvoice } = usePermissions()
  const { data: invoices = [], isLoading } = useInvoices({ status: status || undefined })
  const { page, setPage, totalPages, totalItems, paginated, reset } = usePagination(invoices, 10)

  useEffect(() => { reset() }, [status])

  const reviewInvoice = useReviewInvoice()
  const runMatch = useRunThreeWayMatch()
  const markPaid = useMarkInvoicePaid()

  function handleRunMatch(invoiceId: string) {
    runMatch.mutate({ invoiceId }, {
      onSuccess: () => toast.success("3-way match completed."),
      onError: () => toast.error("Match failed. Please try again."),
    })
  }

  function handleMarkPaid(id: string) {
    markPaid.mutate({ id }, {
      onSuccess: () => toast.success("Invoice marked as paid."),
      onError: () => toast.error("Failed to mark as paid. Please try again."),
    })
  }

  async function handleReview() {
    if (!reviewDialog) return
    try {
      await reviewInvoice.mutateAsync({ id: reviewDialog.invoice.id, status: reviewDialog.action === "approve" ? "approved" : "rejected", notes })
      toast.success(reviewDialog.action === "approve" ? "Invoice approved." : "Invoice rejected.")
      setReviewDialog(null)
      setNotes("")
    } catch {
      toast.error("Failed to update invoice. Please try again.")
    }
  }

  return (
    <AnimatedPage>
      <div className="flex-1 flex flex-col min-h-0 pt-4 gap-4">
        {/* Filters */}
        <div className="shrink-0 flex flex-wrap items-center gap-3 p-4 rounded-xl border bg-card">
          <Select value={status || "all"} onValueChange={(v) => setStatus(v === "all" ? "" : v as InvoiceStatus)}>
            <SelectTrigger className="w-44 h-9 text-sm"><SelectValue placeholder="All statuses" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {STATUSES.map((s) => <SelectItem key={s} value={s}>{INVOICE_STATUS_LABELS[s]}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {/* Table */}
        <div className="flex-1 min-h-0 overflow-auto rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Ref</TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Vendor Invoice #</TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Vendor</TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">PO</TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Amount</TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Match</TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Status</TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Date</TableHead>
                <TableHead className="w-32" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-12">
                    <div className="flex flex-col items-center gap-2">
                      <div className="h-5 w-5 border-2 border-muted-foreground/30 border-t-muted-foreground rounded-full animate-spin" />
                      <span className="text-sm text-muted-foreground">Loading…</span>
                    </div>
                  </TableCell>
                </TableRow>
              ) : invoices.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-12">
                    <p className="text-sm font-medium text-muted-foreground">No invoices found</p>
                  </TableCell>
                </TableRow>
              ) : (
                paginated.map((inv, idx) => (
                  <TableRow key={inv.id} className={`transition-colors hover:bg-accent/50 ${idx % 2 !== 0 ? "bg-muted/20" : ""}`}>
                    <TableCell>
                      <span className="font-mono text-xs bg-muted border border-border/70 rounded px-1.5 py-0.5">
                        {inv.invoice_ref ?? "—"}
                      </span>
                    </TableCell>
                    <TableCell><p className="text-sm">{inv.vendor_invoice_number}</p></TableCell>
                    <TableCell><p className="text-sm">{inv.vendor?.company_name ?? "—"}</p></TableCell>
                    <TableCell>
                      <span className="text-xs text-muted-foreground font-mono">{inv.purchase_order?.po_number ?? "—"}</span>
                    </TableCell>
                    <TableCell>
                      <p className="text-sm font-medium tabular-nums">{formatCurrency(inv.total_amount, inv.currency)}</p>
                      {inv.match_variance !== null && inv.match_variance !== 0 && (
                        <p className="text-xs text-orange-600 tabular-nums">
                          Δ {formatCurrency(Math.abs(inv.match_variance), inv.currency)}
                        </p>
                      )}
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
                    <TableCell>
                      <div className="flex gap-1">
                        {/* Run 3-way match if PO is linked and match is pending */}
                        {inv.po_id && inv.match_status === "pending" && canApproveInvoice && (
                          <Button
                            size="sm" variant="outline"
                            className="h-7 text-xs"
                            onClick={() => handleRunMatch(inv.id)}
                            disabled={runMatch.isPending}
                          >
                            Match
                          </Button>
                        )}
                        {["submitted", "under_review", "matched"].includes(inv.status) && canApproveInvoice && (
                          <>
                            <Button
                              size="sm" variant="ghost"
                              className="h-7 px-2 text-green-600 hover:bg-green-50"
                              onClick={() => setReviewDialog({ invoice: inv, action: "approve" })}
                            >
                              <SolarDuotoneIcon icon={CheckmarkCircle01Icon} size={13} strokeWidth={1.5} />
                            </Button>
                            <Button
                              size="sm" variant="ghost"
                              className="h-7 px-2 text-destructive hover:bg-destructive/8"
                              onClick={() => setReviewDialog({ invoice: inv, action: "reject" })}
                            >
                              <SolarDuotoneIcon icon={Cancel01Icon} size={13} strokeWidth={1.5} />
                            </Button>
                          </>
                        )}
                        {inv.status === "approved" && canApproveInvoice && (
                          <Button
                            size="sm" variant="outline"
                            className="h-7 text-xs"
                            onClick={() => handleMarkPaid(inv.id)}
                            disabled={markPaid.isPending}
                          >
                            Mark Paid
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

        {/* Pagination */}
        <PaginationBar
          page={page}
          totalPages={totalPages}
          totalItems={totalItems}
          onPageChange={setPage}
          itemLabel="invoice"
        />
      </div>

      {/* Review dialog */}
      <Dialog open={!!reviewDialog} onOpenChange={() => { setReviewDialog(null); setNotes("") }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {reviewDialog?.action === "approve" ? "Approve Invoice" : "Reject Invoice"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pt-2">
            {reviewDialog?.action === "approve" ? (
              <p className="text-sm text-muted-foreground">
                Approving will mark this invoice ready for payment.
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">
                Rejecting will notify the vendor to resubmit with corrections.
              </p>
            )}
            <Textarea
              placeholder={reviewDialog?.action === "approve" ? "Notes (optional)…" : "Reason for rejection…"}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setReviewDialog(null); setNotes("") }}>Cancel</Button>
            {reviewDialog?.action === "approve" ? (
              <button
                className="btn-grad !py-1.5 !px-4 text-sm cursor-pointer"
                onClick={handleReview}
                disabled={reviewInvoice.isPending}
              >
                {reviewInvoice.isPending ? "Approving…" : "Approve"}
              </button>
            ) : (
              <button
                className="btn-grad-danger !py-1.5 !px-4 text-sm cursor-pointer"
                onClick={handleReview}
                disabled={reviewInvoice.isPending}
              >
                {reviewInvoice.isPending ? "Rejecting…" : "Reject"}
              </button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AnimatedPage>
  )
}
