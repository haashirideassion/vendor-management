import { useState, useEffect } from "react"
import { useSearchParams, Link } from "react-router-dom"
import { useGRNs, useUpdateGRNStatus } from "@/hooks/useGRNs"
import { useServiceConfirmations, useUpdateServiceConfirmationStatus } from "@/hooks/useServiceConfirmations"
import { usePermissions } from "@/hooks/usePermissions"
import { usePendingApprovals, useReviewApproval } from "@/hooks/useApprovalWorkflow"
import { useOrg } from "@/contexts/OrgContext"
import { usePagination } from "@/hooks/usePagination"
import { AnimatedPage } from "@/components/shared/AnimatedPage"
import { PaginationBar } from "@/components/shared/PaginationBar"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { CreateGRNDialog } from "@/components/shared/CreateGRNDialog"
import { CreateServiceConfirmationDialog } from "@/components/shared/CreateServiceConfirmationDialog"
import { AttachmentList } from "@/components/shared/AttachmentList"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { GRN_STATUS_LABELS, GRN_STATUS_COLORS, SERVICE_CONFIRMATION_STATUS_LABELS, SERVICE_CONFIRMATION_STATUS_COLORS } from "@/lib/constants"
import type { GRNStatus, ServiceConfirmationStatus } from "@/lib/types"
import { format } from "date-fns"
import { Add01Icon, Cancel01Icon, CheckmarkCircle01Icon, File01Icon, EyeIcon } from "@/components/shared/SolarIcon"
import { SolarDuotoneIcon } from "@/components/shared/SolarIcon"
import { toast } from "sonner"

const GRN_STATUSES: GRNStatus[] = ["pending_approval", "draft", "submitted", "verified", "rejected"]
const SC_STATUSES: ServiceConfirmationStatus[] = ["pending_approval", "draft", "submitted", "verified", "rejected"]

