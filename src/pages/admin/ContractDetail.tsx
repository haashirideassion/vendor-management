import { useState } from "react"
import { useParams, Link } from "react-router-dom"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { useContract, useUpdateContractStatus, useMarkContractSigned, useAddAmendment } from "@/hooks/useContracts"
import { usePurchaseOrders } from "@/hooks/usePurchaseOrders"
import { usePermissions } from "@/hooks/usePermissions"
import { toast } from "sonner"
import { AnimatedPage } from "@/components/shared/AnimatedPage"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Separator } from "@/components/ui/separator"
import {
  CONTRACT_TYPE_LABELS,
  CONTRACT_TYPE_COLORS,
  CONTRACT_TYPE_SHORT,
  CONTRACT_STATUS_LABELS,
  CONTRACT_STATUS_COLORS,
  PO_STATUS_COLORS,
  PO_STATUS_LABELS,
} from "@/lib/constants"
import { formatCurrency } from "@/lib/utils"
import type { ContractType, ContractStatus, POStatus } from "@/lib/types"
import { format } from "date-fns"
import {
  ArrowLeft01Icon,
  Add01Icon,
  CheckmarkCircle01Icon,
  Cancel01Icon,
  EyeIcon,
  File01Icon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

type ActionDialog = "activate" | "terminate" | "sign" | "amend" | null

const amendSchema = z.object({
  title:          z.string().min(1, "Title is required"),
  description:    z.string().optional(),
  effective_date: z.string().optional(),
})
type AmendForm = z.infer<typeof amendSchema>

function TypeBadge({ type }: { type: ContractType }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium border ${CONTRACT_TYPE_COLORS[type]}`}>
      {CONTRACT_TYPE_SHORT[type]} · {CONTRACT_TYPE_LABELS[type]}
    </span>
  )
}

function StatusChip({ status }: { status: ContractStatus }) {
  return (
    <span className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-xs font-medium border ${CONTRACT_STATUS_COLORS[status]}`}>
      {CONTRACT_STATUS_LABELS[status]}
    </span>
  )
}

