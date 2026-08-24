import { useState } from "react"
import { useParams, Link } from "react-router-dom"
import { useServiceConfirmation, useUpdateServiceConfirmationStatus } from "@/hooks/useServiceConfirmations"
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
import { SERVICE_CONFIRMATION_STATUS_LABELS, SERVICE_CONFIRMATION_STATUS_COLORS } from "@/lib/constants"
import { formatCurrency } from "@/lib/utils"
import { format } from "date-fns"
import { ArrowLeft01Icon } from "@/components/shared/SolarIcon"
import { SolarDuotoneIcon } from "@/components/shared/SolarIcon"
import { toast } from "sonner"
import type { ServiceConfirmationStatus } from "@/lib/types"

export function ServiceConfirmationDetail() {
  const { id } = useParams<{ id: string }>()

  const [gateDecision, setGateDecision] = useState<"approved" | "rejected" | null>(null)
  const [gateNotes, setGateNotes] = useState("")
  const [confirmAction, setConfirmAction] = useState<"verified" | "rejected" | null>(null)
  const [notes, setNotes] = useState("")
  const [showRateDialog, setShowRateDialog] = useState(false)

  const { data: sc, isLoading } = useServiceConfirmation(id!)
  const { data: approvalRequests = [] } = useApprovalRequests("service_confirmation", id!)
  const pendingApproval = approvalRequests.find((a) => a.status === "pending")
  const { canRecordServiceConfirmation, canRateVendors } = usePermissions()
  const { activeOrg } = useOrg()
  const isManagerOrAdminViewer = !!activeOrg?.roleNames.some((r) => r === "Manager" || r === "Admin")

  const updateStatus = useUpdateServiceConfirmationStatus()
  const reviewApproval = useReviewApproval()

  async function handleGateDecision() {
    if (!gateDecision || !pendingApproval || !id) return
    if (gateDecision === "rejected" && !gateNotes.trim()) return
    try {
      await reviewApproval.mutateAsync({
        id: pendingApproval.id, status: gateDecision, notes: gateNotes.trim() || undefined,
        entityType: "service_confirmation", entityId: id,
      })
      if (gateDecision === "approved") {
        await updateStatus.mutateAsync({ id, status: "submitted", silent: true })
      }
      toast.success(gateDecision === "approved" ? "Service Confirmation approved" : "Returned to its creator")
      setGateDecision(null); setGateNotes("")
    } catch (e: unknown) {
      toast.error((e as Error).message ?? "Failed to update Service Confirmation")
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

  if (!sc) {
    return (
      <AnimatedPage>
        <div className="p-6"><p className="text-sm text-muted-foreground">Service Confirmation not found.</p></div>
      </AnimatedPage>
    )
  }

  const lineTotal = (sc.line_items ?? []).reduce(
    (sum, li) => sum + li.quantity_confirmed * li.unit_price * (1 + (li.tax_rate ?? 0) / 100),
    0
  )

  return (
    <AnimatedPage>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div>
          <Link to="/admin/grns?tab=service-confirmations" className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground mb-3">
            <SolarDuotoneIcon icon={ArrowLeft01Icon} size={13} strokeWidth={1.5} />
            Service Confirmations
          </Link>
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-xl font-bold tracking-tight font-mono">{sc.confirmation_number ?? "Draft Confirmation"}</h1>
              <p className="text-sm text-muted-foreground mt-0.5">
                {sc.vendor?.company_name}
                {sc.purchase_order?.po_number && ` · PO ${sc.purchase_order.po_number}`}
              </p>
            </div>
            <span className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-xs font-medium border ${SERVICE_CONFIRMATION_STATUS_COLORS[sc.status as ServiceConfirmationStatus]}`}>
              {SERVICE_CONFIRMATION_STATUS_LABELS[sc.status as ServiceConfirmationStatus]}
            </span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-wrap gap-2">
          {sc.status === "pending_approval" && isManagerOrAdminViewer && pendingApproval && (
            <>
              <Button size="sm" variant="success" onClick={() => setGateDecision("approved")}>
                Approve
              </Button>
              <Button size="sm" variant="danger" onClick={() => setGateDecision("rejected")}>
                Reject
              </Button>
            </>
          )}
          {sc.status === "submitted" && canRecordServiceConfirmation && (
            <>
              <Button size="sm" variant="success" onClick={() => setConfirmAction("verified")}>
                Verify
              </Button>
              <Button size="sm" variant="danger" onClick={() => setConfirmAction("rejected")}>
                Reject
              </Button>
            </>
          )}
          {sc.status === "draft" && (
            <Button
              size="sm"
              onClick={() => updateStatus.mutate(
                { id: sc.id, status: "submitted" },
                {
                  onSuccess: () => toast.success("Service Confirmation submitted for review."),
                  onError: () => toast.error("Failed to submit. Please try again."),
                }
              )}
              disabled={updateStatus.isPending}
            >
              Submit
            </Button>
          )}
          {sc.status === "verified" && canRateVendors && (
            <Button size="sm" variant="outline" onClick={() => setShowRateDialog(true)}>
              Rate Vendor
            </Button>
          )}
        </div>

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
                  <p className="font-medium">{sc.vendor?.company_name ?? "—"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">Purchase Order</p>
                  {sc.po_id ? (
                    <Link to={`/admin/purchase-orders/${sc.po_id}`} className="font-medium text-primary hover:underline">
                      {sc.purchase_order?.po_number ?? "View PO"}
                    </Link>
                  ) : (
                    <p className="font-medium">—</p>
                  )}
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">Team</p>
                  <p className="font-medium">{sc.team?.name ?? "—"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">Confirmed Date</p>
                  <p className="font-medium">{format(new Date(sc.confirmed_date), "dd MMM yyyy")}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">Verified</p>
                  <p className="font-medium">{sc.verified_at ? format(new Date(sc.verified_at), "dd MMM yyyy") : "—"}</p>
                </div>
                {sc.notes && (
                  <div className="col-span-2">
                    <p className="text-xs text-muted-foreground mb-0.5">Notes</p>
                    <p className="font-medium whitespace-pre-wrap">{sc.notes}</p>
                  </div>
                )}
              </div>

              {/* Line items */}
              {(sc.line_items ?? []).length > 0 && (
                <>
                  <Separator />
                  <div>
                    <p className="text-xs text-muted-foreground mb-3 font-semibold uppercase tracking-wide">Services Confirmed</p>
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/30 hover:bg-muted/30">
                          <TableHead className="text-xs text-muted-foreground">Description</TableHead>
                          <TableHead className="text-xs text-muted-foreground text-right">Qty Confirmed</TableHead>
                          <TableHead className="text-xs text-muted-foreground text-right">Rate</TableHead>
                          <TableHead className="text-xs text-muted-foreground text-right">Tax %</TableHead>
                          <TableHead className="text-xs text-muted-foreground text-right">Unit</TableHead>
                          <TableHead className="text-xs text-muted-foreground text-right">Total</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(sc.line_items ?? []).map((li) => (
                          <TableRow key={li.id}>
                            <TableCell className="text-sm">{li.description}</TableCell>
                            <TableCell className="text-sm text-right tabular-nums">{li.quantity_confirmed}</TableCell>
                            <TableCell className="text-sm text-right tabular-nums">{formatCurrency(li.unit_price)}</TableCell>
                            <TableCell className="text-sm text-right text-muted-foreground">
                              <TaxComponentsDisplay taxRate={li.tax_rate} components={li.tax_components} />
                            </TableCell>
                            <TableCell className="text-sm text-right text-muted-foreground">{li.unit ?? "—"}</TableCell>
                            <TableCell className="text-sm text-right font-medium tabular-nums">
                              {formatCurrency(li.quantity_confirmed * li.unit_price * (1 + (li.tax_rate ?? 0) / 100))}
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
          entityType="service_confirmation"
          entityId={sc.id}
          canDelete={canRecordServiceConfirmation}
          canUpload={false}
        />
      </div>

      <Dialog open={!!gateDecision} onOpenChange={(o) => { if (!o) { setGateDecision(null); setGateNotes("") } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{gateDecision === "approved" ? "Approve Service Confirmation" : "Reject Service Confirmation"}</DialogTitle>
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

      <Dialog open={!!confirmAction} onOpenChange={(o) => { if (!o) { setConfirmAction(null); setNotes("") } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{confirmAction === "verified" ? "Verify Service Confirmation" : "Reject Service Confirmation"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pt-2">
            <p className="text-sm text-muted-foreground">
              {confirmAction === "verified"
                ? "Are you sure you want to verify this service confirmation?"
                : "Are you sure you want to reject this service confirmation? The vendor will need to resubmit."}
            </p>
            <Textarea
              placeholder={confirmAction === "verified" ? "Remarks (optional)…" : "Reason for rejection…"}
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
              variant={confirmAction === "verified" ? "success" : "danger"}
              disabled={updateStatus.isPending}
              onClick={() => {
                if (!confirmAction || !id) return
                updateStatus.mutate(
                  { id, status: confirmAction, notes },
                  { onSuccess: () => { setConfirmAction(null); setNotes("") } }
                )
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
        vendorId={sc.vendor_id}
        vendorName={sc.vendor?.company_name}
      />
    </AnimatedPage>
  )
}
