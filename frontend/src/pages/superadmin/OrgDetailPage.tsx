import { useState } from "react"
import { useParams, useNavigate } from "react-router-dom"
import {
  usePlatformOrganizationDetail, useUpdateOrganizationStatus, type PlatformOrgMember, type PlatformOrgVendor,
} from "@/hooks/useSuperadmin"
import { useReviewOrgOnboarding } from "@/hooks/useOrgOnboardingQueue"
import { useOrgOnboardingDocumentSignedUrl } from "@/hooks/useDocuments"
import { AnimatedPage } from "@/components/shared/AnimatedPage"
import { EmptyState } from "@/components/shared/EmptyState"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { SolarDuotoneIcon } from "@/components/shared/SolarIcon"
import {
  Building06Icon, UserGroup02Icon, Briefcase01Icon, ArrowLeft01Icon, Clock01Icon, File01Icon, EyeIcon,
} from "@/components/shared/SolarIcon"
import {
  LEGAL_ENTITY_TYPE_LABELS, ORG_ONBOARDING_DOCUMENT_LABELS, NATURE_OF_OPERATIONS_LABELS,
  VENDOR_STATUS_LABELS, VENDOR_STATUS_COLORS, EFFECTIVE_ORG_STATUS_LABELS, EFFECTIVE_ORG_STATUS_COLORS,
  type EffectiveOrgStatus,
} from "@/lib/constants"
import type { LegalEntityType, NatureOfOperations, VendorStatus, OrgOnboardingDraft } from "@/lib/types"
import { format } from "date-fns"
import { toast } from "sonner"

const MEMBER_STATUS_COLORS: Record<string, string> = {
  invited: "bg-yellow-100 text-yellow-800 border-yellow-200",
  active: "bg-green-100 text-green-800 border-green-200",
  suspended: "bg-red-100 text-red-800 border-red-200",
}

// Mirrors the backend's computeEffectiveOrgStatus (superadmin.ts) -- kept in
// lockstep with that mapping. Computed locally here (rather than reused from
// the list payload) since this page already has the org + full draft object.
function computeEffectiveOrgStatus(
  orgStatus: "active" | "suspended" | "archived",
  draft: Pick<OrgOnboardingDraft, "status" | "rejection_reason"> | null
): EffectiveOrgStatus {
  if (orgStatus === "archived") return "archived"
  if (orgStatus === "suspended") return "suspended"
  if (!draft) return "active"
  if (draft.status === "submitted") return "pending_verification"
  if (draft.status === "rejected" || (draft.status === "draft" && draft.rejection_reason)) return "suspended"
  if (draft.status === "approved") return "active"
  return "onboarding_pending"
}

// Role-tier order used purely for the chart's visual grouping -- there is no
// manager/subordinate hierarchy anywhere in this schema, so this groups by
// highest assigned role tier, not an actual reporting line.
const ROLE_TIER_ORDER = ["Admin", "Manager", "Finance", "Associate"]

function highestTier(m: PlatformOrgMember): string {
  return ROLE_TIER_ORDER.find((t) => m.roleNames.includes(t)) ?? "Other"
}

function memberRoleLabel(m: PlatformOrgMember) {
  return m.roleNames.length > 0 ? m.roleNames.join(", ") : "—"
}

type PendingAction = { kind: "approve" | "reject" } | { kind: "suspend" | "archive" | "reactivate" }

