import { useState } from "react"
import { useParams, Link } from "react-router-dom"
import { usePurchaseRequest, useUpdatePurchaseRequestStatus } from "@/hooks/usePurchaseRequests"
import { usePurchaseOrders, useCreatePurchaseOrder } from "@/hooks/usePurchaseOrders"
import { useApprovalRequests, useReviewApproval } from "@/hooks/useApprovalWorkflow"
import { usePurchaseRequestQuotations } from "@/hooks/useQuotations"
import { usePermissions } from "@/hooks/usePermissions"
import { useOrg } from "@/contexts/OrgContext"
import { AttachmentList } from "@/components/shared/AttachmentList"
import { CreatePODialog } from "@/components/shared/CreatePODialog"
import { toast } from "sonner"
import { AnimatedPage } from "@/components/shared/AnimatedPage"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Textarea } from "@/components/ui/textarea"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import {
  PURCHASE_REQUEST_STATUS_LABELS,
  PURCHASE_REQUEST_STATUS_COLORS,
  PO_STATUS_COLORS,
  PO_STATUS_LABELS,
  QUOTATION_STATUS_COLORS,
  QUOTATION_STATUS_LABELS,
} from "@/lib/constants"
import { formatCurrency } from "@/lib/utils"
import { format } from "date-fns"
import { ArrowLeft01Icon, Add01Icon, EyeIcon, InformationCircleIcon } from "@/components/shared/SolarIcon"
import { SolarDuotoneIcon } from "@/components/shared/SolarIcon"
import type { PurchaseRequestStatus, POStatus, QuotationStatus, QuotationLineItem } from "@/lib/types"

interface SelectedItem {
  quotation_id: string
  vendor_id: string
  line: QuotationLineItem
}

type ActionDialog = "approve" | "reject" | null

