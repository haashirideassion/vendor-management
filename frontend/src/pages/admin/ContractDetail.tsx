import { useState } from "react"
import { useParams, Link } from "react-router-dom"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { useContract, useUpdateContractStatus, useUpdateContract, useMarkContractSigned, useAddAmendment } from "@/hooks/useContracts"
import { usePurchaseOrders } from "@/hooks/usePurchaseOrders"
import { useApprovalRequests, useReviewApproval } from "@/hooks/useApprovalWorkflow"
import { useContractReviewers, useRequestContractReview, useSubmitContractReview } from "@/hooks/useContractReviews"
import {
  useContractClauses, useContractClauseVersions, useCreateContractClause,
  useSubmitClauseVersion, useAgreeToClause, useReopenClause,
} from "@/hooks/useContractClauses"
import { useContractApprovals, useRequestContractApproval, useSubmitContractApproval } from "@/hooks/useContractApprovals"
import { useContractRenewals, useDecideContractRenewal } from "@/hooks/useContractRenewals"
import { usePermissions } from "@/hooks/usePermissions"
import { useOrg } from "@/contexts/OrgContext"
import { useAuth } from "@/contexts/AuthContext"
import { toast } from "sonner"
import { AnimatedPage } from "@/components/shared/AnimatedPage"
import { AttachmentList } from "@/components/shared/AttachmentList"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Separator } from "@/components/ui/separator"
import {
  CONTRACT_TYPE_LABELS,
  CONTRACT_TYPE_COLORS,
  CONTRACT_TYPE_SHORT,
  CONTRACT_STATUS_LABELS,
  CONTRACT_STATUS_COLORS,
  CONTRACT_RISK_TIER_LABELS,
  CONTRACT_RISK_TIER_COLORS,
  CONTRACT_RISK_TIERS,
  CONTRACT_REVIEWER_ROLE_LABELS,
  CONTRACT_REVIEW_STATUS_LABELS,
  CONTRACT_REVIEW_STATUS_COLORS,
  CONTRACT_CLAUSE_CATEGORY_LABELS,
  CONTRACT_CLAUSE_CATEGORIES,
  CONTRACT_CLAUSE_HIGH_PRIORITY_CATEGORIES,
  CONTRACT_CLAUSE_STATUS_LABELS,
  CONTRACT_CLAUSE_STATUS_COLORS,
  CONTRACT_APPROVAL_ROLE_LABELS,
  CONTRACT_APPROVAL_STATUS_LABELS,
  CONTRACT_APPROVAL_STATUS_COLORS,
  CONTRACT_RENEWAL_DECISION_LABELS,
  CONTRACT_RENEWAL_DECISION_COLORS,
  PO_STATUS_COLORS,
  PO_STATUS_LABELS,
} from "@/lib/constants"
import { formatCurrency } from "@/lib/utils"
import type { ContractType, ContractStatus, ContractRiskTier, ContractReviewerRole, ContractClause, ContractClauseCategory, ContractApprovalRole, ContractRenewalDecisionType, POStatus } from "@/lib/types"
import { format, differenceInDays } from "date-fns"
import {
  ArrowLeft01Icon,
  Add01Icon,
  CheckmarkCircle01Icon,
  Cancel01Icon,
  EyeIcon,
  File01Icon,
  Alert01Icon,
} from "@/components/shared/SolarIcon"
import { SolarDuotoneIcon } from "@/components/shared/SolarIcon"