export function ContractDetail() {
  const { id } = useParams<{ id: string }>()
  const [dialog, setDialog]   = useState<ActionDialog>(null)
  const [signBy, setSignBy]   = useState<"vendor" | "internal" | "both">("vendor")

  const { data: contract, isLoading } = useContract(id!)
  const { data: pos = [] }            = usePurchaseOrders({ contract_id: id })

  const updateStatus   = useUpdateContractStatus()
  const markSigned     = useMarkContractSigned()
  const addAmendment   = useAddAmendment()
  const { canManageContracts } = usePermissions()

  const amendForm = useForm<AmendForm>({ resolver: zodResolver(amendSchema) })

  async function handleActivate() {
    if (!id) return
    try {
      await updateStatus.mutateAsync({ id, status: "active" })
      setDialog(null)
      toast.success("Contract activated.")
    } catch {
      toast.error("Failed to activate contract. Please try again.")
    }
  }

  async function handleTerminate() {
    if (!id) return
    try {
      await updateStatus.mutateAsync({ id, status: "terminated" })
      setDialog(null)
      toast.success("Contract terminated.")
    } catch {
      toast.error("Failed to terminate contract. Please try again.")
    }
  }

  async function handleSign() {
    if (!id) return
    try {
      await markSigned.mutateAsync({ id, signedBy: signBy })
      setDialog(null)
      toast.success("Contract signing status updated.")
    } catch {
      toast.error("Failed to update signing status. Please try again.")
    }
  }

  async function onAmendSubmit(data: AmendForm) {
    if (!id) return
    try {
      await addAmendment.mutateAsync({
        contractId:     id,
        title:          data.title,
        description:    data.description || undefined,
        effective_date: data.effective_date || undefined,
      })
      setDialog(null)
      amendForm.reset()
      toast.success("Amendment added.")
    } catch {
      toast.error("Failed to add amendment. Please try again.")
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

  if (!contract) {
    return (
      <AnimatedPage>
        <div className="p-6">
          <p className="text-sm text-muted-foreground">Contract not found.</p>
        </div>
      </AnimatedPage>
    )
  }

  const status    = contract.status as ContractStatus
  const amendments = contract.amendments ?? []
  const bothSigned = contract.signed_by_vendor && contract.signed_by_internal

  return (
    <AnimatedPage>
      <div className="p-6 space-y-6">
        {/* Breadcrumb + header */}
        <div>
          <Link to="/admin/contracts" className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground mb-3">
            <HugeiconsIcon icon={ArrowLeft01Icon} size={13} strokeWidth={1.5} />
            Contracts
          </Link>
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-xl font-bold tracking-tight">{contract.title}</h1>
              <div className="flex flex-wrap items-center gap-2 mt-1.5">
                {contract.contract_ref && (
                  <span className="font-mono text-xs bg-muted px-2 py-0.5 rounded">
                    {contract.contract_ref}
                  </span>
                )}
                <TypeBadge type={contract.contract_type} />
                <span className="text-xs text-muted-foreground">
                  {contract.vendor?.company_name} · Created {format(new Date(contract.created_at), "dd MMM yyyy")}
                </span>
              </div>
            </div>
            <StatusChip status={status} />
          </div>
        </div>

        {/* Action buttons */}
        {canManageContracts && (
          <div className="flex flex-wrap gap-2">
            {status === "draft" && (
              <Button size="sm" variant="success" onClick={() => setDialog("activate")}>
                <HugeiconsIcon icon={CheckmarkCircle01Icon} size={14} strokeWidth={2} primaryColor="currentColor" secondaryColor="currentColor" className="mr-1.5" />
                Activate
              </Button>
            )}
            {status === "active" && (
              <Button size="sm" variant="danger" onClick={() => setDialog("terminate")}>
                <HugeiconsIcon icon={Cancel01Icon} size={14} strokeWidth={2} primaryColor="currentColor" secondaryColor="currentColor" className="mr-1.5" />
                Terminate
              </Button>
            )}
            {!bothSigned && (
              <Button size="sm" variant="outline" onClick={() => setDialog("sign")}>
                <HugeiconsIcon icon={File01Icon} size={14} strokeWidth={1.5} primaryColor="currentColor" secondaryColor="currentColor" className="mr-1.5" />
                Record Signature
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={() => setDialog("amend")}>
              <HugeiconsIcon icon={Add01Icon} size={14} strokeWidth={2} primaryColor="currentColor" secondaryColor="currentColor" className="mr-1.5" />
              Add Amendment
            </Button>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Details card */}
          <Card className="md:col-span-2">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold">Contract Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">Vendor</p>
                  <p className="font-medium">{contract.vendor?.company_name ?? "—"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">Version</p>
                  <p className="font-medium">v{contract.version}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">Effective Date</p>
                  <p className="font-medium">
                    {contract.effective_date ? format(new Date(contract.effective_date), "dd MMM yyyy") : "—"}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">Expiry Date</p>
                  <p className="font-medium">
                    {contract.expiry_date ? format(new Date(contract.expiry_date), "dd MMM yyyy") : "—"}
                  </p>
                </div>
                {contract.total_value != null && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-0.5">Total Value</p>
                    <p className="font-medium tabular-nums">{formatCurrency(contract.total_value, contract.currency)}</p>
                  </div>
                )}
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">Auto-Renew</p>
                  <p className="font-medium">{contract.auto_renew ? `Yes (${contract.renewal_notice_days}d notice)` : "No"}</p>
                </div>
                {contract.parent && (
                  <div className="col-span-2">
                    <p className="text-xs text-muted-foreground mb-0.5">Parent Contract</p>
                    <p className="font-medium">{contract.parent.title}
                      {contract.parent.contract_ref && (
                        <span className="ml-1.5 font-mono text-[11px] text-muted-foreground">({contract.parent.contract_ref})</span>
                      )}
                    </p>
                  </div>
                )}
              </div>
              {contract.notes && (
                <>
                  <Separator />
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Notes</p>
                    <p className="text-sm whitespace-pre-wrap">{contract.notes}</p>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Signing Status card */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold">Signing Status</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Vendor signed</span>
                {contract.signed_by_vendor
                  ? <HugeiconsIcon icon={CheckmarkCircle01Icon} size={16} strokeWidth={2} className="text-green-600" />
                  : <span className="text-xs text-muted-foreground/60">Pending</span>
                }
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Internal signed</span>
                {contract.signed_by_internal
                  ? <HugeiconsIcon icon={CheckmarkCircle01Icon} size={16} strokeWidth={2} className="text-green-600" />
                  : <span className="text-xs text-muted-foreground/60">Pending</span>
                }
              </div>
              {contract.signed_at && (
                <>
                  <Separator />
                  <div className="text-xs text-muted-foreground">
                    Fully executed on{" "}
                    <span className="font-medium text-foreground">
                      {format(new Date(contract.signed_at), "dd MMM yyyy")}
                    </span>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Amendments */}
        <Card>
          <CardHeader className="pb-3 flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-semibold">
              Amendments ({amendments.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {amendments.length === 0 ? (
              <p className="text-xs text-muted-foreground">No amendments recorded.</p>
            ) : (
              <div className="space-y-3">
                {amendments.map((a) => (
                  <div key={a.id} className="rounded-lg border px-3 py-2.5 space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-mono bg-muted px-1.5 py-0.5 rounded text-muted-foreground">
                        #{a.amendment_number}
                      </span>
                      <span className="text-sm font-medium">{a.title}</span>
                      {a.effective_date && (
                        <span className="ml-auto text-xs text-muted-foreground tabular-nums">
                          {format(new Date(a.effective_date), "dd MMM yyyy")}
                        </span>
                      )}
                    </div>
                    {a.description && (
                      <p className="text-xs text-muted-foreground pl-9">{a.description}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

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

      {/* Activate dialog */}
      <Dialog open={dialog === "activate"} onOpenChange={() => setDialog(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Activate Contract</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground pt-1">
            This will move the contract from Draft to Active. Make sure all terms are finalised.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)}>Cancel</Button>
            <Button onClick={handleActivate} disabled={updateStatus.isPending}>
              {updateStatus.isPending ? "Activating…" : "Activate"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Terminate dialog */}
      <Dialog open={dialog === "terminate"} onOpenChange={() => setDialog(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Terminate Contract</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground pt-1">
            This action cannot be undone. The contract will be marked as terminated and no further amendments can be issued.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)}>Cancel</Button>
            <Button variant="danger" onClick={handleTerminate} disabled={updateStatus.isPending}>
              {updateStatus.isPending ? "Terminating…" : "Terminate Contract"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Sign dialog */}
      <Dialog open={dialog === "sign"} onOpenChange={() => setDialog(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Record Signature</DialogTitle></DialogHeader>
          <div className="space-y-3 pt-2">
            <p className="text-sm text-muted-foreground">Select which party has signed:</p>
            <div className="grid grid-cols-3 gap-2">
              {(["vendor", "internal", "both"] as const).map((opt) => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => setSignBy(opt)}
                  className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors capitalize ${
                    signBy === opt
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border hover:bg-accent"
                  }`}
                >
                  {opt}
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              {signBy === "both"
                ? "Both parties have signed — the contract will be marked as fully executed."
                : `Only ${signBy} signature will be recorded.`}
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)}>Cancel</Button>
            <Button onClick={handleSign} disabled={markSigned.isPending}>
              {markSigned.isPending ? "Saving…" : "Save Signature"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Amendment dialog */}
      <Dialog open={dialog === "amend"} onOpenChange={() => { setDialog(null); amendForm.reset() }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Amendment</DialogTitle></DialogHeader>
          <form onSubmit={amendForm.handleSubmit(onAmendSubmit)} className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label>Title <span className="text-destructive">*</span></Label>
              <Input {...amendForm.register("title")} placeholder="Amendment title…" />
              {amendForm.formState.errors.title && (
                <p className="text-xs text-destructive">{amendForm.formState.errors.title.message}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Description</Label>
              <Textarea {...amendForm.register("description")} placeholder="What changed…" rows={3} />
            </div>
            <div className="space-y-1.5">
              <Label>Effective Date</Label>
              <Input type="date" {...amendForm.register("effective_date")} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => { setDialog(null); amendForm.reset() }}>
                Cancel
              </Button>
              <Button type="submit" disabled={addAmendment.isPending}>
                {addAmendment.isPending ? "Adding…" : "Add Amendment"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </AnimatedPage>
  )
}
