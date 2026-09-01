import { useState } from "react"
import { useParams, Link } from "react-router-dom"
import { useGRN, useUpdateGRNStatus } from "@/hooks/useGRNs"
import { RateVendorDialog } from "@/components/shared/RateVendorDialog"
import { useApprovalRequests, useReviewApproval } from "@/hooks/useApprovalWorkflow"
import { usePermissions } from "@/hooks/usePermissions"
import { useOrg } from "@/contexts/OrgContext"
import { AnimatedPage } from "@/components/shared/AnimatedPage"
import { AttachmentList } from "@/components/shared/AttachmentList"
import { TaxComponentsDisplay } from "@/components/shared/TaxComponentsDisplay"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Separator } from "@/components/ui/separator"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { GRN_STATUS_LABELS, GRN_STATUS_COLORS } from "@/lib/constants"
import { formatCurrency } from "@/lib/utils"
import { format } from "date-fns"
import { ArrowLeft01Icon } from "@/components/shared/SolarIcon"
import { SolarDuotoneIcon } from "@/components/shared/SolarIcon"
import { toast } from "sonner"
import type { GRNStatus } from "@/lib/types"

export function GRNDetail() {
  const { id } = useParams<{ id: string }>()

  const [gateDecision, setGateDecision] = useState<"approved" | "rejected" | null>(null)
  const [gateNotes, setGateNotes] = useState("")
  const [confirmAction, setConfirmAction] = useState<"verified" | "rejected" | null>(null)
  const [notes, setNotes] = useState("")
  // Keyed by line item id -- only lines the reviewer actually marks with a
  // qty > 0 get sent as rejected; the rest of the delivery is left alone.
  const [rejectLines, setRejectLines] = useState<Record<string, { qty: string; reason: string }>>({})
  const [goodCondition, setGoodCondition] = useState(false)
  const [showRateDialog, setShowRateDialog] = useState(false)

  const { data: grn, isLoading } = useGRN(id!)
  const { data: approvalRequests = [] } = useApprovalRequests("grn", id!)
  const pendingApproval = approvalRequests.find((a) => a.status === "pending")
  const { canRecordGRN, canRateVendors } = usePermissions()
  const { activeOrg } = useOrg()
  const isManagerOrAdminViewer = !!activeOrg?.roleNames.some((r) => r === "Manager" || r === "Admin")

  const updateStatus = useUpdateGRNStatus()
  const reviewApproval = useReviewApproval()

  async function handleGateDecision() {
    if (!gateDecision || !pendingApproval || !id) return
    if (gateDecision === "rejected" && !gateNotes.trim()) return
    try {
      await reviewApproval.mutateAsync({
        id: pendingApproval.id, status: gateDecision, notes: gateNotes.trim() || undefined,
        entityType: "grn", entityId: id,
      })
      if (gateDecision === "approved") {
        await updateStatus.mutateAsync({ id, status: "submitted", silent: true })
      }
      toast.success(gateDecision === "approved" ? "GRN approved" : "GRN returned to its creator")
      setGateDecision(null); setGateNotes("")
    } catch (e: unknown) {
      toast.error((e as Error).message ?? "Failed to update GRN")
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

  if (!grn) {
    return (
      <AnimatedPage>
        <div className="p-6"><p className="text-sm text-muted-foreground">GRN not found.</p></div>
      </AnimatedPage>
    )
  }

  const lineTotal = (grn.line_items ?? []).reduce(
    (sum, li) => sum + li.quantity_received * li.unit_price * (1 + (li.tax_rate ?? 0) / 100),
    0
  )

  // Only lines with a qty > 0 actually count as rejected -- a reviewer isn't
  // forced to mark every line, just the ones that were short/damaged/wrong.
  const rejectedEntries = Object.entries(rejectLines).filter(([, v]) => Number(v.qty) > 0)
  const canSubmitConfirmAction = confirmAction === "verified"
    ? goodCondition
    : confirmAction === "rejected"
      ? rejectedEntries.length > 0 && rejectedEntries.every(([, v]) => v.reason.trim().length > 0)
      : false

  return (
    <AnimatedPage>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div>
          <Link to="/admin/grns" className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground mb-3">
            <SolarDuotoneIcon icon={ArrowLeft01Icon} size={13} strokeWidth={1.5} />
            GRNs
          </Link>
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-xl font-bold tracking-tight font-mono">{grn.grn_number ?? "Draft GRN"}</h1>
              <p className="text-sm text-muted-foreground mt-0.5">
                {grn.vendor?.company_name}
                {grn.purchase_order?.po_number && ` · PO ${grn.purchase_order.po_number}`}
              </p>
            </div>
            <span className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-xs font-medium border ${GRN_STATUS_COLORS[grn.status as GRNStatus]}`}>
              {GRN_STATUS_LABELS[grn.status as GRNStatus]}
            </span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-wrap gap-2">
          {grn.status === "pending_approval" && isManagerOrAdminViewer && pendingApproval && (
            <>
              <Button size="sm" variant="success" onClick={() => setGateDecision("approved")}>
                Approve
              </Button>
              <Button size="sm" variant="danger" onClick={() => setGateDecision("rejected")}>
                Reject
              </Button>
            </>
          )}
          {grn.status === "submitted" && canRecordGRN && (
            <>
              <Button size="sm" variant="success" onClick={() => setConfirmAction("verified")}>
                Verify
              </Button>
              <Button
                size="sm"
                variant="danger"
                onClick={() => {
                  setRejectLines(Object.fromEntries((grn.line_items ?? []).map((li) => [li.id, { qty: "", reason: "" }])))
                  setConfirmAction("rejected")
                }}
              >
                Reject
              </Button>
            </>
          )}
          {grn.status === "draft" && (
            <Button
              size="sm"
              onClick={() => updateStatus.mutate(
                { id: grn.id, status: "submitted" },
                {
                  onSuccess: () => toast.success("GRN submitted for review."),
                  onError: () => toast.error("Failed to submit GRN. Please try again."),
                }
              )}
              disabled={updateStatus.isPending}
            >
              Submit
            </Button>
          )}
          {grn.status === "verified" && canRateVendors && (
            <Button size="sm" variant="outline" onClick={() => setShowRateDialog(true)}>
              Rate Vendor
            </Button>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* GRN Details */}
          <Card className="md:col-span-2">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold">Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">Vendor</p>
                  <p className="font-medium">{grn.vendor?.company_name ?? "—"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">Purchase Order</p>
                  {grn.po_id ? (
                    <Link to={`/admin/purchase-orders/${grn.po_id}`} className="font-medium text-primary hover:underline">
                      {grn.purchase_order?.po_number ?? "View PO"}
                    </Link>
                  ) : (
                    <p className="font-medium">—</p>
                  )}
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">Team</p>
                  <p className="font-medium">{grn.team?.name ?? "—"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">Received Date</p>
                  <p className="font-medium">{format(new Date(grn.received_date), "dd MMM yyyy")}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">Verified</p>
                  <p className="font-medium">{grn.verified_at ? format(new Date(grn.verified_at), "dd MMM yyyy") : "—"}</p>
                </div>
                {grn.notes && (
                  <div className="col-span-2">
                    <p className="text-xs text-muted-foreground mb-0.5">Notes</p>
                    <p className="font-medium whitespace-pre-wrap">{grn.notes}</p>
                  </div>
                )}
              </div>

              {/* Line items */}
              {(grn.line_items ?? []).length > 0 && (
                <>
                  <Separator />
                  <div>
                    <p className="text-xs text-muted-foreground mb-3 font-semibold uppercase tracking-wide">Line Items</p>
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/30 hover:bg-muted/30">
                          <TableHead className="text-xs text-muted-foreground">Description</TableHead>
                          <TableHead className="text-xs text-muted-foreground text-right">Qty Received</TableHead>
                          <TableHead className="text-xs text-muted-foreground text-right">Rate</TableHead>
                          <TableHead className="text-xs text-muted-foreground text-right">Tax %</TableHead>
                          <TableHead className="text-xs text-muted-foreground text-right">Unit</TableHead>
                          <TableHead className="text-xs text-muted-foreground text-right">Total</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(grn.line_items ?? []).map((li) => (
                          <TableRow key={li.id}>
                            <TableCell className="text-sm">
                              {li.description}
                              {li.rejected_quantity != null && li.rejected_quantity > 0 && (
                                <p className="text-xs text-destructive mt-0.5">
                                  Rejected {li.rejected_quantity}{li.unit ? ` ${li.unit}` : ""}
                                  {li.rejection_reason ? ` — ${li.rejection_reason}` : ""}
                                </p>
                              )}
                            </TableCell>
                            <TableCell className="text-sm text-right tabular-nums">{li.quantity_received}</TableCell>
                            <TableCell className="text-sm text-right tabular-nums">{formatCurrency(li.unit_price)}</TableCell>
                            <TableCell className="text-sm text-right text-muted-foreground">
                              <TaxComponentsDisplay taxRate={li.tax_rate} components={li.tax_components} />
                            </TableCell>
                            <TableCell className="text-sm text-right text-muted-foreground">{li.unit ?? "—"}</TableCell>
                            <TableCell className="text-sm text-right font-medium tabular-nums">
                              {formatCurrency(li.quantity_received * li.unit_price * (1 + (li.tax_rate ?? 0) / 100))}
                            </TableCell>
                          </TableRow>
                        ))}
                        <TableRow className="bg-muted/20">
                          <TableCell colSpan={5} className="text-sm font-semibold text-right">Total</TableCell>
                          <TableCell className="text-sm font-semibold text-right tabular-nums">{formatCurrency(lineTotal)}</TableCell>
                        </TableRow>
                      </TableBody>
                    </Table>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>

        <AttachmentList
          entityType="grn"
          entityId={grn.id}
          canDelete={canRecordGRN}
          canUpload={false}
        />
      </div>

      <Dialog open={!!gateDecision} onOpenChange={(o) => { if (!o) { setGateDecision(null); setGateNotes("") } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{gateDecision === "approved" ? "Approve GRN" : "Reject GRN"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pt-2">
            <Textarea
              placeholder={gateDecision === "approved" ? "Notes (optional)…" : "Reason for rejection…"}
              value={gateNotes}
              onChange={(e) => setGateNotes(e.target.value)}
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setGateDecision(null); setGateNotes("") }} disabled={reviewApproval.isPending || updateStatus.isPending}>
              Cancel
            </Button>
            <Button
              variant={gateDecision === "approved" ? "success" : "danger"}
              disabled={reviewApproval.isPending || updateStatus.isPending || (gateDecision === "rejected" && !gateNotes.trim())}
              onClick={handleGateDecision}
            >
              {reviewApproval.isPending || updateStatus.isPending ? "Processing…" : gateDecision === "approved" ? "Approve" : "Reject"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!confirmAction}
        onOpenChange={(o) => { if (!o) { setConfirmAction(null); setNotes(""); setRejectLines({}); setGoodCondition(false) } }}
      >
        <DialogContent size={confirmAction === "rejected" ? "lg" : "md"}>
          <DialogHeader>
            <DialogTitle>{confirmAction === "verified" ? "Verify GRN" : "Reject GRN"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pt-2">
            {confirmAction === "verified" ? (
              <>
                <p className="text-sm text-muted-foreground">
                  Are you sure you want to verify this goods receipt?
                </p>
                <label className="flex items-start gap-2 rounded-lg border border-border/60 p-3 text-sm">
                  <Checkbox checked={goodCondition} onCheckedChange={(c) => setGoodCondition(c === true)} className="mt-0.5" />
                  <span>I confirm all received quantities have been checked and are in good, acceptable condition.</span>
                </label>
                <Textarea
                  placeholder="Remarks (optional)…"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                />
              </>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">
                  Mark the quantity of each line item that's being rejected and why. The vendor will need to resubmit.
                </p>
                <div className="space-y-2">
                  {(grn.line_items ?? []).map((li) => (
                    <div key={li.id} className="grid grid-cols-[1fr_6.5rem_1fr] gap-2 items-start rounded-lg border border-border/60 p-2.5">
                      <div>
                        <p className="text-sm font-medium">{li.description}</p>
                        <p className="text-xs text-muted-foreground">Received: {li.quantity_received}{li.unit ? ` ${li.unit}` : ""}</p>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[11px] text-muted-foreground">Qty Rejected</Label>
                        <Input
                          type="number" min={0} max={li.quantity_received} step="any"
                          value={rejectLines[li.id]?.qty ?? ""}
                          onChange={(e) => setRejectLines((prev) => ({ ...prev, [li.id]: { qty: e.target.value, reason: prev[li.id]?.reason ?? "" } }))}
                          placeholder="0"
                          className="h-8 text-xs"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[11px] text-muted-foreground">Reason</Label>
                        <Input
                          value={rejectLines[li.id]?.reason ?? ""}
                          onChange={(e) => setRejectLines((prev) => ({ ...prev, [li.id]: { qty: prev[li.id]?.qty ?? "", reason: e.target.value } }))}
                          placeholder="e.g. damaged in transit"
                          className="h-8 text-xs"
                        />
                      </div>
                    </div>
                  ))}
                </div>
                <Textarea
                  placeholder="Additional remarks (optional)…"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                />
              </>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => { setConfirmAction(null); setNotes(""); setRejectLines({}); setGoodCondition(false) }}
              disabled={updateStatus.isPending}
            >
              Cancel
            </Button>
            <Button
              variant={confirmAction === "verified" ? "success" : "danger"}
              disabled={updateStatus.isPending || !canSubmitConfirmAction}
              onClick={() => {
                if (!confirmAction || !id) return
                if (confirmAction === "rejected") {
                  const line_items = rejectedEntries.map(([liId, v]) => ({
                    id: liId, rejected_quantity: Number(v.qty), rejection_reason: v.reason.trim(),
                  }))
                  updateStatus.mutate(
                    { id, status: "rejected", notes, line_items },
                    { onSuccess: () => { setConfirmAction(null); setNotes(""); setRejectLines({}) } }
                  )
                } else {
                  updateStatus.mutate(
                    { id, status: "verified", notes, confirmed_good_condition: goodCondition },
                    { onSuccess: () => { setConfirmAction(null); setNotes(""); setGoodCondition(false) } }
                  )
                }
              }}
            >
              {updateStatus.isPending ? "Processing…" : confirmAction === "verified" ? "Verify" : "Reject"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <RateVendorDialog
        open={showRateDialog}
        onOpenChange={setShowRateDialog}
        vendorId={grn.vendor_id}
        vendorName={grn.vendor?.company_name}
      />
    </AnimatedPage>
  )
}