export function OrgDetailPage() {
  const { orgId } = useParams<{ orgId: string }>()
  const navigate = useNavigate()
  const { data: detail, isLoading } = usePlatformOrganizationDetail(orgId ?? null)
  const updateStatus = useUpdateOrganizationStatus()
  const review = useReviewOrgOnboarding()
  const getOnboardingDocUrl = useOrgOnboardingDocumentSignedUrl()

  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null)
  const [note, setNote] = useState("")

  function closeDialog() {
    setPendingAction(null)
    setNote("")
  }

  async function openOnboardingDoc(path: string) {
    try { window.open(await getOnboardingDocUrl(path), "_blank") }
    catch { toast.error("Could not open document") }
  }

  async function handleConfirm() {
    if (!pendingAction || !orgId) return
    try {
      if (pendingAction.kind === "approve") {
        await review.mutateAsync({ draft_id: detail!.onboardingDraft!.id, decision: "approved" })
        toast.success("Onboarding approved")
      } else if (pendingAction.kind === "reject") {
        if (!note.trim()) return toast.error("A reason is required to reject an onboarding submission")
        await review.mutateAsync({ draft_id: detail!.onboardingDraft!.id, decision: "rejected", reason: note.trim() })
        toast.success("Onboarding sent back for changes")
      } else {
        const status = pendingAction.kind === "reactivate" ? "active" : pendingAction.kind === "suspend" ? "suspended" : "archived"
        if (status !== "active" && !note.trim()) return toast.error(`A reason is required to ${pendingAction.kind} an organization`)
        await updateStatus.mutateAsync({ id: orgId, status, reason: status !== "active" ? note.trim() : undefined })
        toast.success(`Organization ${status}`)
      }
      closeDialog()
    } catch (e: unknown) {
      toast.error((e as Error).message ?? "Action failed")
    }
  }

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        {[1, 2, 3].map((i) => <div key={i} className="h-20 rounded-xl bg-muted animate-pulse" />)}
      </div>
    )
  }

  if (!detail) {
    return (
      <div className="p-6">
        <EmptyState title="Organization not found" description="This organization may have been removed." action={<Button onClick={() => navigate(-1)}>Go back</Button>} />
      </div>
    )
  }

  const { organization: org, members, vendors, onboardingDraft: draft } = detail
  const isPending = draft?.status === "submitted"
  const effectiveStatus = computeEffectiveOrgStatus(org.status, draft)
  const membersByTier = ROLE_TIER_ORDER.map((tier) => ({ tier, members: members.filter((m) => highestTier(m) === tier) })).filter((g) => g.members.length > 0)
  const otherTier = members.filter((m) => highestTier(m) === "Other")

  return (
    <AnimatedPage>
      <div className="flex flex-col h-full">
        {/* Page header */}
        <div className="px-6 pt-6 pb-4 border-b bg-card">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <Button variant="ghost" size="sm" className="h-7 px-2 -ml-2 text-muted-foreground" onClick={() => navigate(-1)}>
                  <SolarDuotoneIcon icon={ArrowLeft01Icon} size={14} strokeWidth={1.5} className="mr-1" />
                  Organizations
                </Button>
                <span className="text-muted-foreground/40 text-sm">/</span>
                <span className="text-sm text-muted-foreground truncate max-w-[200px]">{org.name}</span>
              </div>
              <h1 className="text-xl font-bold tracking-tight">{org.name}</h1>
              <p className="text-sm text-muted-foreground mt-0.5">{org.org_code ?? "Organization code pending"}</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Badge variant="outline" className={EFFECTIVE_ORG_STATUS_COLORS[effectiveStatus]}>
                {EFFECTIVE_ORG_STATUS_LABELS[effectiveStatus]}
              </Badge>
            </div>
          </div>
        </div>

        {/* Action bar */}
        <div className="border-b px-6 py-2.5 flex flex-wrap gap-2 bg-muted/30">
          {isPending && (
            <>
              <Button size="sm" variant="success" className="h-8 text-xs" onClick={() => setPendingAction({ kind: "approve" })}>
                Approve Onboarding
              </Button>
              <Button size="sm" variant="danger" className="h-8 text-xs" onClick={() => setPendingAction({ kind: "reject" })}>
                Reject Onboarding
              </Button>
            </>
          )}
          {org.status !== "active" && (
            <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => setPendingAction({ kind: "reactivate" })}>Reactivate</Button>
          )}
          {org.status === "active" && (
            <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => setPendingAction({ kind: "suspend" })}>Suspend</Button>
          )}
          {org.status !== "archived" && (
            <Button size="sm" variant="destructive" className="h-8 text-xs" onClick={() => setPendingAction({ kind: "archive" })}>Archive</Button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          <Tabs defaultValue="overview">
            <TabsList className="mb-6 h-10 gap-1 bg-muted/50 p-1 rounded-xl">
              <TabsTrigger value="overview" className="rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm gap-1.5 text-sm h-8 px-3">
                <SolarDuotoneIcon icon={Building06Icon} size={14} strokeWidth={1.5} />
                Overview
              </TabsTrigger>
              <TabsTrigger value="members" className="rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm gap-1.5 text-sm h-8 px-3">
                <SolarDuotoneIcon icon={UserGroup02Icon} size={14} strokeWidth={1.5} />
                Members
                {members.length > 0 && <span className="tab-count">{members.length}</span>}
              </TabsTrigger>
              <TabsTrigger value="vendors" className="rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm gap-1.5 text-sm h-8 px-3">
                <SolarDuotoneIcon icon={Briefcase01Icon} size={14} strokeWidth={1.5} />
                Vendors
                {vendors.length > 0 && <span className="tab-count">{vendors.length}</span>}
              </TabsTrigger>
            </TabsList>

            {/* ── Overview ── */}
            <TabsContent value="overview" className="space-y-4 mt-0">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Card className="shadow-none">
                  <CardHeader className="pb-3 border-b">
                    <CardTitle className="text-sm font-semibold flex items-center gap-2">
                      <SolarDuotoneIcon icon={Building06Icon} size={15} strokeWidth={1.5} className="text-muted-foreground" />
                      Organization Details
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-4 space-y-3 text-sm">
                    {[
                      { label: "Slug", value: org.slug },
                      { label: "Organization code", value: org.org_code ?? "—" },
                      { label: "Role mode", value: <span className="capitalize">{org.role_mode}</span> },
                      { label: "Created", value: format(new Date(org.created_at), "dd MMM yyyy") },
                    ].map(({ label, value }) => (
                      <div key={label} className="flex justify-between gap-2">
                        <span className="text-muted-foreground">{label}</span>
                        <span className="font-medium text-right">{value}</span>
                      </div>
                    ))}
                  </CardContent>
                </Card>

                {draft && (
                  <Card className="shadow-none">
                    <CardHeader className="pb-3 border-b">
                      <CardTitle className="text-sm font-semibold flex items-center gap-2">
                        <SolarDuotoneIcon icon={Clock01Icon} size={15} strokeWidth={1.5} className="text-muted-foreground" />
                        Onboarding Submission
                        <Badge variant="outline" className="ml-auto">{draft.status}</Badge>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-4 space-y-3 text-sm">
                      <div className="flex justify-between gap-2">
                        <span className="text-muted-foreground">Entity type</span>
                        <span className="font-medium text-right">{draft.legal_entity_type ? LEGAL_ENTITY_TYPE_LABELS[draft.legal_entity_type as LegalEntityType] : "—"}</span>
                      </div>
                      <div className="flex justify-between gap-2">
                        <span className="text-muted-foreground">Incorporated</span>
                        <span className="font-medium text-right">{draft.date_of_incorporation ?? "—"}</span>
                      </div>
                      <div className="flex justify-between gap-2">
                        <span className="text-muted-foreground">Employees</span>
                        <span className="font-medium text-right">{draft.employee_count_range ?? "—"}</span>
                      </div>
                      {draft.rejection_reason && (
                        <>
                          <Separator />
                          <div>
                            <p className="text-muted-foreground mb-1">Rejection reason</p>
                            <p className="text-xs text-destructive">{draft.rejection_reason}</p>
                          </div>
                        </>
                      )}
                      <Separator />
                      <div>
                        <p className="text-muted-foreground mb-1">Authorized Signatory</p>
                        <p className="text-xs text-muted-foreground">
                          {draft.signatory_name ?? "—"} · {draft.signatory_designation ?? "—"} · {draft.signatory_email ?? "—"} · {draft.signatory_mobile ?? "—"}
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {draft && (draft.locations ?? []).length > 0 && (
                  <Card className="shadow-none md:col-span-2">
                    <CardHeader className="pb-3 border-b">
                      <CardTitle className="text-sm font-semibold flex items-center gap-2">
                        <SolarDuotoneIcon icon={Building06Icon} size={15} strokeWidth={1.5} className="text-muted-foreground" />
                        Locations ({draft.locations!.length})
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                      {draft.locations!.map((loc) => (
                        <div key={loc.id} className="rounded-lg border p-3 text-sm space-y-2">
                          <div className="flex items-center justify-between gap-2">
                            <p className="font-medium">{loc.location_name}</p>
                            {loc.is_registered_office && <Badge className="h-4 px-1 text-[9px]">Registered Office</Badge>}
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {[loc.address, loc.city, loc.state, loc.pincode].filter(Boolean).join(", ") || "No address on file"}
                          </p>
                          <div className="grid grid-cols-2 gap-1 text-xs text-muted-foreground">
                            <span>Employees: {loc.employee_count ?? "—"}</span>
                            <span>Nature: {loc.nature_of_operations ? NATURE_OF_OPERATIONS_LABELS[loc.nature_of_operations as NatureOfOperations] : "—"}</span>
                            <span>Women employees: {loc.has_women_employees === null ? "—" : loc.has_women_employees ? "Yes" : "No"}</span>
                            <span>Contract labour: {loc.has_contract_labour === null ? "—" : loc.has_contract_labour ? "Yes" : "No"}</span>
                            <span>Shift operations: {loc.has_shift_operations === null ? "—" : loc.has_shift_operations ? "Yes" : "No"}</span>
                          </div>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                )}

                {draft && (
                  <Card className="shadow-none md:col-span-2">
                    <CardHeader className="pb-3 border-b">
                      <CardTitle className="text-sm font-semibold flex items-center gap-2">
                        <SolarDuotoneIcon icon={File01Icon} size={15} strokeWidth={1.5} className="text-muted-foreground" />
                        Documents ({(draft.documents ?? []).length})
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-4 space-y-2">
                      {(draft.documents ?? []).length === 0 && <p className="text-sm text-muted-foreground">None uploaded</p>}
                      {(draft.documents ?? []).map((doc) => (
                        <div key={doc.id} className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2">
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="p-1.5 rounded-lg shrink-0 bg-muted">
                              <SolarDuotoneIcon icon={File01Icon} size={15} strokeWidth={1.5} className="text-muted-foreground" />
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-medium">{ORG_ONBOARDING_DOCUMENT_LABELS[doc.document_type]}</p>
                              <p className="text-xs text-muted-foreground truncate">{doc.file_name}</p>
                            </div>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-foreground shrink-0"
                            onClick={() => openOnboardingDoc(doc.storage_path)}
                          >
                            <SolarDuotoneIcon icon={EyeIcon} size={15} strokeWidth={1.5} />
                          </Button>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                )}
              </div>
            </TabsContent>

            {/* ── Members ── */}
            <TabsContent value="members" className="space-y-4 mt-0">
              {members.length === 0 ? (
                <EmptyState title="No members yet" description="This organization has no members." />
              ) : (
                <>
                  <Card className="shadow-none">
                    <CardHeader className="pb-3 border-b">
                      <CardTitle className="text-sm font-semibold flex items-center gap-2">
                        <SolarDuotoneIcon icon={UserGroup02Icon} size={15} strokeWidth={1.5} className="text-muted-foreground" />
                        Team Structure
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-5 space-y-6">
                      {[...membersByTier, ...(otherTier.length > 0 ? [{ tier: "Other", members: otherTier }] : [])].map(({ tier, members: tierMembers }, i) => (
                        <div key={tier} className="space-y-2">
                          {i > 0 && <div className="mx-auto h-4 w-px bg-border" />}
                          <p className="text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground">{tier}</p>
                          <div className="flex flex-wrap justify-center gap-2">
                            {tierMembers.map((m) => (
                              <div key={m.id} className="skeuo-surface flex items-center gap-2.5 rounded-xl border border-white/55 px-3 py-2 text-left text-xs dark:border-white/10">
                                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                                  {(m.profile?.full_name ?? m.profile?.email ?? "?").charAt(0).toUpperCase()}
                                </div>
                                <div className="min-w-0">
                                  <p className="font-medium truncate">{m.profile?.full_name ?? "—"}{m.isPrimary && " (primary)"}</p>
                                  <p className="text-muted-foreground truncate">{m.profile?.email}</p>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </CardContent>
                  </Card>

                  <div className="rounded-xl border bg-card overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Name</TableHead>
                          <TableHead>Email</TableHead>
                          <TableHead>Role</TableHead>
                          <TableHead>Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {members.map((m) => (
                          <TableRow key={m.id}>
                            <TableCell className="whitespace-nowrap">{m.profile?.full_name ?? "—"}{m.isPrimary && <span className="text-xs text-muted-foreground"> (primary)</span>}</TableCell>
                            <TableCell className="text-muted-foreground whitespace-nowrap">{m.profile?.email ?? "—"}</TableCell>
                            <TableCell className="text-muted-foreground whitespace-nowrap">{memberRoleLabel(m)}</TableCell>
                            <TableCell>
                              <Badge variant="outline" className={`whitespace-nowrap ${MEMBER_STATUS_COLORS[m.status]}`}>{m.status}</Badge>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </>
              )}
            </TabsContent>

            {/* ── Vendors ── */}
            <TabsContent value="vendors" className="space-y-4 mt-0">
              {vendors.length === 0 ? (
                <EmptyState title="No vendors yet" description="This organization has no onboarded vendors." />
              ) : (
                <div className="rounded-xl border bg-card overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Company</TableHead>
                        <TableHead>Contact</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {vendors.map((v: PlatformOrgVendor) => (
                        <TableRow key={v.id}>
                          <TableCell className="whitespace-nowrap">{v.companyName}</TableCell>
                          <TableCell className="text-muted-foreground whitespace-nowrap">{v.contactName ?? v.contactEmail ?? "—"}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className={VENDOR_STATUS_COLORS[v.status as VendorStatus]}>
                              {VENDOR_STATUS_LABELS[v.status as VendorStatus] ?? v.status}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>

        {/* Confirmation dialog */}
        <Dialog open={!!pendingAction} onOpenChange={(o) => !o && closeDialog()}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {pendingAction?.kind === "approve" && "Approve onboarding?"}
                {pendingAction?.kind === "reject" && "Reject onboarding?"}
                {pendingAction?.kind === "suspend" && "Suspend organization?"}
                {pendingAction?.kind === "archive" && "Archive organization?"}
                {pendingAction?.kind === "reactivate" && "Reactivate organization?"}
              </DialogTitle>
              <DialogDescription>
                {pendingAction?.kind === "approve" && `This will approve ${org.name}'s onboarding submission.`}
                {pendingAction?.kind === "reject" && `This will send ${org.name}'s onboarding submission back for changes.`}
                {pendingAction?.kind === "suspend" && `${org.name} will be suspended.`}
                {pendingAction?.kind === "archive" && `${org.name} will be archived.`}
                {pendingAction?.kind === "reactivate" && `${org.name} will be reactivated.`}
              </DialogDescription>
            </DialogHeader>
            {pendingAction?.kind && pendingAction.kind !== "approve" && pendingAction.kind !== "reactivate" && (
              <div className="space-y-2">
                <Label className="text-sm">
                  {pendingAction.kind === "reject" ? "Reason (required)" : "Note (required)"}
                </Label>
                <Textarea
                  placeholder={
                    pendingAction.kind === "reject"
                      ? "What needs to change before resubmission?"
                      : `Why is this organization being ${pendingAction.kind === "suspend" ? "suspended" : "archived"}?`
                  }
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={3}
                />
              </div>
            )}
            <Separator />
            <DialogFooter>
              <Button variant="outline" onClick={closeDialog} disabled={updateStatus.isPending || review.isPending}>Cancel</Button>
              <Button
                variant={pendingAction?.kind === "approve" || pendingAction?.kind === "reactivate" ? "success" : "danger"}
                onClick={handleConfirm}
                disabled={
                  updateStatus.isPending || review.isPending ||
                  (!!pendingAction?.kind && pendingAction.kind !== "approve" && pendingAction.kind !== "reactivate" && !note.trim())
                }
              >
                {updateStatus.isPending || review.isPending ? "Processing…" : "Confirm"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AnimatedPage>
  )
}
