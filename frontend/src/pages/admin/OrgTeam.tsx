import { useState } from "react"
import { Link } from "react-router-dom"
import {
  useOrgMembers, useInviteOrgMember, useOrgTeams, useCreateOrgTeam,
  useAssignableOrgRoles, useOrgAssignablePermissions, useCreateCustomOrgRole, useDeleteCustomOrgRole,
  useApprovalPolicy, useSetApprovalPolicy,
  useMatchTolerance, useSetMatchTolerance,
  useContractApprovalThresholds, useSetContractApprovalThresholds,
  useSetBaseCurrency,
} from "@/hooks/useOrgMembers"
import { useOrg } from "@/contexts/OrgContext"
import { AnimatedPage } from "@/components/shared/AnimatedPage"
import { TeamRoleAssignmentEditor, assignmentRowsToPayload, type AssignmentRow } from "@/components/shared/TeamRoleAssignmentEditor"
import { CustomRoleManagerDialog } from "@/components/shared/CustomRoleManagerDialog"
import { ApprovalPolicyDialog } from "@/components/shared/ApprovalPolicyDialog"
import { MatchToleranceDialog } from "@/components/shared/MatchToleranceDialog"
import { ContractApprovalThresholdsDialog } from "@/components/shared/ContractApprovalThresholdsDialog"
import { BaseCurrencyDialog } from "@/components/shared/BaseCurrencyDialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogBody } from "@/components/ui/dialog"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { EyeIcon } from "@/components/shared/SolarIcon"
import { SolarDuotoneIcon } from "@/components/shared/SolarIcon"
import type { OrgMember } from "@/hooks/useOrgMembers"
import { toast } from "sonner"

const STATUS_COLORS: Record<string, string> = {
  active: "bg-green-100 text-green-800 border-green-200",
  invited: "bg-blue-100 text-blue-800 border-blue-200",
  suspended: "bg-orange-100 text-orange-800 border-orange-200",
}

function renderTeams(member: OrgMember) {
  const parts = [
    ...member.teamAssignments.map((a) => `${a.teamName}: ${a.roleName}`),
    ...member.directRoleNames.map((r) => `${r} (no team)`),
  ]
  return parts.length > 0 ? parts.join(", ") : "—"
}

