import { useState } from "react"
import { useParams, Link } from "react-router-dom"
import { useEngagement, useUpdateEngagementStatus } from "@/hooks/useEngagements"
import { usePurchaseOrders } from "@/hooks/usePurchaseOrders"
import { useApprovalRequests, useRequestApproval, useReviewApproval } from "@/hooks/useApprovalWorkflow"
import { usePermissions } from "@/hooks/usePermissions"
import { toast } from "sonner"
import { AnimatedPage } from "@/components/shared/AnimatedPage"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { ENGAGEMENT_STATUS_LABELS, ENGAGEMENT_STATUS_COLORS, PO_STATUS_COLORS, PO_STATUS_LABELS } from "@/lib/constants"
import { formatCurrency } from "@/lib/utils"
import { format } from "date-fns"
import { CheckmarkCircle01Icon, Cancel01Icon, ArrowLeft01Icon, Add01Icon, EyeIcon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import type { EngagementStatus, POStatus } from "@/lib/types"

type ActionDialog = "submit" | "approve" | "reject" | null

export function EngagementDetail() {
  const { id } = useParams<{ id: string }>()
  const [dialog, setDialog] = useState<ActionDialog>(null)
  const [notes, setNotes]   = useState("")

  const { data: engagement, isLoading } = useEngagement(id!)
  const { data: pos = [] }              = usePurchaseOrders({ engagement_id: id })
  const { data: approvals = [] }        = useApprovalRequests("engagement", id!)
  const updateStatus   = useUpdateEngagementStatus()
  const requestApproval = useRequestApproval()
  const reviewApproval  = useReviewApproval()
  const { canApproveEngagement, canCreateEngagement } = usePermissions()

  const pendingApproval = approvals.find((a) => a.status === "pending")

  async function handleSubmitForApproval() {
    if (!id || !engagement) return
    try {
      await requestApproval.mutateAsync({ entityType: "engagement", entityId: id, amount: engagement.estimated_value, notes })
      await updateStatus.mutateAsync({ id, status: "pending_approval" })
      setDialog(null); setNotes("")
      toast.success("Engagement submitted for approval.")
    } catch {
      toast.error("Failed to submit for approval. Please try again.")
    }
  }

  async function handleApprove() {
    if (!id || !pendingApproval) return
    try {
      await reviewApproval.mutateAsync({ id: pendingApproval.id, status: "approved", notes, entityType: "engagement", entityId: id })
      await updateStatus.mutateAsync({ id, status: "approved", notes })
      setDialog(null); setNotes("")
      toast.success("Engagement approved.")
    } catch {
      toast.error("Failed to approve engagement. Please try again.")
    }
  }

  async function handleReject() {
    if (!id || !pendingApproval) return
    try {
      await reviewApproval.mutateAsync({ id: pendingApproval.id, status: "rejected", notes, entityType: "engagement", entityId: id })
      await updateStatus.mutateAsync({ id, status: "rejected", notes })
      setDialog(null); setNotes("")
      toast.success("Engagement rejected.")
    } catch {
      toast.error("Failed to reject engagement. Please try again.")
    }
  }

  if (isLoading) {
    return (
      <AnimatedPage>
        <div className="p-6 flex items-center justify-center py-24">
          <div className="h-6 w-6 border-2 border-muted-foreground/30 border-t-muted-foreground rounded-full animate-spin" />
        </div>
      </AnimatedPage>
    )
  }

  if (!engagement) {
    return (
      <AnimatedPage>
        <div className="p-6">
          <p className="text-sm text-muted-foreground">Engagement not found.</p>
        </div>
      </AnimatedPage>
    )
  }

  const status = engagement.status as EngagementStatus

  return (
    <AnimatedPage>
      <div className="p-6 space-y-6">
        {/* Breadcrumb + title */}
        <div>
          <Link to="/admin/engagements" className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground mb-3">
            <HugeiconsIcon icon={ArrowLeft01Icon} size={13} strokeWidth={1.5} />
            Engagements
          </Link>
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-xl font-bold tracking-tight">{engagement.title}</h1>
              <p className="text-sm text-muted-foreground mt-0.5">
                {engagement.vendor?.company_name} · Created {format(new Date(engagement.created_at), "dd MMM yyyy")}
              </p>
            </div>
            <span className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-xs font-medium border ${ENGAGEMENT_STATUS_COLORS[status]}`}>
              {ENGAGEMENT_STATUS_LABELS[status]}
            </span>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex flex-wrap gap-2">
          {status === "draft" && canCreateEngagement && (
            <Button size="sm" onClick={() => setDialog("submit")}>
              Submit for Approval
            </Button>
          )}
          {status === "pending_approval" && canApproveEngagement && (
            <>
              <Button size="sm" variant="success" onClick={() => setDialog("approve")}>
                <HugeiconsIcon icon={CheckmarkCircle01Icon} size={14} strokeWidth={2} primaryColor="currentColor" secondaryColor="currentColor" className="mr-1.5" />
                Approve
              </Button>
              <Button size="sm" variant="danger" onClick={() => setDialog("reject")}>
                <HugeiconsIcon icon={Cancel01Icon} size={14} strokeWidth={2} primaryColor="currentColor" secondaryColor="currentColor" className="mr-1.5" />
                Reject
              </Button>
            </>
          )}
          {status === "approved" && (
            <Button asChild size="sm" variant="outline">
              <Link to={`/admin/purchase-orders?engagement_id=${id}`}>
                <HugeiconsIcon icon={Add01Icon} size={14} strokeWidth={2} primaryColor="currentColor" secondaryColor="currentColor" className="mr-1.5" />
                Issue PO
              </Link>
            </Button>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Details card */}
          <Card className="md:col-span-2">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold">Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">Vendor</p>
                  <p className="font-medium">{engagement.vendor?.company_name ?? "—"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">Category</p>
                  <p className="font-medium">{engagement.category?.name ?? "—"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">Estimated Value</p>
                  <p className="font-medium tabular-nums">{formatCurrency(engagement.estimated_value, engagement.currency)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">Currency</p>
                  <p className="font-medium">{engagement.currency}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">Start Date</p>
                  <p className="font-medium">{engagement.start_date ? format(new Date(engagement.start_date), "dd MMM yyyy") : "—"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">End Date</p>
                  <p className="font-medium">{engagement.end_date ? format(new Date(engagement.end_date), "dd MMM yyyy") : "—"}</p>
                </div>
                {engagement.approved_by && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-0.5">Approved At</p>
                    <p className="font-medium">{engagement.approved_at ? format(new Date(engagement.approved_at), "dd MMM yyyy") : "—"}</p>
                  </div>
                )}
              </div>
              {engagement.description && (
                <>
                  <Separator />
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Description</p>
                    <p className="text-sm whitespace-pre-wrap">{engagement.description}</p>
                  </div>
                </>
              )}
              {engagement.notes && (
                <>
                  <Separator />
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Notes</p>
                    <p className="text-sm whitespace-pre-wrap">{engagement.notes}</p>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Approval history */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold">Approval History</CardTitle>
            </CardHeader>
            <CardContent>
              {approvals.length === 0 ? (
                <p className="text-xs text-muted-foreground">No approval requests yet.</p>
              ) : (
                <div className="space-y-3">
                  {approvals.map((a) => (
                    <div key={a.id} className="text-xs space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium">{a.requester?.full_name ?? a.requester?.email ?? "Unknown"}</span>
                        <Badge variant="outline" className={`text-[10px] py-0 ${a.status === "approved" ? "text-green-700 border-green-200" : a.status === "rejected" ? "text-red-700 border-red-200" : "text-yellow-700 border-yellow-200"}`}>
                          {a.status}
                        </Badge>
                      </div>
                      {a.notes && <p className="text-muted-foreground">{a.notes}</p>}
                      <p className="text-muted-foreground/60">{format(new Date(a.created_at), "dd MMM yyyy HH:mm")}</p>
                      <Separator className="mt-2" />
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Related POs */}
        {pos.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold">Purchase Orders ({pos.length})</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {pos.map((po) => (
                  <div key={po.id} className="flex items-center justify-between rounded-lg border px-3 py-2.5">
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">{po.po_number}</span>
                      <span className="text-sm">{formatCurrency(po.total_value, po.currency)}</span>
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium border ${PO_STATUS_COLORS[po.status as POStatus]}`}>
                        {PO_STATUS_LABELS[po.status as POStatus]}
                      </span>
                    </div>
                    <Button asChild size="sm" variant="ghost" className="h-7 px-2 text-xs">
                      <Link to={`/admin/purchase-orders/${po.id}`}>
                        <HugeiconsIcon icon={EyeIcon} size={13} strokeWidth={1.5} />
                      </Link>
                    </Button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Submit for Approval dialog */}
      <Dialog open={dialog === "submit"} onOpenChange={() => setDialog(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Submit for Approval</DialogTitle></DialogHeader>
          <div className="space-y-3 pt-2">
            <p className="text-sm text-muted-foreground">
              This will send the engagement for manager/procurement approval.
            </p>
            <Textarea placeholder="Add a note (optional)…" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)}>Cancel</Button>
            <Button onClick={handleSubmitForApproval} disabled={requestApproval.isPending || updateStatus.isPending}>
              {requestApproval.isPending ? "Submitting…" : "Submit"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Approve dialog */}
      <Dialog open={dialog === "approve"} onOpenChange={() => setDialog(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Approve Engagement</DialogTitle></DialogHeader>
          <div className="space-y-3 pt-2">
            <p className="text-sm text-muted-foreground">
              Approving will allow a Purchase Order to be issued for this engagement.
            </p>
            <Textarea placeholder="Approval notes (optional)…" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)}>Cancel</Button>
            <Button onClick={handleApprove} disabled={reviewApproval.isPending || updateStatus.isPending}>
              {reviewApproval.isPending ? "Approving…" : "Approve"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject dialog */}
      <Dialog open={dialog === "reject"} onOpenChange={() => setDialog(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Reject Engagement</DialogTitle></DialogHeader>
          <div className="space-y-3 pt-2">
            <Textarea placeholder="Reason for rejection…" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)}>Cancel</Button>
            <Button variant="danger" onClick={handleReject} disabled={reviewApproval.isPending || updateStatus.isPending}>
              {reviewApproval.isPending ? "Rejecting…" : "Reject"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AnimatedPage>
  )
}
