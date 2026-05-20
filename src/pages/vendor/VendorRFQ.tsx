import { Link } from "react-router-dom"
import { useVendorRFQs } from "@/hooks/useRFQs"
import { AnimatedPage } from "@/components/shared/AnimatedPage"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { RFQ_STATUS_LABELS, RFQ_STATUS_COLORS } from "@/lib/constants"
import type { RFQStatus } from "@/lib/types"
import { format } from "date-fns"
import { EyeIcon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

export function VendorRFQ() {
  const { data: rfqs = [], isLoading } = useVendorRFQs()

  return (
    <AnimatedPage>
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Requests for Quotation</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {isLoading ? "Loading…" : `${rfqs.length} RFQ${rfqs.length !== 1 ? "s" : ""}`}
          </p>
        </div>

        <div className="rounded-xl border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">RFQ #</TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Engagement</TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Received</TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Status</TableHead>
                <TableHead className="w-20" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-12">
                    <div className="flex flex-col items-center gap-2">
                      <div className="h-5 w-5 border-2 border-muted-foreground/30 border-t-muted-foreground rounded-full animate-spin" />
                      <span className="text-sm text-muted-foreground">Loading…</span>
                    </div>
                  </TableCell>
                </TableRow>
              ) : rfqs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-12">
                    <p className="text-sm font-medium text-muted-foreground">No RFQs received yet</p>
                  </TableCell>
                </TableRow>
              ) : (
                rfqs.map((rfq, idx) => (
                  <TableRow key={rfq.id} className={`transition-colors hover:bg-accent/50 ${idx % 2 !== 0 ? "bg-muted/20" : ""}`}>
                    <TableCell>
                      <span className="font-mono text-xs bg-muted border border-border/70 rounded px-1.5 py-0.5">
                        {rfq.rfq_number ?? "—"}
                      </span>
                    </TableCell>
                    <TableCell>
                      <p className="text-sm font-medium">{rfq.engagement?.title ?? "—"}</p>
                    </TableCell>
                    <TableCell>
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {format(new Date(rfq.created_at), "dd MMM yyyy")}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium border ${RFQ_STATUS_COLORS[rfq.status as RFQStatus]}`}>
                        {RFQ_STATUS_LABELS[rfq.status as RFQStatus]}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Button asChild size="sm" variant="ghost" className="h-7 px-2 gap-1 text-xs">
                        <Link to={`/vendor/rfqs/${rfq.id}`}>
                          <HugeiconsIcon icon={EyeIcon} size={13} strokeWidth={1.5} />
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