// A single "Manage" link per row instead of a wall of per-row action
// buttons (Edit roles/Restrictions/Temporary Access/Legal Entity Scope/
// Suspend/Resend/Revoke) -- those all live on OrgMemberDetail.tsx now.
// This page keeps only the org-wide settings (Teams/Roles/Approval Policy/
// Match Tolerance/Base Currency/Invite) and the member list itself.
export function OrgTeam() {
  const { data: members = [], isLoading } = useOrgMembers()
  const { data: assignable } = useAssignableOrgRoles()
  const { data: teams = [] } = useOrgTeams()
  const { activeOrg } = useOrg()
  const isViewerAdmin = !!activeOrg?.roleNames.includes("Admin")
  const inviteMember = useInviteOrgMember()
  const createTeam = useCreateOrgTeam()
  const { data: assignablePermissions = [] } = useOrgAssignablePermissions()
  const createCustomRole = useCreateCustomOrgRole()
  const deleteCustomRole = useDeleteCustomOrgRole()
  const { data: approvalPolicy = [] } = useApprovalPolicy()
  const setApprovalPolicy = useSetApprovalPolicy()
  const { data: matchTolerance } = useMatchTolerance()
  const setMatchTolerance = useSetMatchTolerance()
  const { data: contractApprovalThresholds } = useContractApprovalThresholds()
  const setContractApprovalThresholds = useSetContractApprovalThresholds()
  const setBaseCurrency = useSetBaseCurrency()

  const [inviting, setInviting] = useState(false)
  const [email, setEmail] = useState("")
  const [fullName, setFullName] = useState("")
  const [assignmentRows, setAssignmentRows] = useState<AssignmentRow[]>([{ teamId: null, roleId: null }])
  const [managingTeams, setManagingTeams] = useState(false)
  const [newTeamName, setNewTeamName] = useState("")
  const [managingRoles, setManagingRoles] = useState(false)
  const [managingApprovalPolicy, setManagingApprovalPolicy] = useState(false)
  const [managingMatchTolerance, setManagingMatchTolerance] = useState(false)
  const [managingContractApprovalThresholds, setManagingContractApprovalThresholds] = useState(false)
  const [managingBaseCurrency, setManagingBaseCurrency] = useState(false)

  const isSolo = assignable?.roleMode === "solo"
  const roles = assignable?.roles ?? []

  function resetInviteForm() {
    setEmail("")
    setFullName("")
    setAssignmentRows([{ teamId: null, roleId: null }])
  }

  async function handleInvite() {
    if (!email.trim() || !fullName.trim()) return toast.error("Email and name are required")
    const assignments = isSolo ? [] : assignmentRowsToPayload(assignmentRows)
    if (!isSolo && assignments.length === 0) return toast.error("Select at least one role")
    try {
      const result = await inviteMember.mutateAsync({
        email: email.trim(), fullName: fullName.trim(),
        roleIds: isSolo ? [] : [...new Set(assignments.map((a) => a.roleId))],
        assignments: isSolo ? undefined : assignments,
      })
      toast.success(result.inviteSent ? `Invite sent to ${result.email}` : `${result.email} added to this organization`)
      setInviting(false)
      resetInviteForm()
    } catch (e: unknown) {
      toast.error((e as Error).message ?? "Failed to invite member")
    }
  }

  async function handleCreateTeam() {
    if (!newTeamName.trim()) return toast.error("Team name is required")
    try {
      await createTeam.mutateAsync({ name: newTeamName.trim() })
      toast.success("Team created")
      setNewTeamName("")
    } catch (e: unknown) {
      toast.error((e as Error).message ?? "Failed to create team")
    }
  }

  async function handleCreateCustomRole(input: { name: string; description?: string; permissionIds: string[] }) {
    try {
      await createCustomRole.mutateAsync(input)
      toast.success("Custom role created")
    } catch (e: unknown) {
      toast.error((e as Error).message ?? "Failed to create custom role")
    }
  }

  async function handleDeleteCustomRole(roleId: string) {
    try {
      await deleteCustomRole.mutateAsync({ roleId })
      toast.success("Custom role deleted")
    } catch (e: unknown) {
      toast.error((e as Error).message ?? "Failed to delete custom role")
    }
  }

  async function handleSaveApprovalPolicy(roleId: string, thresholdAmount: number | null, clear: boolean) {
    try {
      await setApprovalPolicy.mutateAsync({ roleId, thresholdAmount, clear })
      toast.success(clear ? "Reverted to no limit" : "Approval limit saved")
    } catch (e: unknown) {
      toast.error((e as Error).message ?? "Failed to update approval policy")
    }
  }

  async function handleSaveMatchTolerance(toleranceType: "amount" | "percentage", toleranceValue: number) {
    try {
      await setMatchTolerance.mutateAsync({ toleranceType, toleranceValue })
      toast.success("Match tolerance updated")
      setManagingMatchTolerance(false)
    } catch (e: unknown) {
      toast.error((e as Error).message ?? "Failed to update match tolerance")
    }
  }

  async function handleSaveContractApprovalThresholds(mediumThreshold: number, highThreshold: number) {
    try {
      await setContractApprovalThresholds.mutateAsync({ mediumThreshold, highThreshold })
      toast.success("Contract approval thresholds updated")
      setManagingContractApprovalThresholds(false)
    } catch (e: unknown) {
      toast.error((e as Error).message ?? "Failed to update contract approval thresholds")
    }
  }

  async function handleSaveBaseCurrency(currency: string) {
    try {
      await setBaseCurrency.mutateAsync(currency)
      toast.success("Base currency updated — reloading…")
      setManagingBaseCurrency(false)
      window.location.reload()
    } catch (e: unknown) {
      toast.error((e as Error).message ?? "Failed to update base currency")
    }
  }

  return (
    <AnimatedPage className="space-y-6">
      {isViewerAdmin && (
        <div className="flex items-center justify-end gap-2">
          {!isSolo && <Button variant="outline" onClick={() => setManagingTeams(true)}>Manage Teams</Button>}
          {!isSolo && <Button variant="outline" onClick={() => setManagingRoles(true)}>Manage Roles</Button>}
          {!isSolo && <Button variant="outline" onClick={() => setManagingApprovalPolicy(true)}>Approval Policy</Button>}
          <Button variant="outline" onClick={() => setManagingMatchTolerance(true)}>Match Tolerance</Button>
          <Button variant="outline" onClick={() => setManagingContractApprovalThresholds(true)}>Contract Approval Thresholds</Button>
          <Button variant="outline" onClick={() => setManagingBaseCurrency(true)}>Base Currency</Button>
          <Button onClick={() => setInviting(true)}>Invite Member</Button>
        </div>
      )}

      <div className="rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Roles</TableHead>
              {!isSolo && <TableHead>Teams</TableHead>}
              <TableHead className="w-20" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow><TableCell colSpan={isSolo ? 5 : 6} className="text-center text-muted-foreground py-8">Loading…</TableCell></TableRow>
            )}
            {!isLoading && members.length === 0 && (
              <TableRow><TableCell colSpan={isSolo ? 5 : 6} className="text-center text-muted-foreground py-8">No members yet.</TableCell></TableRow>
            )}
            {members.map((m) => (
              <TableRow key={m.id}>
                <TableCell className="font-medium">{m.profile?.full_name ?? "—"}{m.isPrimary && <Badge className="ml-2 h-4 px-1 text-[9px]">You</Badge>}</TableCell>
                <TableCell className="text-muted-foreground">{m.profile?.email}</TableCell>
                <TableCell><Badge variant="outline" className={STATUS_COLORS[m.status]}>{m.status}</Badge></TableCell>
                <TableCell>{m.roleNames.join(", ") || "—"}</TableCell>
                {!isSolo && <TableCell className="text-muted-foreground text-sm">{renderTeams(m)}</TableCell>}
                <TableCell>
                  <Button asChild size="sm" variant="ghost" className="h-8 px-2 gap-1.5 text-xs">
                    <Link to={`/admin/team/${m.id}`}>
                      <SolarDuotoneIcon icon={EyeIcon} size={14} strokeWidth={1.5} />
                      Manage
                    </Link>
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={inviting} onOpenChange={(o) => { setInviting(o); if (!o) resetInviteForm() }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Invite Member</DialogTitle></DialogHeader>
          <DialogBody className="space-y-4">
            <div className="space-y-1.5">
              <Label>Full name</Label>
              <Input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Jane Doe" />
            </div>
            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="jane@company.com" />
            </div>
            {isSolo ? (
              <p className="text-xs text-muted-foreground">
                This organization is in solo mode — the new member is automatically granted full (Admin + Manager + Associate) access.
              </p>
            ) : (
              <TeamRoleAssignmentEditor rows={assignmentRows} onChange={setAssignmentRows} teams={teams} roles={roles} />
            )}
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setInviting(false); resetInviteForm() }}>Cancel</Button>
            <Button onClick={handleInvite} disabled={inviteMember.isPending}>
              {inviteMember.isPending ? "Inviting…" : "Invite"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={managingTeams} onOpenChange={setManagingTeams}>
        <DialogContent>
          <DialogHeader><DialogTitle>Manage Teams</DialogTitle></DialogHeader>
          <DialogBody className="space-y-4">
            <div className="flex gap-2">
              <Input
                value={newTeamName}
                onChange={(e) => setNewTeamName(e.target.value)}
                placeholder="New team name (e.g. Finance)"
                onKeyDown={(e) => { if (e.key === "Enter") handleCreateTeam() }}
              />
              <Button onClick={handleCreateTeam} disabled={createTeam.isPending}>Create</Button>
            </div>
            <div className="space-y-1">
              {teams.length === 0 && <p className="text-sm text-muted-foreground">No teams yet.</p>}
              {teams.map((t) => (
                <div key={t.id} className="text-sm rounded-md border px-3 py-2">{t.name}</div>
              ))}
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setManagingTeams(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <CustomRoleManagerDialog
        open={managingRoles}
        onClose={() => setManagingRoles(false)}
        roles={roles}
        permissions={assignablePermissions}
        onCreate={handleCreateCustomRole}
        onDelete={handleDeleteCustomRole}
        isCreating={createCustomRole.isPending}
        isDeleting={deleteCustomRole.isPending}
      />

      <ApprovalPolicyDialog
        open={managingApprovalPolicy}
        onClose={() => setManagingApprovalPolicy(false)}
        policy={approvalPolicy}
        onSave={handleSaveApprovalPolicy}
        isSaving={setApprovalPolicy.isPending}
      />

      <MatchToleranceDialog
        open={managingMatchTolerance}
        onClose={() => setManagingMatchTolerance(false)}
        toleranceType={matchTolerance?.tolerance_type ?? "amount"}
        toleranceValue={matchTolerance?.tolerance_value ?? 0}
        onSave={handleSaveMatchTolerance}
        isSaving={setMatchTolerance.isPending}
      />

      <ContractApprovalThresholdsDialog
        open={managingContractApprovalThresholds}
        onClose={() => setManagingContractApprovalThresholds(false)}
        mediumThreshold={contractApprovalThresholds?.medium_threshold ?? 500000}
        highThreshold={contractApprovalThresholds?.high_threshold ?? 2000000}
        onSave={handleSaveContractApprovalThresholds}
        isSaving={setContractApprovalThresholds.isPending}
      />

      <BaseCurrencyDialog
        open={managingBaseCurrency}
        onClose={() => setManagingBaseCurrency(false)}
        currentCurrency={activeOrg?.baseCurrency ?? "INR"}
        onSave={handleSaveBaseCurrency}
        isSaving={setBaseCurrency.isPending}
      />
    </AnimatedPage>
  )
}
