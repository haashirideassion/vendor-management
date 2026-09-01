import { useState } from "react"
import { useParams, Link } from "react-router-dom"
import { CreateGRNDialog } from "@/components/shared/CreateGRNDialog"
import { CreateServiceConfirmationDialog } from "@/components/shared/CreateServiceConfirmationDialog"
import { RateVendorDialog } from "@/components/shared/RateVendorDialog"
import { CreateReleaseOrderDialog } from "@/components/shared/CreateReleaseOrderDialog"
import { AttachmentList } from "@/components/shared/AttachmentList"
import { TaxComponentsDisplay } from "@/components/shared/TaxComponentsDisplay"
import { usePurchaseOrder, useIssuePurchaseOrder, useUpdatePOStatus, usePurchaseOrders } from "@/hooks/usePurchaseOrders"
import { useGRNs } from "@/hooks/useGRNs"
import { useServiceConfirmations } from "@/hooks/useServiceConfirmations"
import { useInvoices } from "@/hooks/useInvoices"
import { usePermissions } from "@/hooks/usePermissions"
import { AnimatedPage } from "@/components/shared/AnimatedPage"
import { ConfirmDialog } from "@/components/shared/ConfirmDialog"
import { toast } from "sonner"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Separator } from "@/components/ui/separator"
import {
  PO_STATUS_LABELS, PO_STATUS_COLORS,
  PO_TYPE_LABELS, PO_TYPE_COLORS,
  GRN_STATUS_LABELS, GRN_STATUS_COLORS,
  SERVICE_CONFIRMATION_STATUS_LABELS, SERVICE_CONFIRMATION_STATUS_COLORS,
  INVOICE_STATUS_LABELS, INVOICE_STATUS_COLORS,
  MATCH_STATUS_LABELS, MATCH_STATUS_COLORS,
} from "@/lib/constants"
import { formatCurrency } from "@/lib/utils"
import { format } from "date-fns"
import { ArrowLeft01Icon, EyeIcon } from "@/components/shared/SolarIcon"
import { SolarDuotoneIcon } from "@/components/shared/SolarIcon"
import type { POStatus, POType, GRNStatus, ServiceConfirmationStatus, InvoiceStatus, MatchStatus } from "@/lib/types"

