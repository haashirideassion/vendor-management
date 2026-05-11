import { useParams, Link } from "react-router-dom"
import { usePurchaseOrder, useIssuePurchaseOrder, useUpdatePOStatus } from "@/hooks/usePurchaseOrders"
import { useGRNs } from "@/hooks/useGRNs"
import { useInvoices } from "@/hooks/useInvoices"
import { usePermissions } from "@/hooks/usePermissions"
import { AnimatedPage } from "@/components/shared/AnimatedPage"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Separator } from "@/components/ui/separator"
import {
  PO_STATUS_LABELS, PO_STATUS_COLORS,
  GRN_STATUS_LABELS, GRN_STATUS_COLORS,
  INVOICE_STATUS_LABELS, INVOICE_STATUS_COLORS,
  MATCH_STATUS_LABELS, MATCH_STATUS_COLORS,
} from "@/lib/constants"
import { formatCurrency } from "@/lib/utils"
import { format } from "date-fns"
import { ArrowLeft01Icon, EyeIcon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import type { POStatus, GRNStatus, InvoiceStatus, MatchStatus } from "@/lib/types"

export function PurchaseOrderDetail() {
  const { id } = useParams<{ id: string }>()

  const { data: po, isLoading }  = usePurchaseOrder(id!)
  const { data: grns = [] }      = useGRNs({ po_id: id })
  const { data: invoices = [] }  = useInvoices({ po_id: id })
  const issuePO     = useIssuePurchaseOrder()
  const updateStatus = useUpdatePOStatus()
  const { canCreatePO, canRecordGRN } = usePermissions()

  if (isLoading) {
    return (
      <AnimatedPage>
        <div className="p-6 flex justify-center py-24">
          <div className="h-6 w-6 border-2 border-muted-foreground/30 border-t-muted-foreground rounded-full animate-spin" />
        </div>
      </AnimatedPage>
    )
  }

  if (!po) {
    return (
      <AnimatedPage>
        <div className="p-6"><p className="text-sm text-muted-foreground">Purchase order not found.</p></div>
      </AnimatedPage>
    )
  }

  const lineTotal = (po.line_items ?? []).reduce((sum, li) => sum + li.quantity * li.unit_price, 0)

  return (
    <AnimatedPage>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div>
          <Link to="/admin/purchase-orders" className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground mb-3">
            <HugeiconsIcon icon={ArrowLeft01Icon} size={13} strokeWidth={1.5} />
            Purchase Orders
          </Link>
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-xl font-bold tracking-tight font-mono">{po.po_number ?? "Draft PO"}</h1>
              <p className="text-sm text-muted-foreground mt-0.5">
                {po.vendor?.company_name}
                {po.engagement?.title && ` · ${po.engagement.title}`}
              </p>
            </div>
            <span className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-xs font-medium border ${PO_STATUS_COLORS[po.status as POStatus]}`}>
              {PO_STATUS_LABELS[po.status as POStatus]}
            </span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-wrap gap-2">
          {po.status === "draft" && canCreatePO && (
            <Button size="sm" onClick={() => issuePO.mutate({ id: po.id })} disabled={issuePO.isPending}>
              {issuePO.isPending ? "Issuing…" : "Issue PO"}
            </Button>
          )}
          {po.status === "issued" && canRecordGRN && (
            <Button asChild size="sm" variant="outline">
              <Link to={`/admin/grns?po_id=${po.id}`}>Record GRN</Link>
            </Button>
          )}
          {["draft", "issued"].includes(po.status) && canCreatePO && (
            <Button
              size="sm"
              variant="danger"
              onClick={() => updateStatus.mutate({ id: po.id, status: "cancelled" })}
              disabled={updateStatus.isPending}
            >
              Cancel PO
            </Button>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* PO Details */}
          <Card className="md:col-span-2">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold">Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">Vendor</p>
                  <p className="font-medium">{po.vendor?.company_name ?? "—"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">Total Value</p>
                  <p className="font-medium tabular-nums">{formatCurrency(po.total_value, po.currency)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">Issue Date</p>
                  <p className="font-medium">{po.issue_date ? format(new Date(po.issue_date), "dd MMM yyyy") : "—"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">Expected Delivery</p>
                  <p className="font-medium">{po.expected_delivery_date ? format(new Date(po.expected_delivery_date), "dd MMM yyyy") : "—"}</p>
                </div>
                {po.payment_terms && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-0.5">Payment Terms</p>
                    <p className="font-medium">{po.payment_terms}</p>
                  </div>
                )}
                {po.delivery_address && (
                  <div className="col-span-2">
                    <p className="text-xs text-muted-foreground mb-0.5">Delivery Address</p>
                    <p className="font-medium whitespace-pre-wrap">{po.delivery_address}</p>
                  </div>
                )}
              </div>

              {/* Line items */}
              {(po.line_items ?? []).length > 0 && (
                <>
                  <Separator />
                  <div>
                    <p className="text-xs text-muted-foreground mb-3 font-semibold uppercase tracking-wide">Line Items</p>
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/30 hover:bg-muted/30">
                          <TableHead className="text-xs text-muted-foreground">Description</TableHead>
                          <TableHead className="text-xs text-muted-foreground text-right">Qty</TableHead>
                          <TableHead className="text-xs text-muted-foreground text-right">Unit</TableHead>
                          <TableHead className="text-xs text-muted-foreground text-right">Rate</TableHead>
                          <TableHead className="text-xs text-muted-foreground text-right">Total</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(po.line_items ?? []).map((li) => (
                          <TableRow key={li.id}>
                            <TableCell className="text-sm">{li.description}</TableCell>
                            <TableCell className="text-sm text-right tabular-nums">{li.quantity}</TableCell>
                            <TableCell className="text-sm text-right text-muted-foreground">{li.unit ?? "—"}</TableCell>
                            <TableCell className="text-sm text-right tabular-nums">{formatCurrency(li.unit_price, po.currency)}</TableCell>
                            <TableCell className="text-sm text-right font-medium tabular-nums">{formatCurrency(li.quantity * li.unit_price, po.currency)}</TableCell>
                          </TableRow>
                        ))}
                        <TableRow className="bg-muted/20">
                          <TableCell colSpan={4} className="text-sm font-semibold text-right">Total</TableCell>
                          <TableCell className="text-sm font-semibold text-right tabular-nums">{formatCurrency(lineTotal, po.currency)}</TableCell>
                        </TableRow>
                      </TableBody>
                    </Table>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* GRNs sidebar */}
          <div className="space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold">GRNs ({grns.length})</CardTitle>
              </CardHeader>
              <CardContent>
                {grns.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No receipts recorded yet.</p>
                ) : (
                  <div className="space-y-2">
                    {grns.map((grn) => (
                      <div key={grn.id} className="flex items-center justify-between rounded-lg border px-2.5 py-2">
                        <div>
                          <p className="font-mono text-xs">{grn.grn_number}</p>
                          <span className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium border mt-0.5 ${GRN_STATUS_COLORS[grn.status as GRNStatus]}`}>
                            {GRN_STATUS_LABELS[grn.status as GRNStatus]}
                          </span>
                        </div>
                        <Button asChild size="sm" variant="ghost" className="h-7 px-2">
                          <Link to={`/admin/grns/${grn.id}`}>
                            <HugeiconsIcon icon={EyeIcon} size={13} strokeWidth={1.5} />
                          </Link>
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold">Invoices ({invoices.length})</CardTitle>
              </CardHeader>
              <CardContent>
                {invoices.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No invoices submitted yet.</p>
                ) : (
                  <div className="space-y-2">
                    {invoices.map((inv) => (
                      <div key={inv.id} className="rounded-lg border px-2.5 py-2 space-y-1">
                        <p className="font-mono text-xs">{inv.invoice_ref}</p>
                        <p className="text-xs font-medium tabular-nums">{formatCurrency(inv.total_amount, inv.currency)}</p>
                        <div className="flex gap-1 flex-wrap">
                          <span className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium border ${INVOICE_STATUS_COLORS[inv.status as InvoiceStatus]}`}>
                            {INVOICE_STATUS_LABELS[inv.status as InvoiceStatus]}
                          </span>
                          {inv.match_status && (
                            <span className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium border ${MATCH_STATUS_COLORS[inv.match_status as MatchStatus]}`}>
                              {MATCH_STATUS_LABELS[inv.match_status as MatchStatus]}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </AnimatedPage>
  )
}
