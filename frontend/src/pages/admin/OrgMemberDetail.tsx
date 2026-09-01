import { useState } from "react"
import { useParams, Link } from "react-router-dom"
import {
  useOrgMembers, useAssignableOrgRoles, useUpdateOrgMemberRoles, useOrgTeams,
  useSuspendOrgMember, useReinstateOrgMember, useRevokeOrgMemberInvite, useResendOrgMemberInvite,
  useOrgMemberRestrictions, useSetOrgMemberRestriction,
  useOrgMemberDelegations, useDelegateOrgRole, useRevokeOrgRoleDelegation,
  useOrgLegalEntityScopeOptions, useOrgMemberLegalEntityScope, useSetOrgMemberLegalEntityScope,
  useSetOrgMemberManager,
} from "@/hooks/useOrgMembers"
import { useOrg } from "@/contexts/OrgContext"
import { AnimatedPage } from "@/components/shared/AnimatedPage"
import { TeamRoleAssignmentEditor, assignmentRowsToPayload, type AssignmentRow } from "@/components/shared/TeamRoleAssignmentEditor"
import { PermissionRestrictionsDialog } from "@/components/shared/PermissionRestrictionsDialog"
import { TemporaryAccessDialog } from "@/components/shared/TemporaryAccessDialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogBody } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { ArrowLeft01Icon } from "@/components/shared/SolarIcon"
import { SolarDuotoneIcon } from "@/components/shared/SolarIcon"
import { toast } from "sonner"

const STATUS_COLORS: Record<string, string> = {
  active: "bg-green-100 text-green-800 border-green-200",
  invited: "bg-blue-100 text-blue-800 border-blue-200",
  suspended: "bg-orange-100 text-orange-800 border-orange-200",
}

