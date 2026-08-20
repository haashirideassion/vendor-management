import { Link } from "react-router-dom"
import { usePurchaseOrders } from "@/hooks/usePurchaseOrders"
import { AnimatedPage } from "@/components/shared/AnimatedPage"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { PO_STATUS_LABELS, PO_STATUS_COLORS, PO_TYPE_LABELS, PO_TYPE_COLORS } from "@/lib/constants"
import { formatCurrency } from "@/lib/utils"
import type { POStatus, POType } from "@/lib/types"
import { format } from "date-fns"
import { EyeIcon } from "@/components/shared/SolarIcon"
import { SolarDuotoneIcon } from "@/components/shared/SolarIcon"

// Read-only for vendors -- every status transition (issue/cancel/etc) stays
// an org-side action. Backend scoping (purchaseOrders.ts's /list, via
// resolveListScope) already pins this to the caller's own vendor_id, same
// pattern as VendorInvoices.tsx.
export function VendorPurchaseOrders() {
  const { data: pos = [], isLoading } = usePurchaseOrders()

  return (
    <AnimatedPage>
      <div className="flex-1 flex flex-col min-h-0 pt-4 gap-4">
        <div className="flex-1 min-h-0 overflow-auto rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">PO Number</TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Type</TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Linked To</TableHead>
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
                    <p className="text-sm font-medium text-muted-foreground">No purchase orders yet</p>
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
                    <TableCell>
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium border ${PO_TYPE_COLORS[po.po_type as POType]}`}>
                        {PO_TYPE_LABELS[po.po_type as POType]}
                      </span>
                    </TableCell>
                    <TableCell>
                      <p className="text-sm text-muted-foreground">
                        {po.po_type === "release" && po.parent_po
                          ? `Release of ${po.parent_po.po_number}`
                          : po.purchase_request?.title ?? "—"}
                      </p>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm tabular-nums">{formatCurrency(po.total_value, po.currency)}</span>
                    </TableCell>
                    <TableCell>
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium border ${PO_STATUS_COLORS[po.status as POStatus]}`}>
                        {PO_STATUS_LABELS[po.status as POStatus]}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {po.issue_date ? format(new Date(po.issue_date), "dd MMM yyyy") : "—"}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Button asChild size="sm" variant="ghost" className="h-8 px-2 gap-1.5 text-xs">
                        <Link to={`/vendor/purchase-orders/${po.id}`}>
                          <SolarDuotoneIcon icon={EyeIcon} size={14} strokeWidth={1.5} />
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
    </AnimatedPage>
  )
}