export function PurchaseRequestDetail() {
  const { id } = useParams<{ id: string }>()
  const [dialog, setDialog] = useState<ActionDialog>(null)
  const [notes, setNotes] = useState("")
  const [selectedItems, setSelectedItems] = useState<Map<string, SelectedItem>>(new Map())
  const [showPOConfirm, setShowPOConfirm] = useState(false)
  const [poDialogOpen, setPoDialogOpen] = useState(false)

  const { data: purchaseRequest, isLoading } = usePurchaseRequest(id!)
  const { data: pos = [] } = usePurchaseOrders({ purchase_request_id: id })
  const { data: approvals = [] } = useApprovalRequests("purchase_request", id!)
  const { data: quotations = [] } = usePurchaseRequestQuotations(id)
  // A vendor with a standing Blanket PO can have this purchase request's
  // accepted quotation issued as a Release Order against it instead of a
  // fresh standalone PO -- fetched org-wide since we don't yet know which
  // vendors are selected.
  const { data: activeBlanketPOs = [] } = usePurchaseOrders({ po_type: "blanket", status: "issued" })
  const [releaseChoices, setReleaseChoices] = useState<Record<string, boolean>>({})
  const updateStatus = useUpdatePurchaseRequestStatus()
  const reviewApproval = useReviewApproval()
  const createPO = useCreatePurchaseOrder()
  const { canCreatePurchaseRequest, canCreatePO } = usePermissions()
  const { activeOrg } = useOrg()
  const isManagerOrAdminViewer = !!activeOrg?.roleNames.some((r) => r === "Manager" || r === "Admin")

  // POs have already been dispatched for this purchase request — lock the selection UI
  const posSent = pos.length > 0

  // First active Blanket PO found per vendor -- a simplification for the
  // (uncommon) case of a vendor having more than one active blanket at once.
  const blanketByVendor = new Map<string, typeof activeBlanketPOs[number]>()
  for (const bpo of activeBlanketPOs) {
    if (!blanketByVendor.has(bpo.vendor_id)) blanketByVendor.set(bpo.vendor_id, bpo)
  }

  function toggleLineItem(lineItemId: string, item: SelectedItem) {
    if (posSent) return
    setSelectedItems((prev) => {
      const next = new Map(prev)
      if (next.has(lineItemId)) {
        next.delete(lineItemId)
      } else {
        next.set(lineItemId, item)
      }
      return next
    })
  }

  async function handleCreatePOs() {
    if (!purchaseRequest) return
    const byVendor = new Map<string, SelectedItem[]>()
    for (const item of selectedItems.values()) {
      const group = byVendor.get(item.vendor_id) ?? []
      group.push(item)
      byVendor.set(item.vendor_id, group)
    }

    const results = await Promise.allSettled(
      Array.from(byVendor.entries()).map(([vendorId, items]) => {
        const blanket = releaseChoices[vendorId] ? blanketByVendor.get(vendorId) : undefined
        return createPO.mutateAsync({
          po_type:       blanket ? "release" : "standard",
          parent_po_id:  blanket?.id,
          purchase_request_id: id!,
          vendor_id: vendorId,
          total_value: items.reduce((s, i) => s + i.line.total, 0),
          currency: blanket?.currency ?? purchaseRequest.currency,
          // Non-null assert: the checkbox that populates selectedItems is
          // disabled for "not_available" lines (which are the only ones
          // with a null quantity/unit_price), so a selected item always has
          // real pricing by the time it reaches here.
          line_items: items.map((i) => ({
            description: i.line.description,
            quantity: i.line.quantity!,
            unit_price: i.line.unit_price!,
            tax_rate: i.line.tax_rate ?? 0,
            tax_components: (i.line.tax_components ?? []).map((c) => ({ name: c.name, rate: c.rate })),
            unit: null,
          })),
          silent: true, // this handler shows its own single summary toast below
        })
      })
    )

    const succeeded = results.filter((r) => r.status === "fulfilled").length
    const failedReasons = results
      .filter((r): r is PromiseRejectedResult => r.status === "rejected")
      .map((r) => (r.reason as Error)?.message)
      .filter(Boolean)

    if (succeeded > 0) toast.success(`${succeeded} PO${succeeded !== 1 ? "s" : ""} created and sent to vendors`)
    if (failedReasons.length > 0) {
      toast.error(`${failedReasons.length} PO${failedReasons.length !== 1 ? "s" : ""} failed: ${failedReasons.join("; ")}`)
    }

    setSelectedItems(new Map())
    setReleaseChoices({})
    setShowPOConfirm(false)
  }

  const pendingApproval = approvals.find((a) => a.status === "pending")



  async function handleApprove() {
    if (!id || !pendingApproval) return
    try {
      await reviewApproval.mutateAsync({ id: pendingApproval.id, status: "approved", notes, entityType: "purchase_request", entityId: id })
      await updateStatus.mutateAsync({ id, status: "approved", notes })
      setDialog(null); setNotes("")
      toast.success("Purchase request approved.")
    } catch {
      toast.error("Failed to approve purchase request. Please try again.")
    }
  }

  async function handleReject() {
    if (!id || !pendingApproval) return
    try {
      await reviewApproval.mutateAsync({ id: pendingApproval.id, status: "rejected", notes, entityType: "purchase_request", entityId: id })
      await updateStatus.mutateAsync({ id, status: "rejected", notes })
      setDialog(null); setNotes("")
      toast.success("Purchase request rejected.")
    } catch {
      toast.error("Failed to reject purchase request. Please try again.")
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

  if (!purchaseRequest) {
    return (
      <AnimatedPage>
        <div className="p-6">
          <p className="text-sm text-muted-foreground">Purchase request not found.</p>
        </div>
      </AnimatedPage>
    )
  }

  const status = purchaseRequest.status as PurchaseRequestStatus

  return (
    <AnimatedPage>
      <div className="p-6 space-y-6">
        {/* Breadcrumb + title */}
        <div>
          <Link to="/admin/purchase-requests" className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground mb-3">
            <SolarDuotoneIcon icon={ArrowLeft01Icon} size={13} strokeWidth={1.5} />
            Purchase Requests
          </Link>
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-xl font-bold tracking-tight">{purchaseRequest.title}</h1>
              <p className="text-sm text-muted-foreground mt-0.5">
                {(purchaseRequest.purchase_request_vendors ?? []).map(prv => prv.vendor?.company_name).filter(Boolean).join(", ") || purchaseRequest.vendor?.company_name || "—"} · Created {format(new Date(purchaseRequest.created_at), "dd MMM yyyy")}
              </p>
            </div>
            <span className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-xs font-medium border ${PURCHASE_REQUEST_STATUS_COLORS[status]}`}>
              {PURCHASE_REQUEST_STATUS_LABELS[status]}
            </span>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex flex-wrap gap-2">
          {status === "pending_approval" && isManagerOrAdminViewer && (
            <>
              <Button size="sm" variant="success" onClick={() => setDialog("approve")}>
                Approve
              </Button>
              <Button size="sm" variant="danger" onClick={() => setDialog("reject")}>
                Reject
              </Button>
            </>
          )}
          {status === "approved" && (
            <Button size="sm" variant="outline" onClick={() => setPoDialogOpen(true)}>
              <SolarDuotoneIcon icon={Add01Icon} size={14} strokeWidth={2} primaryColor="currentColor" secondaryColor="currentColor" className="mr-1.5" />
              Issue PO
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
                  <p className="font-medium">
                    {(purchaseRequest.purchase_request_vendors ?? []).map(prv => prv.vendor?.company_name).filter(Boolean).join(", ") || purchaseRequest.vendor?.company_name || "—"}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">Category</p>
                  <p className="font-medium">{purchaseRequest.category?.name ?? "—"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">Estimated Value</p>
                  <p className="font-medium tabular-nums">
                    {purchaseRequest.estimated_value != null ? formatCurrency(purchaseRequest.estimated_value, purchaseRequest.currency) : "—"}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">Currency</p>
                  <p className="font-medium">{purchaseRequest.currency}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">Start Date</p>
                  <p className="font-medium">{purchaseRequest.start_date ? format(new Date(purchaseRequest.start_date), "dd MMM yyyy") : "—"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">End Date</p>
                  <p className="font-medium">{purchaseRequest.end_date ? format(new Date(purchaseRequest.end_date), "dd MMM yyyy") : "—"}</p>
                </div>
                {purchaseRequest.approved_by && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-0.5">Approved At</p>
                    <p className="font-medium">{purchaseRequest.approved_at ? format(new Date(purchaseRequest.approved_at), "dd MMM yyyy") : "—"}</p>
                  </div>
                )}
              </div>
              {purchaseRequest.description && (
                <>
                  <Separator />
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Description</p>
                    <p className="text-sm whitespace-pre-wrap">{purchaseRequest.description}</p>
                  </div>
                </>
              )}
              {purchaseRequest.notes && (
                <>
                  <Separator />
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Notes</p>
                    <p className="text-sm whitespace-pre-wrap">{purchaseRequest.notes}</p>
                  </div>
                </>
              )}

              {/* Purchase request line items */}
              {(purchaseRequest.line_items ?? []).length > 0 && (
                <>
                  <Separator />
                  <div>
                    <p className="text-xs text-muted-foreground mb-2 font-semibold uppercase tracking-wide">Requested Items</p>
                    <div className="space-y-1">
                      <div className="grid grid-cols-12 gap-2 text-xs text-muted-foreground font-medium px-1">
                        <span className="col-span-5">Description</span>
                        <span className="col-span-2 text-right">Qty</span>
                        <span className="col-span-2 text-right">Unit</span>
                        <span className="col-span-3 text-right">Rate</span>
                      </div>
                      {(purchaseRequest.line_items ?? []).map((li) => (
                        <div key={li.id} className="grid grid-cols-12 gap-2 items-center py-1 border-b border-border/50 text-sm">
                          <div className="col-span-5">{li.description}</div>
                          <div className="col-span-2 text-right tabular-nums">{li.quantity}</div>
                          <div className="col-span-2 text-right text-muted-foreground">{li.unit ?? "—"}</div>
                          <div className="col-span-3 text-right tabular-nums">
                            {li.unit_price && li.unit_price > 0 ? formatCurrency(li.unit_price, purchaseRequest.currency) : "—"}
                          </div>
                        </div>
                      ))}
                    </div>
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
                        {/* Pending: show who requested it (nobody has acted yet).
                            Approved/rejected: show who actually made that decision,
                            not the original requester -- these can be different
                            people, and this card is meant to show WHO approved. */}
                        <span className="font-medium">
                          {a.status === "pending"
                            ? (a.requester?.full_name ?? a.requester?.email ?? "Unknown")
                            : (a.reviewer?.full_name ?? a.reviewer?.email ?? "Unknown")}
                        </span>
                        <Badge variant="outline" className={`text-[10px] py-0 ${a.status === "approved" ? "text-green-600 border-green-200" : a.status === "rejected" ? "text-red-700 border-red-200" : "text-yellow-700 border-yellow-200"}`}>
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
                        <SolarDuotoneIcon icon={EyeIcon} size={13} strokeWidth={1.5} />
                      </Link>
                    </Button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Vendor Quotations */}
        {quotations.length > 0 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold tracking-tight">Vendor Quotations</h2>
              {!posSent && selectedItems.size > 0 && canCreatePO && (
                <Button size="sm" onClick={() => setShowPOConfirm(true)}>
                  <SolarDuotoneIcon icon={Add01Icon} size={14} strokeWidth={2} primaryColor="currentColor" secondaryColor="currentColor" className="mr-1.5" />
                  Send PO to Vendors ({selectedItems.size} item{selectedItems.size !== 1 ? "s" : ""})
                </Button>
              )}
            </div>

            {/* Banner shown after POs are dispatched */}
            {posSent && (
              <div className="flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2.5 text-sm text-blue-800">
                <SolarDuotoneIcon icon={InformationCircleIcon} size={15} strokeWidth={1.5} className="shrink-0" />
                <span>Purchase orders have already been sent for this purchase request. Selection is locked.</span>
              </div>
            )}

            {quotations.map((quot) => (
              <Card key={quot.id}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-semibold">{quot.vendor?.company_name ?? "Vendor"}</CardTitle>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs text-muted-foreground">{quot.quot_number}</span>
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium border ${QUOTATION_STATUS_COLORS[quot.status as QuotationStatus]}`}>
                        {QUOTATION_STATUS_LABELS[quot.status as QuotationStatus]}
                      </span>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {quot.notes && <p className="text-sm text-muted-foreground">{quot.notes}</p>}
                  {(quot.line_items ?? []).length > 0 && (
                    <div className="space-y-1">
                      <div className="grid grid-cols-12 gap-2 text-xs text-muted-foreground font-medium px-1 pb-1">
                        <span className="col-span-1" />
                        <span className="col-span-4">Description</span>
                        <span className="col-span-2 text-right">Qty</span>
                        <span className="col-span-2 text-right">Rate</span>
                        <span className="col-span-1 text-right">Tax</span>
                        <span className="col-span-2 text-right">Total</span>
                      </div>
                      {(quot.line_items ?? []).map((li) => {
                        const notAvailable = li.availability_status === "not_available"
                        return (
                        <div key={li.id} className="grid grid-cols-12 gap-2 items-center py-1 border-b border-border/50 text-sm">
                          <div className="col-span-1 flex justify-center">
                            <Checkbox
                              checked={selectedItems.has(li.id)}
                              disabled={posSent || notAvailable}
                              onCheckedChange={() => toggleLineItem(li.id, {
                                quotation_id: quot.id,
                                vendor_id: quot.vendor_id,
                                line: li,
                              })}
                            />
                          </div>
                          <div className="col-span-4">
                            {li.description}
                            {li.availability_status === "partially_available" && (
                              <span className="ml-1.5 text-xs font-medium text-amber-700">(Partial)</span>
                            )}
                          </div>
                          {notAvailable ? (
                            <div className="col-span-6 text-right text-muted-foreground italic">Not Available</div>
                          ) : (
                            <>
                              <div className="col-span-2 text-right tabular-nums">{li.quantity}</div>
                              <div className="col-span-2 text-right tabular-nums">{formatCurrency(li.unit_price ?? 0, purchaseRequest.currency)}</div>
                              <div
                                className="col-span-1 text-right text-muted-foreground"
                                title={li.tax_components && li.tax_components.length > 0 ? li.tax_components.map((c) => `${c.name} ${c.rate}%`).join(" + ") : undefined}
                              >
                                {li.tax_rate}%
                              </div>
                              <div className="col-span-2 text-right font-medium tabular-nums">{formatCurrency(li.total, purchaseRequest.currency)}</div>
                            </>
                          )}
                        </div>
                      )})}
                    </div>
                  )}
                  {quot.total_amount != null && (
                    <div className="flex justify-end pt-1">
                      <p className="text-sm font-semibold">Total: {formatCurrency(quot.total_amount, purchaseRequest.currency)}</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        <AttachmentList
          entityType="purchase_request"
          entityId={id!}
          canDelete={canCreatePurchaseRequest}
          canUpload={false}
        />
      </div>

      {/* Approve dialog */}
      <Dialog open={dialog === "approve"} onOpenChange={() => setDialog(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Approve Purchase Request</DialogTitle></DialogHeader>
          <div className="space-y-3 pt-2">
            <p className="text-sm text-muted-foreground">
              Approving will allow a Purchase Order to be issued for this purchase request.
            </p>
            <Textarea placeholder="Approval notes (optional)…" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)}>Cancel</Button>
            <Button variant="success" onClick={handleApprove} disabled={reviewApproval.isPending || updateStatus.isPending}>
              {reviewApproval.isPending ? "Approving…" : "Approve"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject dialog */}
      <Dialog open={dialog === "reject"} onOpenChange={() => setDialog(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Reject Purchase Request</DialogTitle></DialogHeader>
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

      <Dialog open={showPOConfirm} onOpenChange={setShowPOConfirm}>
        <DialogContent>
          <DialogHeader><DialogTitle>Send Purchase Orders to Vendors</DialogTitle></DialogHeader>
          <div className="space-y-3 pt-2">
            <p className="text-sm text-muted-foreground">
              This will create {new Set(Array.from(selectedItems.values()).map((i) => i.vendor_id)).size} PO(s) from the selected line items. This action cannot be undone and the selection will be locked.
            </p>
            {Array.from(new Set(Array.from(selectedItems.values()).map((i) => i.vendor_id))).map((vendorId) => {
              const vendorName = purchaseRequest?.purchase_request_vendors?.find((prv) => prv.vendor?.id === vendorId)?.vendor?.company_name ?? "Vendor"
              const blanket = blanketByVendor.get(vendorId)
              const vendorTotal = Array.from(selectedItems.values())
                .filter((i) => i.vendor_id === vendorId)
                .reduce((s, i) => s + i.line.total, 0)
              return (
                <div key={vendorId} className="rounded-lg border p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium">{vendorName}</p>
                    <p className="text-xs text-muted-foreground tabular-nums">{formatCurrency(vendorTotal, purchaseRequest?.currency)}</p>
                  </div>
                  {blanket ? (
                    <label className="flex items-center gap-2 text-xs cursor-pointer">
                      <Checkbox
                        checked={!!releaseChoices[vendorId]}
                        onCheckedChange={(v) => setReleaseChoices((prev) => ({ ...prev, [vendorId]: !!v }))}
                      />
                      Issue as a Release Order against Blanket PO {blanket.po_number} (instead of a standalone PO)
                    </label>
                  ) : (
                    <p className="text-xs text-muted-foreground">Standalone PO — no active Blanket PO for this vendor.</p>
                  )}
                </div>
              )
            })}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPOConfirm(false)} disabled={createPO.isPending}>Cancel</Button>
            <Button onClick={handleCreatePOs} disabled={createPO.isPending}>
              {createPO.isPending ? "Processing…" : "Send POs"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <CreatePODialog
        open={poDialogOpen}
        onOpenChange={setPoDialogOpen}
        defaultPurchaseRequestId={id}
        defaultVendors={(purchaseRequest?.purchase_request_vendors ?? [])
          .map(prv => prv.vendor)
          .filter((v): v is { id: string; company_name: string } => v != null)}
        defaultLineItems={purchaseRequest?.line_items ?? []}
        currency={purchaseRequest?.currency}
      />
    </AnimatedPage>
  )
}