type ActionDialog = "activate" | "terminate" | "sign" | "amend" | "reject" | "requestChanges" | null

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
  const { data: approvals = [] }      = useApprovalRequests("contract", id!)
  const { data: reviewers = [] }      = useContractReviewers(id)
  const { data: clauses = [] }        = useContractClauses(id)
  const { data: finalApprovals = [] } = useContractApprovals(id)
  const { data: renewalData }         = useContractRenewals(id)

  const updateStatus     = useUpdateContractStatus()
  const updateContract   = useUpdateContract()
  const markSigned       = useMarkContractSigned()
  const addAmendment     = useAddAmendment()
  const reviewApproval   = useReviewApproval()
  const requestReview    = useRequestContractReview()
  const submitReview     = useSubmitContractReview()
  const createClause        = useCreateContractClause()
  const submitClauseVersion = useSubmitClauseVersion()
  const agreeToClause       = useAgreeToClause()
  const reopenClause        = useReopenClause()
  const requestFinalApproval = useRequestContractApproval()
  const submitFinalApproval  = useSubmitContractApproval()
  const decideRenewal        = useDecideContractRenewal()
  const { canManageContracts } = usePermissions()
  const { activeOrg } = useOrg()
  const { user, isInternalUser } = useAuth()
  const isManagerOrAdminViewer = !!activeOrg?.roleNames.some((r) => r === "Manager" || r === "Admin")
  const isLegalViewer = !!activeOrg?.roleNames.includes("Legal")
  const canDecideRenewal = contract?.created_by === user?.id
    || !!activeOrg?.roleNames.some((r) => ["Manager", "Admin", "Legal", "Contract Manager"].includes(r))

  const [rejectNotes, setRejectNotes] = useState("")
  const [reviewChangesNotes, setReviewChangesNotes] = useState("")
  const [reviewRoleTarget, setReviewRoleTarget] = useState<ContractReviewerRole | null>(null)
  const pendingApproval = approvals.find((a) => a.status === "pending")

  const [newClauseOpen, setNewClauseOpen] = useState(false)
  const [newClauseTitle, setNewClauseTitle] = useState("")
  const [newClauseCategory, setNewClauseCategory] = useState<ContractClauseCategory>("other")
  const [newClauseContent, setNewClauseContent] = useState("")

  const [redlineClause, setRedlineClause] = useState<ContractClause | null>(null)
  const [redlineContent, setRedlineContent] = useState("")
  const [redlineSummary, setRedlineSummary] = useState("")

  const [historyClauseId, setHistoryClauseId] = useState<string | null>(null)
  const { data: clauseVersions = [] } = useContractClauseVersions(historyClauseId ?? undefined)

  const [renewalDecision, setRenewalDecision] = useState<ContractRenewalDecisionType | "">("")
  const [renewalAmendmentScope, setRenewalAmendmentScope] = useState("")
  const [renewalTerminationDate, setRenewalTerminationDate] = useState("")
  const [renewalNewExpiryDate, setRenewalNewExpiryDate] = useState("")

  const latestRound = reviewers.reduce((max, r) => Math.max(max, r.round), 0)
  const latestRoundRows = reviewers.filter((r) => r.round === latestRound)
  const reviewOpen = latestRoundRows.some((r) => r.status === "pending")
  const reviewComplete = latestRoundRows.length > 0 && latestRoundRows.every((r) => r.status === "approved")

  const latestApprovalRound = finalApprovals.reduce((max, a) => Math.max(max, a.round), 0)
  const latestApprovalRows = finalApprovals.filter((a) => a.round === latestApprovalRound)
  const finalApprovalOpen = latestApprovalRows.some((a) => a.status === "pending")
  const finalApprovalComplete = latestApprovalRows.length > 0 && latestApprovalRows.every((a) => a.status === "approved")

  // Which approver roles the current viewer can act on for Final Approval.
  const viewerApprovalRoles = new Set<ContractApprovalRole>()
  if (activeOrg?.roleNames.includes("Legal")) viewerApprovalRoles.add("legal")
  if (activeOrg?.roleNames.includes("Finance")) viewerApprovalRoles.add("finance")
  if (activeOrg?.roleNames.includes("Admin")) viewerApprovalRoles.add("vp_cfo")

  // Which reviewer slots the current viewer can act on -- business_user is
  // specifically the contract's own creator, the rest are org-role holders
  // (any one holder of a role resolves that slot, same as elsewhere in the app).
  const viewerReviewerRoles = new Set<ContractReviewerRole>()
  if (contract?.created_by === user?.id) viewerReviewerRoles.add("business_user")
  if (activeOrg?.roleNames.includes("Legal")) viewerReviewerRoles.add("legal")
  if (activeOrg?.roleNames.includes("Finance")) viewerReviewerRoles.add("finance")
  if (activeOrg?.roleNames.includes("Compliance")) viewerReviewerRoles.add("compliance")
  if (activeOrg?.roleNames.includes("Admin")) viewerReviewerRoles.add("vp_cfo")

  const amendForm = useForm<AmendForm>({ resolver: zodResolver(amendSchema) })

  async function handleActivate() {
    if (!id) return
    try {
      await updateStatus.mutateAsync({ id, status: "active", silent: true })
      setDialog(null)
      toast.success("Contract activated.")
    } catch {
      toast.error("Failed to activate contract. Please try again.")
    }
  }

  async function handleRiskTierChange(v: string) {
    if (!id) return
    try {
      await updateContract.mutateAsync({ id, risk_tier: v as ContractRiskTier })
    } catch {
      toast.error("Failed to update risk tier. Please try again.")
    }
  }

  async function handleRequestReview() {
    if (!id) return
    try {
      await requestReview.mutateAsync({ contractId: id })
    } catch {
      // hook toasts its own error
    }
  }

  async function handleApproveReview(role: ContractReviewerRole) {
    if (!id) return
    try {
      await submitReview.mutateAsync({ contractId: id, reviewerRole: role, status: "approved" })
    } catch {
      // hook toasts its own error
    }
  }

  async function handleRequestChanges() {
    if (!id || !reviewRoleTarget || !reviewChangesNotes.trim()) return
    try {
      await submitReview.mutateAsync({
        contractId: id, reviewerRole: reviewRoleTarget, status: "changes_requested", notes: reviewChangesNotes.trim(),
      })
      setDialog(null); setReviewChangesNotes(""); setReviewRoleTarget(null)
    } catch {
      // hook toasts its own error
    }
  }

  function openRedlineDialog(clause: ContractClause) {
    setRedlineClause(clause)
    setRedlineContent(clause.current_version?.[0]?.content ?? "")
    setRedlineSummary("")
  }

  async function handleCreateClause() {
    if (!id || !newClauseTitle.trim() || !newClauseContent.trim()) return
    try {
      await createClause.mutateAsync({
        contractId: id, title: newClauseTitle.trim(), category: newClauseCategory, content: newClauseContent.trim(),
      })
      setNewClauseOpen(false); setNewClauseTitle(""); setNewClauseCategory("other"); setNewClauseContent("")
    } catch {
      // hook toasts its own error
    }
  }

  async function handleSubmitRedline() {
    if (!id || !redlineClause || !redlineContent.trim()) return
    try {
      await submitClauseVersion.mutateAsync({
        clauseId: redlineClause.id, contractId: id, content: redlineContent.trim(), changeSummary: redlineSummary.trim() || undefined,
      })
      setRedlineClause(null); setRedlineContent(""); setRedlineSummary("")
    } catch {
      // hook toasts its own error
    }
  }

  async function handleAgreeToClause(clauseId: string) {
    if (!id) return
    try {
      await agreeToClause.mutateAsync({ clauseId, contractId: id })
    } catch {
      // hook toasts its own error
    }
  }

  async function handleReopenClause(clauseId: string) {
    if (!id) return
    try {
      await reopenClause.mutateAsync({ clauseId, contractId: id })
    } catch {
      // hook toasts its own error
    }
  }

  async function handleRequestFinalApproval() {
    if (!id) return
    try {
      await requestFinalApproval.mutateAsync({ contractId: id })
    } catch {
      // hook toasts its own error
    }
  }

  async function handleSubmitFinalApproval(role: ContractApprovalRole, status: "approved" | "rejected") {
    if (!id) return
    try {
      await submitFinalApproval.mutateAsync({ contractId: id, approverRole: role, status })
    } catch {
      // hook toasts its own error
    }
  }

  async function handleDecideRenewal() {
    if (!id || !renewalDecision) return
    try {
      await decideRenewal.mutateAsync({
        contractId: id,
        decision: renewalDecision,
        amendmentScope: renewalDecision === "amend" ? (renewalAmendmentScope.trim() || undefined) : undefined,
        terminationNoticeDate: renewalDecision === "terminate" ? (renewalTerminationDate || undefined) : undefined,
        newExpiryDate: renewalDecision === "renew" ? (renewalNewExpiryDate || undefined) : undefined,
      })
      setRenewalDecision(""); setRenewalAmendmentScope(""); setRenewalTerminationDate(""); setRenewalNewExpiryDate("")
    } catch {
      // hook toasts its own error
    }
  }

  async function handleApproveContract() {
    if (!id || !pendingApproval) return
    try {
      await reviewApproval.mutateAsync({ id: pendingApproval.id, status: "approved", entityType: "contract", entityId: id })
      await updateStatus.mutateAsync({ id, status: "draft", silent: true })
      toast.success("Contract approved.")
    } catch {
      toast.error("Failed to approve contract. Please try again.")
    }
  }

  async function handleRejectContract() {
    if (!id || !pendingApproval || !rejectNotes.trim()) return
    try {
      await reviewApproval.mutateAsync({
        id: pendingApproval.id, status: "rejected", notes: rejectNotes.trim(),
        entityType: "contract", entityId: id,
      })
      setDialog(null); setRejectNotes("")
      toast.success("Contract returned to its creator.")
    } catch {
      toast.error("Failed to reject contract. Please try again.")
    }
  }

  async function handleTerminate() {
    if (!id) return
    try {
      await updateStatus.mutateAsync({ id, status: "terminated", silent: true })
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
            <SolarDuotoneIcon icon={ArrowLeft01Icon} size={13} strokeWidth={1.5} />
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
            {status === "pending_approval" && isManagerOrAdminViewer && (
              <>
                <Button size="sm" variant="success" onClick={handleApproveContract} disabled={reviewApproval.isPending || updateStatus.isPending}>
                  <SolarDuotoneIcon icon={CheckmarkCircle01Icon} size={14} strokeWidth={2} primaryColor="currentColor" secondaryColor="currentColor" className="mr-1.5" />
                  Approve
                </Button>
                <Button size="sm" variant="danger" onClick={() => setDialog("reject")} disabled={reviewApproval.isPending || updateStatus.isPending}>
                  <SolarDuotoneIcon icon={Cancel01Icon} size={14} strokeWidth={2} primaryColor="currentColor" secondaryColor="currentColor" className="mr-1.5" />
                  Reject
                </Button>
              </>
            )}
            {(["draft", "internal_review"].includes(status) && !finalApprovalOpen) && (
              <Button size="sm" variant="outline" onClick={handleRequestFinalApproval} disabled={requestFinalApproval.isPending}>
                {requestFinalApproval.isPending ? "Requesting…" : finalApprovals.length > 0 ? "Re-request Final Approval" : "Request Final Approval"}
              </Button>
            )}
            {(
              status === "draft" ||
              (status === "internal_review" && reviewComplete) ||
              (status === "pending_final_approval" && finalApprovalComplete)
            ) && (
              <Button size="sm" variant="success" onClick={() => setDialog("activate")}>
                <SolarDuotoneIcon icon={CheckmarkCircle01Icon} size={14} strokeWidth={2} primaryColor="currentColor" secondaryColor="currentColor" className="mr-1.5" />
                Activate
              </Button>
            )}
            {status === "active" && (
              <Button size="sm" variant="danger" onClick={() => setDialog("terminate")}>
                <SolarDuotoneIcon icon={Cancel01Icon} size={14} strokeWidth={2} primaryColor="currentColor" secondaryColor="currentColor" className="mr-1.5" />
                Terminate
              </Button>
            )}
            {!bothSigned && (
              <Button size="sm" variant="outline" onClick={() => setDialog("sign")}>
                <SolarDuotoneIcon icon={File01Icon} size={14} strokeWidth={1.5} primaryColor="currentColor" secondaryColor="currentColor" className="mr-1.5" />
                Record Signature
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={() => setDialog("amend")}>
              <SolarDuotoneIcon icon={Add01Icon} size={14} strokeWidth={2} primaryColor="currentColor" secondaryColor="currentColor" className="mr-1.5" />
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
                  <p className="text-xs text-muted-foreground mb-0.5">Risk Tier</p>
                  {canManageContracts && (status === "draft" || status === "internal_review") ? (
                    <Select value={contract.risk_tier ?? ""} onValueChange={handleRiskTierChange}>
                      <SelectTrigger className="h-7 w-32 text-xs"><SelectValue placeholder="Not set" /></SelectTrigger>
                      <SelectContent>
                        {CONTRACT_RISK_TIERS.map((t) => (
                          <SelectItem key={t} value={t}>{CONTRACT_RISK_TIER_LABELS[t]}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : contract.risk_tier ? (
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium border ${CONTRACT_RISK_TIER_COLORS[contract.risk_tier]}`}>
                      {CONTRACT_RISK_TIER_LABELS[contract.risk_tier]}
                    </span>
                  ) : (
                    <p className="font-medium text-muted-foreground">Not set</p>
                  )}
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
                  ? <SolarDuotoneIcon icon={CheckmarkCircle01Icon} size={16} strokeWidth={2} className="text-green-600" />
                  : <span className="text-xs text-muted-foreground/60">Pending</span>
                }
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Internal signed</span>
                {contract.signed_by_internal
                  ? <SolarDuotoneIcon icon={CheckmarkCircle01Icon} size={16} strokeWidth={2} className="text-green-600" />
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

        {/* Internal Review */}
        <Card>
          <CardHeader className="pb-3 flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-semibold">Internal Review</CardTitle>
            {canManageContracts && status === "draft" && !!contract.risk_tier && !reviewOpen && (
              <Button size="sm" variant="outline" onClick={handleRequestReview} disabled={requestReview.isPending}>
                {requestReview.isPending ? "Requesting…" : reviewers.length > 0 ? "Re-request Internal Review" : "Request Internal Review"}
              </Button>
            )}
          </CardHeader>
          <CardContent>
            {!contract.risk_tier ? (
              <p className="text-xs text-muted-foreground">Set a risk tier above to enable Internal Review.</p>
            ) : latestRoundRows.length === 0 ? (
              <p className="text-xs text-muted-foreground">Not yet requested.</p>
            ) : (
              <div className="space-y-2">
                {latestRoundRows.map((r) => {
                  const daysPending = r.status === "pending" ? differenceInDays(new Date(), new Date(r.created_at)) : null
                  const canAct = viewerReviewerRoles.has(r.reviewer_role) && r.status === "pending"
                  return (
                    <div key={r.id} className="flex items-center justify-between rounded-lg border px-3 py-2.5 gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium">{CONTRACT_REVIEWER_ROLE_LABELS[r.reviewer_role]}</p>
                        {r.status === "pending" && daysPending != null && (
                          <p className="text-xs text-muted-foreground">
                            Pending {daysPending === 0 ? "today" : `${daysPending} day${daysPending !== 1 ? "s" : ""}`}
                          </p>
                        )}
                        {r.reviewed_by && (
                          <p className="text-xs text-muted-foreground">
                            {r.reviewer?.full_name ?? r.reviewer?.email ?? "Reviewer"} · {r.reviewed_at ? format(new Date(r.reviewed_at), "dd MMM yyyy") : ""}
                          </p>
                        )}
                        {r.notes && <p className="text-xs text-muted-foreground mt-0.5">{r.notes}</p>}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium border ${CONTRACT_REVIEW_STATUS_COLORS[r.status]}`}>
                          {CONTRACT_REVIEW_STATUS_LABELS[r.status]}
                        </span>
                        {canAct && (
                          <>
                            <Button
                              size="sm" variant="success" className="h-7 px-2 text-xs"
                              onClick={() => handleApproveReview(r.reviewer_role)}
                              disabled={submitReview.isPending}
                            >
                              Approve
                            </Button>
                            <Button
                              size="sm" variant="outline" className="h-7 px-2 text-xs"
                              onClick={() => { setReviewRoleTarget(r.reviewer_role); setDialog("requestChanges") }}
                              disabled={submitReview.isPending}
                            >
                              Request Changes
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Clauses & Redlining */}
        <Card>
          <CardHeader className="pb-3 flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-semibold">Clauses & Redlining</CardTitle>
            {isInternalUser && canManageContracts && (
              <Button size="sm" variant="outline" onClick={() => setNewClauseOpen(true)}>
                <SolarDuotoneIcon icon={Add01Icon} size={14} strokeWidth={2} primaryColor="currentColor" secondaryColor="currentColor" className="mr-1.5" />
                New Clause
              </Button>
            )}
          </CardHeader>
          <CardContent>
            {clauses.length === 0 ? (
              <p className="text-xs text-muted-foreground">No clauses defined yet.</p>
            ) : (
              <div className="space-y-3">
                {clauses.map((clause) => {
                  const version = clause.current_version?.[0]
                  const isHighPriority = CONTRACT_CLAUSE_HIGH_PRIORITY_CATEGORIES.includes(clause.category)
                  const viewerAgreed = isInternalUser ? clause.internal_agreed : clause.vendor_agreed
                  const canAgree = clause.status !== "agreed" && !viewerAgreed
                  const canPropose = clause.status !== "agreed"
                  const canReopen = isLegalViewer && clause.status === "agreed"
                  return (
                    <div key={clause.id} className="rounded-lg border p-3 space-y-2">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2 min-w-0">
                          {isHighPriority && (
                            <SolarDuotoneIcon icon={Alert01Icon} size={15} strokeWidth={1.5} className="text-red-600 shrink-0" />
                          )}
                          <span className="text-sm font-medium truncate">{clause.title}</span>
                          <span className="text-[11px] text-muted-foreground shrink-0">{CONTRACT_CLAUSE_CATEGORY_LABELS[clause.category]}</span>
                        </div>
                        <span className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-medium border ${CONTRACT_CLAUSE_STATUS_COLORS[clause.status]}`}>
                          {CONTRACT_CLAUSE_STATUS_LABELS[clause.status]}
                        </span>
                      </div>

                      {version && (
                        <div className="rounded-md bg-muted/40 px-3 py-2 text-sm whitespace-pre-wrap">
                          {version.content}
                        </div>
                      )}
                      {version?.change_summary && (
                        <p className="text-xs text-muted-foreground italic">"{version.change_summary}"</p>
                      )}
                      {version && (
                        <p className="text-[11px] text-muted-foreground">
                          v{version.version} · {version.author_side === "vendor" ? "Vendor" : "Internal"} · {format(new Date(version.created_at), "dd MMM yyyy")}
                        </p>
                      )}

                      <div className="flex items-center gap-3 text-xs">
                        <span className={clause.vendor_agreed ? "text-green-600 font-medium" : "text-muted-foreground"}>
                          {clause.vendor_agreed ? "✓" : "○"} Vendor
                        </span>
                        <span className={clause.internal_agreed ? "text-green-600 font-medium" : "text-muted-foreground"}>
                          {clause.internal_agreed ? "✓" : "○"} Internal
                        </span>
                      </div>

                      <div className="flex flex-wrap gap-2 pt-1">
                        {canPropose && (
                          <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => openRedlineDialog(clause)}>
                            Propose Redline
                          </Button>
                        )}
                        {canAgree && (
                          <Button
                            size="sm" variant="success" className="h-7 px-2 text-xs"
                            onClick={() => handleAgreeToClause(clause.id)}
                            disabled={agreeToClause.isPending}
                          >
                            Agree
                          </Button>
                        )}
                        {canReopen && (
                          <Button
                            size="sm" variant="outline" className="h-7 px-2 text-xs"
                            onClick={() => handleReopenClause(clause.id)}
                            disabled={reopenClause.isPending}
                          >
                            Reopen
                          </Button>
                        )}
                        <Button
                          size="sm" variant="ghost" className="h-7 px-2 text-xs text-muted-foreground"
                          onClick={() => setHistoryClauseId(clause.id)}
                        >
                          View History
                        </Button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Final Approval (Stage 7) */}
        {finalApprovals.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold">Final Approval</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {latestApprovalRows.map((a) => {
                  const canAct = viewerApprovalRoles.has(a.approver_role) && a.status === "pending"
                  return (
                    <div key={a.id} className="flex items-center justify-between rounded-lg border px-3 py-2.5 gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium">{CONTRACT_APPROVAL_ROLE_LABELS[a.approver_role]}</p>
                        {a.approved_by && (
                          <p className="text-xs text-muted-foreground">
                            {a.approver?.full_name ?? a.approver?.email ?? "Approver"} · {a.approved_at ? format(new Date(a.approved_at), "dd MMM yyyy") : ""}
                          </p>
                        )}
                        {a.notes && <p className="text-xs text-muted-foreground mt-0.5">{a.notes}</p>}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium border ${CONTRACT_APPROVAL_STATUS_COLORS[a.status]}`}>
                          {CONTRACT_APPROVAL_STATUS_LABELS[a.status]}
                        </span>
                        {canAct && (
                          <>
                            <Button
                              size="sm" variant="success" className="h-7 px-2 text-xs"
                              onClick={() => handleSubmitFinalApproval(a.approver_role, "approved")}
                              disabled={submitFinalApproval.isPending}
                            >
                              Approve
                            </Button>
                            <Button
                              size="sm" variant="danger" className="h-7 px-2 text-xs"
                              onClick={() => handleSubmitFinalApproval(a.approver_role, "rejected")}
                              disabled={submitFinalApproval.isPending}
                            >
                              Reject
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Renewal Tracking (Stages 9/11) */}
        {contract.expiry_date && (() => {
          const currentCycle = renewalData?.decisions.find((d) => d.cycle_expiry_date === contract.expiry_date)
          const reminders = renewalData?.reminders ?? []
          return (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold">Renewal Tracking</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {currentCycle ? (
                  <div className="rounded-lg border px-3 py-2.5 space-y-1.5">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-medium">
                        Cycle expiring {format(new Date(currentCycle.cycle_expiry_date), "dd MMM yyyy")}
                      </p>
                      {currentCycle.decision ? (
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium border ${CONTRACT_RENEWAL_DECISION_COLORS[currentCycle.decision]}`}>
                          {CONTRACT_RENEWAL_DECISION_LABELS[currentCycle.decision]}
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium border bg-yellow-100 text-yellow-800 border-yellow-200">
                          Awaiting Decision
                        </span>
                      )}
                    </div>
                    {currentCycle.decided_by && (
                      <p className="text-xs text-muted-foreground">
                        {currentCycle.decided_by_profile?.full_name ?? currentCycle.decided_by_profile?.email ?? "Decided"} · {currentCycle.decided_at ? format(new Date(currentCycle.decided_at), "dd MMM yyyy") : ""}
                      </p>
                    )}
                    {currentCycle.amendment_scope && (
                      <p className="text-xs text-muted-foreground">Scope: {currentCycle.amendment_scope}</p>
                    )}
                    {currentCycle.termination_notice_date && (
                      <p className="text-xs text-muted-foreground">
                        Termination notice: {format(new Date(currentCycle.termination_notice_date), "dd MMM yyyy")}
                      </p>
                    )}
                    {currentCycle.escalated_at && !currentCycle.decision && (
                      <p className="text-xs text-red-600 font-medium">Escalated — undecided close to expiry</p>
                    )}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    No renewal cycle open yet — one opens automatically {contract.renewal_notice_days} days before expiry.
                  </p>
                )}

                {canManageContracts && canDecideRenewal && (
                  <div className="rounded-lg border border-dashed p-3 space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label>Decision</Label>
                        <Select value={renewalDecision} onValueChange={(v) => setRenewalDecision(v as ContractRenewalDecisionType)}>
                          <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Choose…" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="renew">Renew</SelectItem>
                            <SelectItem value="amend">Amend</SelectItem>
                            <SelectItem value="terminate">Terminate</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      {renewalDecision === "renew" && (
                        <div className="space-y-1.5">
                          <Label>New Expiry Date</Label>
                          <Input type="date" className="h-8 text-xs" value={renewalNewExpiryDate} onChange={(e) => setRenewalNewExpiryDate(e.target.value)} />
                        </div>
                      )}
                      {renewalDecision === "terminate" && (
                        <div className="space-y-1.5">
                          <Label>Termination Notice Date</Label>
                          <Input type="date" className="h-8 text-xs" value={renewalTerminationDate} onChange={(e) => setRenewalTerminationDate(e.target.value)} />
                        </div>
                      )}
                    </div>
                    {renewalDecision === "amend" && (
                      <div className="space-y-1.5">
                        <Label>Amendment Scope</Label>
                        <Textarea rows={2} placeholder="What's changing…" value={renewalAmendmentScope} onChange={(e) => setRenewalAmendmentScope(e.target.value)} />
                      </div>
                    )}
                    <Button size="sm" onClick={handleDecideRenewal} disabled={!renewalDecision || decideRenewal.isPending}>
                      {decideRenewal.isPending ? "Saving…" : "Log Decision"}
                    </Button>
                  </div>
                )}

                {reminders.length > 0 && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-1.5">Reminder history</p>
                    <div className="flex flex-wrap gap-2">
                      {reminders.map((r) => (
                        <span key={r.id} className="text-[11px] rounded-full border px-2 py-0.5 text-muted-foreground">
                          {r.days_before}-day nudge · {format(new Date(r.sent_at), "dd MMM yyyy")}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )
        })()}

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
                        <SolarDuotoneIcon icon={EyeIcon} size={13} strokeWidth={1.5} />
                      </Link>
                    </Button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        <AttachmentList
          entityType="contract"
          entityId={contract.id}
          canDelete={canManageContracts}
          canUpload={false}
        />
      </div>

      {/* Reject dialog */}
      <Dialog open={dialog === "reject"} onOpenChange={() => { setDialog(null); setRejectNotes("") }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Reject Contract</DialogTitle></DialogHeader>
          <div className="space-y-3 pt-2">
            <Textarea placeholder="Reason for rejection…" value={rejectNotes} onChange={(e) => setRejectNotes(e.target.value)} rows={3} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setDialog(null); setRejectNotes("") }}>Cancel</Button>
            <Button variant="danger" onClick={handleRejectContract} disabled={!rejectNotes.trim() || reviewApproval.isPending}>
              {reviewApproval.isPending ? "Rejecting…" : "Reject"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Request Changes dialog (Internal Review) */}
      <Dialog open={dialog === "requestChanges"} onOpenChange={() => { setDialog(null); setReviewChangesNotes(""); setReviewRoleTarget(null) }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Request Changes</DialogTitle></DialogHeader>
          <div className="space-y-3 pt-2">
            <p className="text-sm text-muted-foreground">
              This sends the contract back to Draft{reviewRoleTarget ? ` as the ${CONTRACT_REVIEWER_ROLE_LABELS[reviewRoleTarget]} reviewer` : ""}. Explain what needs to change.
            </p>
            <Textarea placeholder="What needs to change…" value={reviewChangesNotes} onChange={(e) => setReviewChangesNotes(e.target.value)} rows={3} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setDialog(null); setReviewChangesNotes(""); setReviewRoleTarget(null) }}>Cancel</Button>
            <Button variant="danger" onClick={handleRequestChanges} disabled={!reviewChangesNotes.trim() || submitReview.isPending}>
              {submitReview.isPending ? "Sending…" : "Request Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New Clause dialog */}
      <Dialog open={newClauseOpen} onOpenChange={(o) => { if (!o) setNewClauseOpen(false) }}>
        <DialogContent>
          <DialogHeader><DialogTitle>New Clause</DialogTitle></DialogHeader>
          <div className="space-y-3 pt-2">
            <div className="space-y-1.5">
              <Label>Title <span className="text-destructive">*</span></Label>
              <Input value={newClauseTitle} onChange={(e) => setNewClauseTitle(e.target.value)} placeholder="Limitation of Liability…" />
            </div>
            <div className="space-y-1.5">
              <Label>Category</Label>
              <Select value={newClauseCategory} onValueChange={(v) => setNewClauseCategory(v as ContractClauseCategory)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CONTRACT_CLAUSE_CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>{CONTRACT_CLAUSE_CATEGORY_LABELS[c]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Initial Language <span className="text-destructive">*</span></Label>
              <Textarea value={newClauseContent} onChange={(e) => setNewClauseContent(e.target.value)} placeholder="Clause text…" rows={5} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewClauseOpen(false)}>Cancel</Button>
            <Button onClick={handleCreateClause} disabled={!newClauseTitle.trim() || !newClauseContent.trim() || createClause.isPending}>
              {createClause.isPending ? "Adding…" : "Add Clause"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Propose Redline dialog */}
      <Dialog open={!!redlineClause} onOpenChange={(o) => { if (!o) { setRedlineClause(null); setRedlineContent(""); setRedlineSummary("") } }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Propose Redline{redlineClause ? ` — ${redlineClause.title}` : ""}</DialogTitle></DialogHeader>
          <div className="space-y-3 pt-2">
            <div className="space-y-1.5">
              <Label>Clause Language <span className="text-destructive">*</span></Label>
              <Textarea value={redlineContent} onChange={(e) => setRedlineContent(e.target.value)} rows={6} />
            </div>
            <div className="space-y-1.5">
              <Label>What changed (optional)</Label>
              <Textarea value={redlineSummary} onChange={(e) => setRedlineSummary(e.target.value)} placeholder="Summarize what changed and why…" rows={2} />
            </div>
            <p className="text-xs text-muted-foreground">
              This resets both parties' agreement on this clause — the other side will need to review it again.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setRedlineClause(null); setRedlineContent(""); setRedlineSummary("") }}>Cancel</Button>
            <Button onClick={handleSubmitRedline} disabled={!redlineContent.trim() || submitClauseVersion.isPending}>
              {submitClauseVersion.isPending ? "Submitting…" : "Submit Redline"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Clause version history dialog */}
      <Dialog open={!!historyClauseId} onOpenChange={(o) => { if (!o) setHistoryClauseId(null) }}>
        <DialogContent size="lg">
          <DialogHeader><DialogTitle>Version History</DialogTitle></DialogHeader>
          <div className="space-y-3 pt-2 max-h-[60vh] overflow-y-auto">
            {clauseVersions.length === 0 ? (
              <p className="text-sm text-muted-foreground">No versions yet.</p>
            ) : (
              clauseVersions.map((v) => (
                <div key={v.id} className="rounded-lg border p-3 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold">v{v.version}{v.is_current ? " (current)" : ""}</span>
                    <span className="text-[11px] text-muted-foreground">
                      {v.author_side === "vendor" ? "Vendor" : "Internal"} · {v.author?.full_name ?? v.author?.email ?? ""} · {format(new Date(v.created_at), "dd MMM yyyy")}
                    </span>
                  </div>
                  <p className="text-sm whitespace-pre-wrap">{v.content}</p>
                  {v.change_summary && <p className="text-xs text-muted-foreground italic">"{v.change_summary}"</p>}
                </div>
              ))
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setHistoryClauseId(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