export function PurchaseOrderDetail() {
  const { id } = useParams<{ id: string }>()

  const [showCancelConfirm, setShowCancelConfirm] = useState(false)
  const [showGRNDialog, setShowGRNDialog] = useState(false)
  const [showSCDialog, setShowSCDialog] = useState(false)
  const [showRateDialog, setShowRateDialog] = useState(false)
  const [showReleaseDialog, setShowReleaseDialog] = useState(false)

  const { data: po, isLoading }  = usePurchaseOrder(id!)
  const { data: grns = [] }      = useGRNs({ po_id: id })
  const { data: serviceConfirmations = [] } = useServiceConfirmations({ po_id: id })
  const { data: invoices = [] }  = useInvoices({ po_id: id })
  // Only meaningful for a Blanket PO -- harmless empty result otherwise.
  const { data: releaseOrders = [] } = usePurchaseOrders({ parent_po_id: id })
  const issuePO     = useIssuePurchaseOrder()
  const updateStatus = useUpdatePOStatus()
  const { canCreatePO, canRecordGRN, canRecordServiceConfirmation, canRateVendors } = usePermissions()

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

  const lineTotal = (po.line_items ?? []).reduce(
    (sum, li) => sum + li.quantity * li.unit_price * (1 + (li.tax_rate ?? 0) / 100),
    0
  )

  // Fully received/confirmed -- every PO line item's quantity is covered by
  // verified GRNs or verified Service Confirmations, whichever applies to
  // this PO's fulfillment_type (mirrors perform_three_way_match's own
  // "verified lines only" rule). Once true, cancelling the PO would leave
  // delivery already recorded with no PO to reconcile against, so Cancel PO
  // is disabled.
  const receivedByLine = new Map<string, number>()
  if (po.fulfillment_type === "goods") {
    for (const g of grns) {
      if (g.status !== "verified") continue
      for (const li of g.line_items ?? []) {
        if (!li.po_line_item_id) continue
        receivedByLine.set(li.po_line_item_id, (receivedByLine.get(li.po_line_item_id) ?? 0) + Number(li.quantity_received))
      }
    }
  } else {
    for (const sc of serviceConfirmations) {
      if (sc.status !== "verified") continue
      for (const li of sc.line_items ?? []) {
        if (!li.po_line_item_id) continue
        receivedByLine.set(li.po_line_item_id, (receivedByLine.get(li.po_line_item_id) ?? 0) + Number(li.quantity_confirmed))
      }
    }
  }
  const poLineItems = po.line_items ?? []
  const fullyReceived = poLineItems.length > 0 && poLineItems.every(
    (pli) => (receivedByLine.get(pli.id) ?? 0) >= pli.quantity - 1e-6
  )

  const isBlanket = po.po_type === "blanket"
  const isRelease = po.po_type === "release"
  const drawnAmount = releaseOrders
    .filter((r) => r.status !== "cancelled")
    .reduce((sum, r) => sum + Number(r.total_value), 0)
  const remainingBalance = Number(po.total_value) - drawnAmount

  return (
    <AnimatedPage>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div>
          <Link to="/admin/purchase-orders" className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground mb-3">
            <SolarDuotoneIcon icon={ArrowLeft01Icon} size={13} strokeWidth={1.5} />
            Purchase Orders
          </Link>
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-xl font-bold tracking-tight font-mono">{po.po_number ?? "Draft PO"}</h1>
              <p className="text-sm text-muted-foreground mt-0.5">
                {po.vendor?.company_name}
                {po.purchase_request?.title && ` · ${po.purchase_request.title}`}
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {po.po_type !== "standard" && (
                <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium border ${PO_TYPE_COLORS[po.po_type as POType]}`}>
                  {PO_TYPE_LABELS[po.po_type as POType]}
                </span>
              )}
              <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium border ${PO_STATUS_COLORS[po.status as POStatus]}`}>
                {PO_STATUS_LABELS[po.status as POStatus]}
              </span>
            </div>
          </div>
          {isRelease && po.parent_po_id && (
            <div className="mt-3 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900">
              Drawn from Blanket PO{" "}
              <Link to={`/admin/purchase-orders/${po.parent_po_id}`} className="font-medium underline">
                {po.parent_po?.po_number ?? "View Blanket PO"}
              </Link>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex flex-wrap gap-2">
          {po.status === "draft" && canCreatePO && (
            <Button
              size="sm"
              onClick={() => issuePO.mutate({ id: po.id }, {
                onSuccess: () => toast.success("PO issued successfully."),
                onError: () => toast.error("Failed to issue PO. Please try again."),
              })}
              disabled={issuePO.isPending}
            >
              {issuePO.isPending ? "Issuing…" : "Issue PO"}
            </Button>
          )}
          {/* A Blanket PO is never fulfilled directly -- only its Release
              Orders are. */}
          {!isBlanket && po.status === "issued" && po.fulfillment_type === "goods" && canRecordGRN && (
            <Button size="sm" onClick={() => setShowGRNDialog(true)}>
              Record GRN
            </Button>
          )}
          {!isBlanket && po.status === "issued" && po.fulfillment_type === "service" && canRecordServiceConfirmation && (
            <Button size="sm" onClick={() => setShowSCDialog(true)}>
              Record Service Confirmation
            </Button>
          )}
          {isBlanket && po.status === "issued" && canCreatePO && (
            <Button size="sm" variant="outline" onClick={() => setShowReleaseDialog(true)}>
              Issue Release Order
            </Button>
          )}
          {po.status !== "draft" && canRateVendors && (
            <Button size="sm" variant="outline" onClick={() => setShowRateDialog(true)}>
              Rate Vendor
            </Button>
          )}
          {["draft", "issued"].includes(po.status) && canCreatePO && (
            <Button
              size="sm"
              variant="danger"
              onClick={() => setShowCancelConfirm(true)}
              disabled={updateStatus.isPending || fullyReceived}
              title={fullyReceived ? "This PO's items have already been fully received and verified — it can no longer be cancelled." : undefined}
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
                  <p className="text-xs text-muted-foreground mb-0.5">Team</p>
                  <p className="font-medium">{po.team?.name ?? "—"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">{isBlanket ? "Authorized Amount" : "Total Value"}</p>
                  <p className="font-medium tabular-nums">{formatCurrency(po.total_value, po.currency)}</p>
                </div>
                {isBlanket ? (
                  <>
                    <div>
                      <p className="text-xs text-muted-foreground mb-0.5">Drawn / Remaining</p>
                      <p className="font-medium tabular-nums">
                        {formatCurrency(drawnAmount, po.currency)} / {formatCurrency(remainingBalance, po.currency)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground mb-0.5">Valid From</p>
                      <p className="font-medium">{po.valid_from ? format(new Date(po.valid_from), "dd MMM yyyy") : "—"}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground mb-0.5">Valid Until</p>
                      <p className="font-medium">{po.valid_until ? format(new Date(po.valid_until), "dd MMM yyyy") : "—"}</p>
                    </div>
                  </>
                ) : (
                  <>
                    <div>
                      <p className="text-xs text-muted-foreground mb-0.5">Issue Date</p>
                      <p className="font-medium">{po.issue_date ? format(new Date(po.issue_date), "dd MMM yyyy") : "—"}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground mb-0.5">Expected Delivery</p>
                      <p className="font-medium">{po.expected_delivery_date ? format(new Date(po.expected_delivery_date), "dd MMM yyyy") : "—"}</p>
                    </div>
                  </>
                )}
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
                          <TableHead className="text-xs text-muted-foreground text-right">Rate</TableHead>
                          <TableHead className="text-xs text-muted-foreground text-right">Tax %</TableHead>
                          <TableHead className="text-xs text-muted-foreground text-right">Unit</TableHead>
                          <TableHead className="text-xs text-muted-foreground text-right">Total</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(po.line_items ?? []).map((li) => (
                          <TableRow key={li.id}>
                            <TableCell className="text-sm">{li.description}</TableCell>
                            <TableCell className="text-sm text-right tabular-nums">{li.quantity}</TableCell>
                            <TableCell className="text-sm text-right tabular-nums">{formatCurrency(li.unit_price, po.currency)}</TableCell>
                            <TableCell className="text-sm text-right text-muted-foreground">
                              <TaxComponentsDisplay taxRate={li.tax_rate} components={li.tax_components} />
                            </TableCell>
                            <TableCell className="text-sm text-right text-muted-foreground">{li.unit ?? "—"}</TableCell>
                            <TableCell className="text-sm text-right font-medium tabular-nums">
                              {formatCurrency(li.quantity * li.unit_price * (1 + (li.tax_rate ?? 0) / 100), po.currency)}
                            </TableCell>
                          </TableRow>
                        ))}
                        <TableRow className="bg-muted/20">
                          <TableCell colSpan={5} className="text-sm font-semibold text-right">Total</TableCell>
                          <TableCell className="text-sm font-semibold text-right tabular-nums">{formatCurrency(lineTotal, po.currency)}</TableCell>
                        </TableRow>
                      </TableBody>
                    </Table>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* GRNs / Service Confirmations / Release Orders sidebar */}
          <div className="space-y-4">
            {isBlanket ? (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold">Release Orders ({releaseOrders.length})</CardTitle>
                </CardHeader>
                <CardContent>
                  {releaseOrders.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No release orders issued yet.</p>
                  ) : (
                    <div className="space-y-2">
                      {releaseOrders.map((r) => (
                        <div key={r.id} className="flex items-center justify-between rounded-lg border px-2.5 py-2">
                          <div>
                            <p className="font-mono text-xs">{r.po_number}</p>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              <span className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium border ${PO_STATUS_COLORS[r.status as POStatus]}`}>
                                {PO_STATUS_LABELS[r.status as POStatus]}
                              </span>
                              <span className="text-[10px] text-muted-foreground tabular-nums">{formatCurrency(r.total_value, r.currency)}</span>
                            </div>
                          </div>
                          <Button asChild size="sm" variant="ghost" className="h-7 px-2">
                            <Link to={`/admin/purchase-orders/${r.id}`}>
                              <SolarDuotoneIcon icon={EyeIcon} size={13} strokeWidth={1.5} />
                            </Link>
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            ) : po.fulfillment_type === "goods" ? (
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
                              <SolarDuotoneIcon icon={EyeIcon} size={13} strokeWidth={1.5} />
                            </Link>
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold">Service Confirmations ({serviceConfirmations.length})</CardTitle>
                </CardHeader>
                <CardContent>
                  {serviceConfirmations.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No confirmations recorded yet.</p>
                  ) : (
                    <div className="space-y-2">
                      {serviceConfirmations.map((sc) => (
                        <div key={sc.id} className="flex items-center justify-between rounded-lg border px-2.5 py-2">
                          <div>
                            <p className="font-mono text-xs">{sc.confirmation_number}</p>
                            <span className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium border mt-0.5 ${SERVICE_CONFIRMATION_STATUS_COLORS[sc.status as ServiceConfirmationStatus]}`}>
                              {SERVICE_CONFIRMATION_STATUS_LABELS[sc.status as ServiceConfirmationStatus]}
                            </span>
                          </div>
                          <Button asChild size="sm" variant="ghost" className="h-7 px-2">
                            <Link to={`/admin/service-confirmations/${sc.id}`}>
                              <SolarDuotoneIcon icon={EyeIcon} size={13} strokeWidth={1.5} />
                            </Link>
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {!isBlanket && (
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
                      <div key={inv.id} className="flex items-start justify-between gap-2 rounded-lg border px-2.5 py-2">
                        <div className="space-y-1">
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
                        <Button asChild size="sm" variant="ghost" className="h-7 px-2 shrink-0">
                          <Link to={`/admin/invoices/${inv.id}`}>
                            <SolarDuotoneIcon icon={EyeIcon} size={13} strokeWidth={1.5} />
                          </Link>
                        </Button>
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
          entityType="purchase_order"
          entityId={po.id}
          canDelete={canCreatePO}
          canUpload={false}
        />
      </div>

      <CreateGRNDialog
        open={showGRNDialog}
        onOpenChange={setShowGRNDialog}
        defaultPOId={po.id}
        defaultVendorId={po.vendor_id ?? undefined}
      />

      <CreateServiceConfirmationDialog
        open={showSCDialog}
        onOpenChange={setShowSCDialog}
        defaultPOId={po.id}
        defaultVendorId={po.vendor_id ?? undefined}
      />

      <ConfirmDialog
        open={showCancelConfirm}
        onOpenChange={setShowCancelConfirm}
        title="Cancel Purchase Order"
        description={`Are you sure you want to cancel ${po.po_number ?? "this PO"}? This action cannot be undone.`}
        confirmLabel="Cancel PO"
        variant="danger"
        loading={updateStatus.isPending}
        onConfirm={() => updateStatus.mutate({ id: po.id, status: "cancelled" }, { onSuccess: () => setShowCancelConfirm(false) })}
      />

      {po.vendor_id && (
        <RateVendorDialog
          open={showRateDialog}
          onOpenChange={setShowRateDialog}
          vendorId={po.vendor_id}
          vendorName={po.vendor?.company_name}
        />
      )}

      {isBlanket && (
        <CreateReleaseOrderDialog
          open={showReleaseDialog}
          onOpenChange={setShowReleaseDialog}
          blanketPoId={po.id}
          vendorId={po.vendor_id}
          vendorName={po.vendor?.company_name}
          currency={po.currency}
          remainingBalance={remainingBalance}
        />
      )}
    </AnimatedPage>
  )
}
