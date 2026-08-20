import { useState } from "react"
import { useParams, Link } from "react-router-dom"
import {
  useVendorUsers, useVendorClientOrgs, useAssignableVendorRoles, useVendorUserAssignments,
  useUpdateVendorUserRoles, useSetVendorUserAssignments, useMyVendorRole,
  useVendorTeams,
  useSuspendVendorUser, useReinstateVendorUser, useRevokeVendorUserInvite, useResendVendorUserInvite,
  useVendorUserRestrictions, useSetVendorUserRestriction,
  useVendorUserDelegations, useDelegateVendorRole, useRevokeVendorRoleDelegation,
} from "@/hooks/useVendorUsers"
import { AnimatedPage } from "@/components/shared/AnimatedPage"
import { TeamRoleAssignmentEditor, assignmentRowsToPayload, type AssignmentRow } from "@/components/shared/TeamRoleAssignmentEditor"
import { PermissionRestrictionsDialog } from "@/components/shared/PermissionRestrictionsDialog"
import { TemporaryAccessDialog } from "@/components/shared/TemporaryAccessDialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogBody } from "@/components/ui/dialog"
import { ArrowLeft01Icon } from "@/components/shared/SolarIcon"
import { SolarDuotoneIcon } from "@/components/shared/SolarIcon"
import { toast } from "sonner"

const STATUS_COLORS: Record<string, string> = {
  active: "bg-green-100 text-green-800 border-green-200",
  invited: "bg-blue-100 text-blue-800 border-blue-200",
  suspended: "bg-orange-100 text-orange-800 border-orange-200",
}

