import { useState, useEffect } from "react"
import { useSearchParams } from "react-router-dom"
import { useGRNs, useUpdateGRNStatus } from "@/hooks/useGRNs"
import { usePermissions } from "@/hooks/usePermissions"
import { usePagination } from "@/hooks/usePagination"
import { AnimatedPage } from "@/components/shared/AnimatedPage"
import { PaginationBar } from "@/components/shared/PaginationBar"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { ConfirmDialog } from "@/components/shared/ConfirmDialog"
import { CreateGRNDialog } from "@/components/shared/CreateGRNDialog"
import { AttachmentList } from "@/components/shared/AttachmentList"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { GRN_STATUS_LABELS, GRN_STATUS_COLORS } from "@/lib/constants"
import type { GRNStatus } from "@/lib/types"
import { format } from "date-fns"
import { Add01Icon, Cancel01Icon, CheckmarkCircle01Icon, File01Icon } from "@/components/shared/SolarIcon"
import { SolarDuotoneIcon } from "@/components/shared/SolarIcon"
import { toast } from "sonner"

const STATUSES: GRNStatus[] = ["draft", "submitted", "verified", "rejected"]

function StatusChip({ status }: { status: GRNStatus }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium border ${GRN_STATUS_COLORS[status]}`}>
      {GRN_STATUS_LABELS[status]}
    </span>
  )
}

export function GRNList() {
  const [searchParams] = useSearchParams()
  const [status, setStatus] = useState<GRNStatus | "">("")
  const [creating, setCreating] = useState(false)
  const [confirmAction, setConfirmAction] = useState<{ id: string; status: "verified" | "rejected" } | null>(null)
  const [docsGRNId, setDocsGRNId] = useState<string | null>(null)

  const defaultPOId = searchParams.get("po_id") ?? undefined
  const { canRecordGRN } = usePermissions()
  const { data: grns = [], isLoading } = useGRNs({ status: status || undefined })
  const updateStatus = useUpdateGRNStatus()

  const { page, setPage, totalPages, totalItems, paginated, reset } = usePagination(grns, 10)
  useEffect(() => { reset() }, [status])

  return (
    <AnimatedPage>
      <div className="flex-1 flex flex-col min-h-0 pt-4 gap-4">
        {/* Filter + action */}
        <div className="shrink-0 flex flex-wrap items-center gap-3 p-4 rounded-xl border bg-card">
          <Select value={status || "all"} onValueChange={(v) => setStatus(v === "all" ? "" : v as GRNStatus)}>
            <SelectTrigger className="w-44 h-9 text-sm"><SelectValue placeholder="All statuses" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {STATUSES.map((s) => <SelectItem key={s} value={s}>{GRN_STATUS_LABELS[s]}</SelectItem>)}
            </SelectContent>
          </Select>
          {status && (
            <Button variant="ghost" size="sm" className="h-9 gap-1.5 text-muted-foreground" onClick={() => setStatus("")}>
              <SolarDuotoneIcon icon={Cancel01Icon} size={13} strokeWidth={1.5} />
              Clear
            </Button>
          )}
          {canRecordGRN && (
            <Button size="sm" className="h-8 gap-1.5 text-xs ml-auto" onClick={() => setCreating(true)}>
              <SolarDuotoneIcon icon={Add01Icon} size={14} strokeWidth={2} primaryColor="currentColor" secondaryColor="currentColor" />
              Record GRN
            </Button>
          )}
        </div>

        {/* Table */}
        <div className="flex-1 min-h-0 overflow-auto rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">GRN Number</TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">PO</TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Vendor</TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Received</TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Status</TableHead>
                <TableHead className="w-28" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-12">
                    <div className="flex flex-col items-center gap-2">
                      <div className="h-5 w-5 border-2 border-muted-foreground/30 border-t-muted-foreground rounded-full animate-spin" />
                      <span className="text-sm text-muted-foreground">Loading…</span>
                    </div>
                  </TableCell>
                </TableRow>
              ) : grns.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-12">
                    <p className="text-sm font-medium text-muted-foreground">No GRNs found</p>
                  </TableCell>
                </TableRow>
              ) : (
                paginated.map((grn, idx) => (
                  <TableRow key={grn.id} className={`transition-colors hover:bg-accent/50 ${idx % 2 !== 0 ? "bg-muted/20" : ""}`}>
                    <TableCell>
                      <span className="font-mono text-xs bg-muted border border-border/70 rounded px-1.5 py-0.5">
                        {grn.grn_number ?? "—"}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm text-muted-foreground">{grn.purchase_order?.po_number ?? "—"}</span>
                    </TableCell>
                    <TableCell><p className="text-sm">{grn.vendor?.company_name ?? "—"}</p></TableCell>
                    <TableCell>
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {format(new Date(grn.received_date), "dd MMM yyyy")}
                      </span>
                    </TableCell>
                    <TableCell><StatusChip status={grn.status as GRNStatus} /></TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        {grn.status === "submitted" && canRecordGRN && (
                          <>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 px-2 text-xs text-green-600 hover:text-green-800 hover:bg-green-50"
                              onClick={() => setConfirmAction({ id: grn.id, status: "verified" })}
                            >
                              <SolarDuotoneIcon icon={CheckmarkCircle01Icon} size={13} strokeWidth={1.5} />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 px-2 text-xs text-destructive hover:bg-destructive/8"
                              onClick={() => setConfirmAction({ id: grn.id, status: "rejected" })}
                            >
                              <SolarDuotoneIcon icon={Cancel01Icon} size={13} strokeWidth={1.5} />
                            </Button>
                          </>
                        )}
                        {grn.status === "draft" && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2 text-xs"
                            onClick={() => updateStatus.mutate(
                              { id: grn.id, status: "submitted" },
                              {
                                onSuccess: () => toast.success("GRN submitted for review."),
                                onError: () => toast.error("Failed to submit GRN. Please try again."),
                              }
                            )}
                          >
                            Submit
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 gap-1.5 text-xs text-muted-foreground"
                          onClick={() => setDocsGRNId(grn.id)}
                        >
                          <SolarDuotoneIcon icon={File01Icon} size={13} strokeWidth={1.5} />
                          <span>Document</span>
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        <PaginationBar
          page={page}
          totalPages={totalPages}
          totalItems={totalItems}
          onPageChange={setPage}
          itemLabel="GRN"
        />
      </div>

      <CreateGRNDialog
        open={creating}
        onOpenChange={setCreating}
        defaultPOId={defaultPOId}
      />

      <Dialog open={!!docsGRNId} onOpenChange={(o) => !o && setDocsGRNId(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>GRN Attachments</DialogTitle></DialogHeader>
          {docsGRNId && (
            <AttachmentList
              entityType="grn"
              entityId={docsGRNId}
              canDelete={canRecordGRN}
              canUpload={false}
              className="pt-2"
            />
          )}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!confirmAction}
        onOpenChange={(o) => !o && setConfirmAction(null)}
        title={confirmAction?.status === "verified" ? "Verify GRN" : "Reject GRN"}
        description={
          confirmAction?.status === "verified"
            ? "Are you sure you want to verify this goods receipt?"
            : "Are you sure you want to reject this goods receipt? The vendor will need to resubmit."
        }
        confirmLabel={confirmAction?.status === "verified" ? "Verify" : "Reject"}
        variant={confirmAction?.status === "verified" ? "default" : "danger"}
        loading={updateStatus.isPending}
        onConfirm={() => {
          if (!confirmAction) return
          updateStatus.mutate(
            { id: confirmAction.id, status: confirmAction.status },
            { onSuccess: () => setConfirmAction(null) }
          )
        }}
      />
    </AnimatedPage>
  )
}