// GRNs and Service Confirmations are the same concept (proof of delivery
// gating the invoice's 3-way match) split only by fulfillment_type (goods vs.
// service, migration 072) -- one module with a tab per type, rather than two
// separate nav entries, matches how a user actually thinks about them.
function GRNsTab({ defaultPOId }: { defaultPOId?: string }) {
  const [status, setStatus] = useState<GRNStatus | "">("")
  const [creating, setCreating] = useState(false)
  const [confirmAction, setConfirmAction] = useState<{ id: string; status: "verified" | "rejected" } | null>(null)
  const [notes, setNotes] = useState("")
  const [docsGRNId, setDocsGRNId] = useState<string | null>(null)
  const [gateAction, setGateAction] = useState<{ id: string; decision: "approved" | "rejected" } | null>(null)
  const [gateNotes, setGateNotes] = useState("")

  const { canRecordGRN } = usePermissions()
  const { activeOrg } = useOrg()
  const isManagerOrAdminViewer = !!activeOrg?.roleNames.some((r) => r === "Manager" || r === "Admin")
  const { data: grns = [], isLoading } = useGRNs({ status: status || undefined })
  const updateStatus = useUpdateGRNStatus()
  const { data: pendingApprovals = [] } = usePendingApprovals("grn")
  const reviewApproval = useReviewApproval()
  const approvalIdByGrn = new Map(pendingApprovals.map((a) => [a.entity_id, a.id]))

  async function handleGateDecision() {
    if (!gateAction) return
    const approvalId = approvalIdByGrn.get(gateAction.id)
    if (!approvalId) return
    if (gateAction.decision === "rejected" && !gateNotes.trim()) return
    try {
      await reviewApproval.mutateAsync({
        id: approvalId, status: gateAction.decision, notes: gateNotes.trim() || undefined,
        entityType: "grn", entityId: gateAction.id,
      })
      if (gateAction.decision === "approved") {
        await updateStatus.mutateAsync({ id: gateAction.id, status: "submitted" })
      }
      toast.success(gateAction.decision === "approved" ? "GRN approved" : "GRN returned to its creator")
      setGateAction(null); setGateNotes("")
    } catch (e: unknown) {
      toast.error((e as Error).message ?? "Failed to update GRN")
    }
  }

  const { page, setPage, totalPages, totalItems, paginated, reset } = usePagination(grns, 10)
  useEffect(() => { reset() }, [status])

  return (
    <div className="flex-1 flex flex-col min-h-0 pt-4 gap-4">
      <div className="shrink-0 flex flex-wrap items-center gap-3 p-4 rounded-xl border bg-card">
        <Select value={status || "all"} onValueChange={(v) => setStatus(v === "all" ? "" : v as GRNStatus)}>
          <SelectTrigger className="w-44 h-9 text-sm"><SelectValue placeholder="All statuses" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {GRN_STATUSES.map((s) => <SelectItem key={s} value={s}>{GRN_STATUS_LABELS[s]}</SelectItem>)}
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
                  <TableCell>
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium border ${GRN_STATUS_COLORS[grn.status as GRNStatus]}`}>
                      {GRN_STATUS_LABELS[grn.status as GRNStatus]}
                    </span>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      {grn.status === "pending_approval" && isManagerOrAdminViewer && (
                        <>
                          <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-green-600 hover:text-green-800 hover:bg-green-50" onClick={() => setGateAction({ id: grn.id, decision: "approved" })}>
                            Approve
                          </Button>
                          <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-destructive hover:bg-destructive/8" onClick={() => setGateAction({ id: grn.id, decision: "rejected" })}>
                            Reject
                          </Button>
                        </>
                      )}
                      {grn.status === "submitted" && canRecordGRN && (
                        <>
                          <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-green-600 hover:text-green-800 hover:bg-green-50" onClick={() => setConfirmAction({ id: grn.id, status: "verified" })}>
                            <SolarDuotoneIcon icon={CheckmarkCircle01Icon} size={13} strokeWidth={1.5} />
                          </Button>
                          <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-destructive hover:bg-destructive/8" onClick={() => setConfirmAction({ id: grn.id, status: "rejected" })}>
                            <SolarDuotoneIcon icon={Cancel01Icon} size={13} strokeWidth={1.5} />
                          </Button>
                        </>
                      )}
                      {grn.status === "draft" && (
                        <Button
                          size="sm" variant="ghost" className="h-7 px-2 text-xs"
                          onClick={() => updateStatus.mutate(
                            { id: grn.id, status: "submitted", silent: true },
                            {
                              onSuccess: () => toast.success("GRN submitted for review."),
                              onError: () => toast.error("Failed to submit GRN. Please try again."),
                            }
                          )}
                        >
                          Submit
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" className="h-7 px-2 gap-1.5 text-xs text-muted-foreground" onClick={() => setDocsGRNId(grn.id)}>
                        <SolarDuotoneIcon icon={File01Icon} size={13} strokeWidth={1.5} />
                        <span>Document</span>
                      </Button>
                      <Button asChild size="sm" variant="ghost" className="h-7 px-2 gap-1.5 text-xs text-muted-foreground">
                        <Link to={`/admin/grns/${grn.id}`}>
                          <SolarDuotoneIcon icon={EyeIcon} size={13} strokeWidth={1.5} />
                          <span>View</span>
                        </Link>
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <PaginationBar page={page} totalPages={totalPages} totalItems={totalItems} onPageChange={setPage} itemLabel="GRN" />

      <CreateGRNDialog open={creating} onOpenChange={setCreating} defaultPOId={defaultPOId} />

      <Dialog open={!!docsGRNId} onOpenChange={(o) => !o && setDocsGRNId(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>GRN Attachments</DialogTitle></DialogHeader>
          {docsGRNId && (
            <AttachmentList entityType="grn" entityId={docsGRNId} canDelete={canRecordGRN} canUpload={false} className="pt-2" />
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!gateAction} onOpenChange={(o) => { if (!o) { setGateAction(null); setGateNotes("") } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{gateAction?.decision === "approved" ? "Approve GRN" : "Reject GRN"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pt-2">
            <Textarea
              placeholder={gateAction?.decision === "approved" ? "Notes (optional)…" : "Reason for rejection…"}
              value={gateNotes}
              onChange={(e) => setGateNotes(e.target.value)}
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setGateAction(null); setGateNotes("") }} disabled={reviewApproval.isPending || updateStatus.isPending}>
              Cancel
            </Button>
            <Button
              variant={gateAction?.decision === "approved" ? "default" : "danger"}
              disabled={reviewApproval.isPending || updateStatus.isPending || (gateAction?.decision === "rejected" && !gateNotes.trim())}
              onClick={handleGateDecision}
            >
              {reviewApproval.isPending || updateStatus.isPending ? "Processing…" : gateAction?.decision === "approved" ? "Approve" : "Reject"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!confirmAction} onOpenChange={(o) => { if (!o) { setConfirmAction(null); setNotes("") } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{confirmAction?.status === "verified" ? "Verify GRN" : "Reject GRN"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pt-2">
            <p className="text-sm text-muted-foreground">
              {confirmAction?.status === "verified"
                ? "Are you sure you want to verify this goods receipt?"
                : "Are you sure you want to reject this goods receipt? The vendor will need to resubmit."}
            </p>
            <Textarea
              placeholder={confirmAction?.status === "verified" ? "Remarks (optional)…" : "Reason for rejection…"}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setConfirmAction(null); setNotes("") }} disabled={updateStatus.isPending}>
              Cancel
            </Button>
            <Button
              variant={confirmAction?.status === "verified" ? "default" : "danger"}
              disabled={updateStatus.isPending}
              onClick={() => {
                if (!confirmAction) return
                updateStatus.mutate(
                  { id: confirmAction.id, status: confirmAction.status, notes },
                  { onSuccess: () => { setConfirmAction(null); setNotes("") } }
                )
              }}
            >
              {updateStatus.isPending ? "Processing…" : confirmAction?.status === "verified" ? "Verify" : "Reject"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function ServiceConfirmationsTab({ defaultPOId }: { defaultPOId?: string }) {
  const [status, setStatus] = useState<ServiceConfirmationStatus | "">("")
  const [creating, setCreating] = useState(false)
  const [confirmAction, setConfirmAction] = useState<{ id: string; status: "verified" | "rejected" } | null>(null)
  const [notes, setNotes] = useState("")
  const [docsSCId, setDocsSCId] = useState<string | null>(null)
  const [gateAction, setGateAction] = useState<{ id: string; decision: "approved" | "rejected" } | null>(null)
  const [gateNotes, setGateNotes] = useState("")

  const { canRecordServiceConfirmation } = usePermissions()
  const { activeOrg } = useOrg()
  const isManagerOrAdminViewer = !!activeOrg?.roleNames.some((r) => r === "Manager" || r === "Admin")
  const { data: confirmations = [], isLoading } = useServiceConfirmations({ status: status || undefined })
  const updateStatus = useUpdateServiceConfirmationStatus()
  const { data: pendingApprovals = [] } = usePendingApprovals("service_confirmation")
  const reviewApproval = useReviewApproval()
  const approvalIdBySC = new Map(pendingApprovals.map((a) => [a.entity_id, a.id]))

  async function handleGateDecision() {
    if (!gateAction) return
    const approvalId = approvalIdBySC.get(gateAction.id)
    if (!approvalId) return
    if (gateAction.decision === "rejected" && !gateNotes.trim()) return
    try {
      await reviewApproval.mutateAsync({
        id: approvalId, status: gateAction.decision, notes: gateNotes.trim() || undefined,
        entityType: "service_confirmation", entityId: gateAction.id,
      })
      if (gateAction.decision === "approved") {
        await updateStatus.mutateAsync({ id: gateAction.id, status: "submitted" })
      }
      toast.success(gateAction.decision === "approved" ? "Service Confirmation approved" : "Returned to its creator")
      setGateAction(null); setGateNotes("")
    } catch (e: unknown) {
      toast.error((e as Error).message ?? "Failed to update Service Confirmation")
    }
  }

  const { page, setPage, totalPages, totalItems, paginated, reset } = usePagination(confirmations, 10)
  useEffect(() => { reset() }, [status])

  return (
    <div className="flex-1 flex flex-col min-h-0 pt-4 gap-4">
      <div className="shrink-0 flex flex-wrap items-center gap-3 p-4 rounded-xl border bg-card">
        <Select value={status || "all"} onValueChange={(v) => setStatus(v === "all" ? "" : v as ServiceConfirmationStatus)}>
          <SelectTrigger className="w-44 h-9 text-sm"><SelectValue placeholder="All statuses" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {SC_STATUSES.map((s) => <SelectItem key={s} value={s}>{SERVICE_CONFIRMATION_STATUS_LABELS[s]}</SelectItem>)}
          </SelectContent>
        </Select>
        {status && (
          <Button variant="ghost" size="sm" className="h-9 gap-1.5 text-muted-foreground" onClick={() => setStatus("")}>
            <SolarDuotoneIcon icon={Cancel01Icon} size={13} strokeWidth={1.5} />
            Clear
          </Button>
        )}
        {canRecordServiceConfirmation && (
          <Button size="sm" className="h-8 gap-1.5 text-xs ml-auto" onClick={() => setCreating(true)}>
            <SolarDuotoneIcon icon={Add01Icon} size={14} strokeWidth={2} primaryColor="currentColor" secondaryColor="currentColor" />
            Record Confirmation
          </Button>
        )}
      </div>

      <div className="flex-1 min-h-0 overflow-auto rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40 hover:bg-muted/40">
              <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Confirmation Number</TableHead>
              <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">PO</TableHead>
              <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Vendor</TableHead>
              <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Confirmed</TableHead>
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
            ) : confirmations.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-12">
                  <p className="text-sm font-medium text-muted-foreground">No Service Confirmations found</p>
                </TableCell>
              </TableRow>
            ) : (
              paginated.map((sc, idx) => (
                <TableRow key={sc.id} className={`transition-colors hover:bg-accent/50 ${idx % 2 !== 0 ? "bg-muted/20" : ""}`}>
                  <TableCell>
                    <span className="font-mono text-xs bg-muted border border-border/70 rounded px-1.5 py-0.5">
                      {sc.confirmation_number ?? "—"}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm text-muted-foreground">{sc.purchase_order?.po_number ?? "—"}</span>
                  </TableCell>
                  <TableCell><p className="text-sm">{sc.vendor?.company_name ?? "—"}</p></TableCell>
                  <TableCell>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {format(new Date(sc.confirmed_date), "dd MMM yyyy")}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium border ${SERVICE_CONFIRMATION_STATUS_COLORS[sc.status as ServiceConfirmationStatus]}`}>
                      {SERVICE_CONFIRMATION_STATUS_LABELS[sc.status as ServiceConfirmationStatus]}
                    </span>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      {sc.status === "pending_approval" && isManagerOrAdminViewer && (
                        <>
                          <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-green-600 hover:text-green-800 hover:bg-green-50" onClick={() => setGateAction({ id: sc.id, decision: "approved" })}>
                            Approve
                          </Button>
                          <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-destructive hover:bg-destructive/8" onClick={() => setGateAction({ id: sc.id, decision: "rejected" })}>
                            Reject
                          </Button>
                        </>
                      )}
                      {sc.status === "submitted" && canRecordServiceConfirmation && (
                        <>
                          <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-green-600 hover:text-green-800 hover:bg-green-50" onClick={() => setConfirmAction({ id: sc.id, status: "verified" })}>
                            <SolarDuotoneIcon icon={CheckmarkCircle01Icon} size={13} strokeWidth={1.5} />
                          </Button>
                          <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-destructive hover:bg-destructive/8" onClick={() => setConfirmAction({ id: sc.id, status: "rejected" })}>
                            <SolarDuotoneIcon icon={Cancel01Icon} size={13} strokeWidth={1.5} />
                          </Button>
                        </>
                      )}
                      {sc.status === "draft" && (
                        <Button
                          size="sm" variant="ghost" className="h-7 px-2 text-xs"
                          onClick={() => updateStatus.mutate(
                            { id: sc.id, status: "submitted", silent: true },
                            {
                              onSuccess: () => toast.success("Service Confirmation submitted for review."),
                              onError: () => toast.error("Failed to submit. Please try again."),
                            }
                          )}
                        >
                          Submit
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" className="h-7 px-2 gap-1.5 text-xs text-muted-foreground" onClick={() => setDocsSCId(sc.id)}>
                        <SolarDuotoneIcon icon={File01Icon} size={13} strokeWidth={1.5} />
                        <span>Document</span>
                      </Button>
                      <Button asChild size="sm" variant="ghost" className="h-7 px-2 gap-1.5 text-xs text-muted-foreground">
                        <Link to={`/admin/service-confirmations/${sc.id}`}>
                          <SolarDuotoneIcon icon={EyeIcon} size={13} strokeWidth={1.5} />
                          <span>View</span>
                        </Link>
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <PaginationBar page={page} totalPages={totalPages} totalItems={totalItems} onPageChange={setPage} itemLabel="Service Confirmation" />

      <CreateServiceConfirmationDialog open={creating} onOpenChange={setCreating} defaultPOId={defaultPOId} />

      <Dialog open={!!docsSCId} onOpenChange={(o) => !o && setDocsSCId(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Service Confirmation Attachments</DialogTitle></DialogHeader>
          {docsSCId && (
            <AttachmentList entityType="service_confirmation" entityId={docsSCId} canDelete={canRecordServiceConfirmation} canUpload={false} className="pt-2" />
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!gateAction} onOpenChange={(o) => { if (!o) { setGateAction(null); setGateNotes("") } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{gateAction?.decision === "approved" ? "Approve Service Confirmation" : "Reject Service Confirmation"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pt-2">
            <Textarea
              placeholder={gateAction?.decision === "approved" ? "Notes (optional)…" : "Reason for rejection…"}
              value={gateNotes}
              onChange={(e) => setGateNotes(e.target.value)}
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setGateAction(null); setGateNotes("") }} disabled={reviewApproval.isPending || updateStatus.isPending}>
              Cancel
            </Button>
            <Button
              variant={gateAction?.decision === "approved" ? "default" : "danger"}
              disabled={reviewApproval.isPending || updateStatus.isPending || (gateAction?.decision === "rejected" && !gateNotes.trim())}
              onClick={handleGateDecision}
            >
              {reviewApproval.isPending || updateStatus.isPending ? "Processing…" : gateAction?.decision === "approved" ? "Approve" : "Reject"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!confirmAction} onOpenChange={(o) => { if (!o) { setConfirmAction(null); setNotes("") } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{confirmAction?.status === "verified" ? "Verify Service Confirmation" : "Reject Service Confirmation"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pt-2">
            <p className="text-sm text-muted-foreground">
              {confirmAction?.status === "verified"
                ? "Are you sure you want to verify this service confirmation?"
                : "Are you sure you want to reject this service confirmation? The vendor will need to resubmit."}
            </p>
            <Textarea
              placeholder={confirmAction?.status === "verified" ? "Remarks (optional)…" : "Reason for rejection…"}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setConfirmAction(null); setNotes("") }} disabled={updateStatus.isPending}>
              Cancel
            </Button>
            <Button
              variant={confirmAction?.status === "verified" ? "default" : "danger"}
              disabled={updateStatus.isPending}
              onClick={() => {
                if (!confirmAction) return
                updateStatus.mutate(
                  { id: confirmAction.id, status: confirmAction.status, notes },
                  { onSuccess: () => { setConfirmAction(null); setNotes("") } }
                )
              }}
            >
              {updateStatus.isPending ? "Processing…" : confirmAction?.status === "verified" ? "Verify" : "Reject"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export function GRNList() {
  const [searchParams, setSearchParams] = useSearchParams()
  const defaultPOId = searchParams.get("po_id") ?? undefined
  const tabParam = searchParams.get("tab") === "service-confirmations" ? "service-confirmations" : "grns"

  return (
    <AnimatedPage>
      <Tabs value={tabParam} onValueChange={(v) => setSearchParams(v === "grns" ? {} : { tab: v }, { replace: true })} className="flex-1 flex flex-col min-h-0">
        <TabsList className="h-9 shrink-0">
          <TabsTrigger value="grns" className="text-sm">GRNs</TabsTrigger>
          <TabsTrigger value="service-confirmations" className="text-sm">Service Confirmations</TabsTrigger>
        </TabsList>
        <TabsContent value="grns" className="flex-1 min-h-0 flex flex-col mt-0">
          <GRNsTab defaultPOId={defaultPOId} />
        </TabsContent>
        <TabsContent value="service-confirmations" className="flex-1 min-h-0 flex flex-col mt-0">
          <ServiceConfirmationsTab defaultPOId={defaultPOId} />
        </TabsContent>
      </Tabs>
    </AnimatedPage>
  )
}