// One staff member's full detail + every action that used to be a same-row
// button on VendorTeam.tsx's table (Edit roles/Client access/Restrictions/
// Temporary Access/Suspend/Resend/Revoke) -- moved here so that table only
// ever needs a single "Manage" link per row.
export function VendorUserDetail() {
  const { userId } = useParams<{ userId: string }>()
  const { data: users = [], isLoading } = useVendorUsers()
  const user = users.find((u) => u.id === userId)

  const { data: clientOrgs = [] } = useVendorClientOrgs()
  const { data: assignableData } = useAssignableVendorRoles()
  const { data: teams = [] } = useVendorTeams()
  const { data: myRoleNames = [] } = useMyVendorRole()
  const isViewerAdmin = myRoleNames.includes("Admin")
  const roles = assignableData?.roles ?? []

  const updateRoles = useUpdateVendorUserRoles()
  const suspendUser = useSuspendVendorUser()
  const reinstateUser = useReinstateVendorUser()
  const revokeInvite = useRevokeVendorUserInvite()
  const resendInvite = useResendVendorUserInvite()

  const [editingRoles, setEditingRoles] = useState(false)
  const [editAssignmentRows, setEditAssignmentRows] = useState<AssignmentRow[]>([{ teamId: null, roleId: null }])
  const [assigningClients, setAssigningClients] = useState(false)
  const [restricting, setRestricting] = useState(false)
  const [delegating, setDelegating] = useState(false)

  const { data: restrictionsData } = useVendorUserRestrictions(restricting ? user?.id : undefined)
  const setRestriction = useSetVendorUserRestriction()
  const { data: delegationsData = [] } = useVendorUserDelegations(delegating ? user?.id : undefined)
  const delegateRole = useDelegateVendorRole()
  const revokeDelegation = useRevokeVendorRoleDelegation()
  const { data: currentAssignments = [], isLoading: assignmentsLoading } = useVendorUserAssignments(assigningClients ? user?.id : undefined)
  const setAssignments = useSetVendorUserAssignments()
  const [clientSelection, setClientSelection] = useState<string[] | null>(null)
  const effectiveClientSelection = clientSelection ?? currentAssignments

  function openEditRoles() {
    if (!user) return
    const rows: AssignmentRow[] = [
      ...user.teamAssignments.map((a) => ({ teamId: a.teamId, roleId: a.roleId })),
      ...user.directRoleNames.map((name) => ({ teamId: null, roleId: roles.find((r) => r.name === name)?.id ?? null })),
    ]
    setEditAssignmentRows(rows.length > 0 ? rows : [{ teamId: null, roleId: null }])
    setEditingRoles(true)
  }

  async function handleSaveRoles() {
    if (!user) return
    const assignments = assignmentRowsToPayload(editAssignmentRows)
    if (assignments.length === 0) return toast.error("Select at least one role")
    try {
      await updateRoles.mutateAsync({
        vendorUserId: user.id,
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
    if (!user) return
    try {
      await suspendUser.mutateAsync({ vendorUserId: user.id })
      toast.success("Staff member suspended")
    } catch (e: unknown) {
      toast.error((e as Error).message ?? "Failed to suspend")
    }
  }

  async function handleReinstate() {
    if (!user) return
    try {
      await reinstateUser.mutateAsync({ vendorUserId: user.id })
      toast.success("Staff member reinstated")
    } catch (e: unknown) {
      toast.error((e as Error).message ?? "Failed to reinstate")
    }
  }

  async function handleRevoke() {
    if (!user) return
    try {
      await revokeInvite.mutateAsync({ vendorUserId: user.id })
      toast.success("Invitation revoked")
    } catch (e: unknown) {
      toast.error((e as Error).message ?? "Failed to revoke invitation")
    }
  }

  async function handleResend() {
    if (!user) return
    try {
      await resendInvite.mutateAsync({ vendorUserId: user.id })
      toast.success("Invitation resent")
    } catch (e: unknown) {
      toast.error((e as Error).message ?? "Failed to resend invitation")
    }
  }

  async function handleToggleRestriction(permissionId: string, restricted: boolean, reason?: string) {
    if (!user) return
    try {
      await setRestriction.mutateAsync({ vendorUserId: user.id, permissionId, restricted, reason })
      toast.success(restricted ? "Permission restricted" : "Restriction removed")
    } catch (e: unknown) {
      toast.error((e as Error).message ?? "Failed to update restriction")
    }
  }

  async function handleGrantDelegation(roleId: string, validUntil: string, reason?: string) {
    if (!user) return
    try {
      await delegateRole.mutateAsync({ vendorUserId: user.id, roleId, validUntil, reason })
      toast.success("Temporary access granted")
    } catch (e: unknown) {
      toast.error((e as Error).message ?? "Failed to grant temporary access")
    }
  }

  async function handleRevokeDelegation(roleId: string) {
    if (!user) return
    try {
      await revokeDelegation.mutateAsync({ vendorUserId: user.id, roleId })
      toast.success("Temporary access revoked")
    } catch (e: unknown) {
      toast.error((e as Error).message ?? "Failed to revoke temporary access")
    }
  }

  function openClientAssignment() {
    setClientSelection(null)
    setAssigningClients(true)
  }

  async function handleSaveClientAssignment() {
    if (!user) return
    try {
      await setAssignments.mutateAsync({ userId: user.id, organizationIds: effectiveClientSelection })
      toast.success("Client assignments updated")
      setAssigningClients(false)
    } catch (e: unknown) {
      toast.error((e as Error).message ?? "Failed to update assignments")
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

  if (!user) {
    return (
      <AnimatedPage>
        <div className="p-6"><p className="text-sm text-muted-foreground">Staff member not found.</p></div>
      </AnimatedPage>
    )
  }

  const isAssociate = user.roleNames.includes("Associate") && !user.roleNames.some((r) => r === "Admin" || r === "Manager")
  const teamsText = [
    ...user.teamAssignments.map((a) => `${a.teamName}: ${a.roleName}`),
    ...user.directRoleNames.map((r) => `${r} (no team)`),
  ].join(", ") || "—"

  return (
    <AnimatedPage>
      <div className="p-6 space-y-6">
        <div>
          <Link to="/vendor/team" className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground mb-3">
            <SolarDuotoneIcon icon={ArrowLeft01Icon} size={13} strokeWidth={1.5} />
            Team
          </Link>
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-xl font-bold tracking-tight flex items-center gap-2">
                {user.profile?.full_name ?? "—"}
                {user.isPrimary && <Badge className="h-4 px-1 text-[9px]">You</Badge>}
              </h1>
              <p className="text-sm text-muted-foreground mt-0.5">{user.profile?.email}</p>
            </div>
            <Badge variant="outline" className={STATUS_COLORS[user.status]}>{user.status}</Badge>
          </div>
        </div>

        {/* Actions */}
        {isViewerAdmin && (
          <div className="flex flex-wrap gap-2">
            {user.status === "invited" && (
              <>
                <Button size="sm" variant="outline" onClick={handleResend} disabled={resendInvite.isPending}>Resend Invite</Button>
                <Button size="sm" variant="danger" onClick={handleRevoke} disabled={revokeInvite.isPending}>Revoke Invite</Button>
              </>
            )}
            {user.status === "active" && (
              <>
                <Button size="sm" variant="outline" onClick={openEditRoles}>Edit Roles</Button>
                {!user.isPrimary && (
                  <>
                    {isAssociate && (
                      <Button size="sm" variant="outline" onClick={openClientAssignment}>Client Access</Button>
                    )}
                    <Button size="sm" variant="outline" onClick={() => setRestricting(true)}>Restrictions</Button>
                    <Button size="sm" variant="outline" onClick={() => setDelegating(true)}>Temporary Access</Button>
                    <Button size="sm" variant="danger" onClick={handleSuspend} disabled={suspendUser.isPending}>Suspend</Button>
                  </>
                )}
              </>
            )}
            {user.status === "suspended" && (
              <Button size="sm" variant="success" onClick={handleReinstate} disabled={reinstateUser.isPending}>Reinstate</Button>
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
              <p className="font-medium">{user.roleNames.join(", ") || "—"}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-0.5">Team Assignments</p>
              <p className="font-medium">{teamsText}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Dialog open={editingRoles} onOpenChange={setEditingRoles}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit Roles — {user.profile?.full_name}</DialogTitle></DialogHeader>
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

      <Dialog open={assigningClients} onOpenChange={setAssigningClients}>
        <DialogContent>
          <DialogHeader><DialogTitle>Client Access — {user.profile?.full_name}</DialogTitle></DialogHeader>
          <DialogBody className="space-y-2">
            {assignmentsLoading ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : (
              <>
                <p className="text-xs text-muted-foreground">
                  No orgs selected means this Associate sees nothing until explicitly assigned.
                </p>
                {clientOrgs.map((org) => (
                  <label key={org.id} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={effectiveClientSelection.includes(org.id)}
                      onCheckedChange={(checked) =>
                        setClientSelection(checked === true
                          ? [...effectiveClientSelection, org.id]
                          : effectiveClientSelection.filter((id) => id !== org.id))
                      }
                    />
                    {org.name}
                  </label>
                ))}
              </>
            )}
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssigningClients(false)}>Cancel</Button>
            <Button onClick={handleSaveClientAssignment} disabled={setAssignments.isPending}>
              {setAssignments.isPending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <PermissionRestrictionsDialog
        open={restricting}
        onClose={() => setRestricting(false)}
        title={user.profile?.full_name ?? ""}
        effectivePermissions={restrictionsData?.effectivePermissions ?? []}
        restrictions={restrictionsData?.restrictions ?? []}
        onToggle={handleToggleRestriction}
        isPending={setRestriction.isPending}
      />

      <TemporaryAccessDialog
        open={delegating}
        onClose={() => setDelegating(false)}
        title={user.profile?.full_name ?? ""}
        roles={roles}
        delegations={delegationsData}
        onGrant={handleGrantDelegation}
        onRevoke={handleRevokeDelegation}
        isGranting={delegateRole.isPending}
        isRevoking={revokeDelegation.isPending}
      />
    </AnimatedPage>
  )
}