// One member's full detail + every action that used to be a same-row button
// on OrgTeam.tsx's table (Edit Roles/Restrictions/Temporary Access/Legal
// Entity Scope/Suspend/Resend/Revoke) -- moved here so that table only ever
// needs a single "Manage" link per row.
export function OrgMemberDetail() {
  const { memberId } = useParams<{ memberId: string }>()
  const { data: members = [], isLoading } = useOrgMembers()
  const member = members.find((m) => m.id === memberId)

  const { data: assignable } = useAssignableOrgRoles()
  const { data: teams = [] } = useOrgTeams()
  const { activeOrg } = useOrg()
  const isViewerAdmin = !!activeOrg?.roleNames.includes("Admin")
  const isSolo = assignable?.roleMode === "solo"
  const roles = assignable?.roles ?? []

  const updateRoles = useUpdateOrgMemberRoles()
  const suspendMember = useSuspendOrgMember()
  const reinstateMember = useReinstateOrgMember()
  const revokeInvite = useRevokeOrgMemberInvite()
  const resendInvite = useResendOrgMemberInvite()
  const { data: legalEntityOptions = [] } = useOrgLegalEntityScopeOptions()
  const setLegalEntityScope = useSetOrgMemberLegalEntityScope()
  const setManager = useSetOrgMemberManager()

  const [editingRoles, setEditingRoles] = useState(false)
  const [editAssignmentRows, setEditAssignmentRows] = useState<AssignmentRow[]>([{ teamId: null, roleId: null }])
  const [restricting, setRestricting] = useState(false)
  const [delegating, setDelegating] = useState(false)
  const [scoping, setScoping] = useState(false)
  const [scopeSelection, setScopeSelection] = useState<string[] | null>(null)
  const [settingManager, setSettingManager] = useState(false)
  const [managerSelection, setManagerSelection] = useState<string | null>(null)

  const { data: restrictionsData } = useOrgMemberRestrictions(restricting ? member?.id : undefined)
  const setRestriction = useSetOrgMemberRestriction()
  const { data: delegationsData = [] } = useOrgMemberDelegations(delegating ? member?.id : undefined)
  const delegateRole = useDelegateOrgRole()
  const revokeDelegation = useRevokeOrgRoleDelegation()
  const { data: currentScope = [], isLoading: scopeLoading } = useOrgMemberLegalEntityScope(scoping ? member?.id : undefined)
  const effectiveScope = scopeSelection ?? currentScope

  function openEditRoles() {
    if (!member) return
    const rows: AssignmentRow[] = [
      ...member.teamAssignments.map((a) => ({ teamId: a.teamId, roleId: a.roleId })),
      ...member.directRoleNames.map((name) => ({ teamId: null, roleId: roles.find((r) => r.name === name)?.id ?? null })),
    ]
    setEditAssignmentRows(rows.length > 0 ? rows : [{ teamId: null, roleId: null }])
    setEditingRoles(true)
  }

  async function handleSaveRoles() {
    if (!member) return
    const assignments = assignmentRowsToPayload(editAssignmentRows)
    if (assignments.length === 0) return toast.error("Select at least one role")
    try {
      await updateRoles.mutateAsync({
        memberId: member.id,
        roleIds: [...new Set(assignments.map((a) => a.roleId))],
        assignments,
      })
      toast.success("Roles updated")
      setEditingRoles(false)
    } catch (e: unknown) {
      toast.error((e as Error).message ?? "Failed to update roles")
    }
  }

  async function handleSuspend() {
    if (!member) return
    try {
      await suspendMember.mutateAsync({ memberId: member.id })
      toast.success("Member suspended")
    } catch (e: unknown) {
      toast.error((e as Error).message ?? "Failed to suspend")
    }
  }

  async function handleReinstate() {
    if (!member) return
    try {
      await reinstateMember.mutateAsync({ memberId: member.id })
      toast.success("Member reinstated")
    } catch (e: unknown) {
      toast.error((e as Error).message ?? "Failed to reinstate")
    }
  }

  async function handleRevoke() {
    if (!member) return
    try {
      await revokeInvite.mutateAsync({ memberId: member.id })
      toast.success("Invitation revoked")
    } catch (e: unknown) {
      toast.error((e as Error).message ?? "Failed to revoke invitation")
    }
  }

  async function handleResend() {
    if (!member) return
    try {
      await resendInvite.mutateAsync({ memberId: member.id })
      toast.success("Invitation resent")
    } catch (e: unknown) {
      toast.error((e as Error).message ?? "Failed to resend invitation")
    }
  }

  async function handleToggleRestriction(permissionId: string, restricted: boolean, reason?: string) {
    if (!member) return
    try {
      await setRestriction.mutateAsync({ memberId: member.id, permissionId, restricted, reason })
      toast.success(restricted ? "Permission restricted" : "Restriction removed")
    } catch (e: unknown) {
      toast.error((e as Error).message ?? "Failed to update restriction")
    }
  }

  async function handleGrantDelegation(roleId: string, validUntil: string, reason?: string) {
    if (!member) return
    try {
      await delegateRole.mutateAsync({ memberId: member.id, roleId, validUntil, reason })
      toast.success("Temporary access granted")
    } catch (e: unknown) {
      toast.error((e as Error).message ?? "Failed to grant temporary access")
    }
  }

  async function handleRevokeDelegation(roleId: string) {
    if (!member) return
    try {
      await revokeDelegation.mutateAsync({ memberId: member.id, roleId })
      toast.success("Temporary access revoked")
    } catch (e: unknown) {
      toast.error((e as Error).message ?? "Failed to revoke temporary access")
    }
  }

  function openScoping() {
    setScopeSelection(null)
    setScoping(true)
  }

  function openSettingManager() {
    if (!member) return
    setManagerSelection(member.reportsTo)
    setSettingManager(true)
  }

  async function handleSaveManager() {
    if (!member) return
    try {
      await setManager.mutateAsync({ memberId: member.id, reportsTo: managerSelection })
      toast.success("Reporting line updated")
      setSettingManager(false)
    } catch (e: unknown) {
      toast.error((e as Error).message ?? "Failed to update reporting line")
    }
  }

  async function handleSaveScope() {
    if (!member) return
    try {
      await setLegalEntityScope.mutateAsync({ memberId: member.id, legalEntityIds: effectiveScope })
      toast.success("Legal entity scope updated")
      setScoping(false)
    } catch (e: unknown) {
      toast.error((e as Error).message ?? "Failed to update scope")
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

  if (!member) {
    return (
      <AnimatedPage>
        <div className="p-6"><p className="text-sm text-muted-foreground">Member not found.</p></div>
      </AnimatedPage>
    )
  }

  const teamsText = [
    ...member.teamAssignments.map((a) => `${a.teamName}: ${a.roleName}`),
    ...member.directRoleNames.map((r) => `${r} (no team)`),
  ].join(", ") || "—"

  const manager = member.reportsTo ? members.find((m) => m.id === member.reportsTo) : undefined
  // Anyone but this member themself -- the backend still rejects a cycle
  // (this member appearing somewhere above the picked manager), this list
  // just keeps the obvious self-reference out of the picker.
  const managerOptions = members.filter((m) => m.id !== member.id)

  return (
    <AnimatedPage>
      <div className="p-6 space-y-6">
        <div>
          <Link to="/admin/team" className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground mb-3">
            <SolarDuotoneIcon icon={ArrowLeft01Icon} size={13} strokeWidth={1.5} />
            Team
          </Link>
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-xl font-bold tracking-tight flex items-center gap-2">
                {member.profile?.full_name ?? "—"}
                {member.isPrimary && <Badge className="h-4 px-1 text-[9px]">You</Badge>}
              </h1>
              <p className="text-sm text-muted-foreground mt-0.5">{member.profile?.email}</p>
            </div>
            <Badge variant="outline" className={STATUS_COLORS[member.status]}>{member.status}</Badge>
          </div>
        </div>

        {/* Actions */}
        {isViewerAdmin && (
          <div className="flex flex-wrap gap-2">
            {member.status === "invited" && (
              <>
                <Button size="sm" variant="outline" onClick={handleResend} disabled={resendInvite.isPending}>Resend Invite</Button>
                <Button size="sm" variant="danger" onClick={handleRevoke} disabled={revokeInvite.isPending}>Revoke Invite</Button>
              </>
            )}
            {member.status === "active" && (
              <>
                {!isSolo && <Button size="sm" variant="outline" onClick={openEditRoles}>Edit Roles</Button>}
                <Button size="sm" variant="outline" onClick={openSettingManager}>Reports To</Button>
                {!member.isPrimary && (
                  <>
                    <Button size="sm" variant="outline" onClick={() => setRestricting(true)}>Restrictions</Button>
                    <Button size="sm" variant="outline" onClick={() => setDelegating(true)}>Temporary Access</Button>
                    {legalEntityOptions.length > 0 && (
                      <Button size="sm" variant="outline" onClick={openScoping}>Legal Entity Scope</Button>
                    )}
                    <Button size="sm" variant="danger" onClick={handleSuspend} disabled={suspendMember.isPending}>Suspend</Button>
                  </>
                )}
              </>
            )}
            {member.status === "suspended" && (
              <Button size="sm" variant="success" onClick={handleReinstate} disabled={reinstateMember.isPending}>Reinstate</Button>
            )}
          </div>
        )}

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">Roles &amp; Teams</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div>
              <p className="text-xs text-muted-foreground mb-0.5">Roles</p>
              <p className="font-medium">{member.roleNames.join(", ") || "—"}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-0.5">Reports To</p>
              <p className="font-medium">{manager?.profile?.full_name ?? "— (org chart root)"}</p>
            </div>
            {!isSolo && (
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">Team Assignments</p>
                <p className="font-medium">{teamsText}</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={editingRoles} onOpenChange={setEditingRoles}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit Roles — {member.profile?.full_name}</DialogTitle></DialogHeader>
          <DialogBody>
            <TeamRoleAssignmentEditor rows={editAssignmentRows} onChange={setEditAssignmentRows} teams={teams} roles={roles} />
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingRoles(false)}>Cancel</Button>
            <Button onClick={handleSaveRoles} disabled={updateRoles.isPending}>
              {updateRoles.isPending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <PermissionRestrictionsDialog
        open={restricting}
        onClose={() => setRestricting(false)}
        title={member.profile?.full_name ?? ""}
        effectivePermissions={restrictionsData?.effectivePermissions ?? []}
        restrictions={restrictionsData?.restrictions ?? []}
        onToggle={handleToggleRestriction}
        isPending={setRestriction.isPending}
      />

      <TemporaryAccessDialog
        open={delegating}
        onClose={() => setDelegating(false)}
        title={member.profile?.full_name ?? ""}
        roles={roles}
        delegations={delegationsData}
        onGrant={handleGrantDelegation}
        onRevoke={handleRevokeDelegation}
        isGranting={delegateRole.isPending}
        isRevoking={revokeDelegation.isPending}
      />

      <Dialog open={settingManager} onOpenChange={setSettingManager}>
        <DialogContent>
          <DialogHeader><DialogTitle>Reports To — {member.profile?.full_name}</DialogTitle></DialogHeader>
          <DialogBody className="space-y-1.5">
            <Label>Manager</Label>
            <Select
              value={managerSelection ?? "none"}
              onValueChange={(v) => setManagerSelection(v === "none" ? null : v)}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No manager (org chart root)</SelectItem>
                {managerOptions.map((m) => (
                  <SelectItem key={m.id} value={m.id}>{m.profile?.full_name ?? m.profile?.email}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSettingManager(false)}>Cancel</Button>
            <Button onClick={handleSaveManager} disabled={setManager.isPending}>
              {setManager.isPending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={scoping} onOpenChange={setScoping}>
        <DialogContent>
          <DialogHeader><DialogTitle>Legal Entity Scope — {member.profile?.full_name}</DialogTitle></DialogHeader>
          <DialogBody className="space-y-2">
            {scopeLoading ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : (
              <>
                <p className="text-xs text-muted-foreground">
                  No entities selected means this person is unrestricted — they see every vendor their role otherwise allows. Selecting any entity restricts them to only vendors with that legal entity.
                </p>
                {legalEntityOptions.map((opt) => (
                  <label key={opt.id} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={effectiveScope.includes(opt.id)}
                      onCheckedChange={(checked) =>
                        setScopeSelection(checked === true
                          ? [...effectiveScope, opt.id]
                          : effectiveScope.filter((id) => id !== opt.id))
                      }
                    />
                    {opt.label}
                  </label>
                ))}
              </>
            )}
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setScoping(false)}>Cancel</Button>
            <Button onClick={handleSaveScope} disabled={setLegalEntityScope.isPending}>
              {setLegalEntityScope.isPending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AnimatedPage>
  )
}
