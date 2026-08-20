import { useState } from "react"
import { Link } from "react-router-dom"
import {
  useVendorUsers, useAssignableVendorRoles,
  useInviteVendorUser, useVendorTeams, useCreateVendorTeam, useMyVendorRole,
  useVendorAssignablePermissions, useCreateCustomVendorRole, useDeleteCustomVendorRole,
  type VendorUser,
} from "@/hooks/useVendorUsers"
import { AnimatedPage } from "@/components/shared/AnimatedPage"
import { TeamRoleAssignmentEditor, assignmentRowsToPayload, type AssignmentRow } from "@/components/shared/TeamRoleAssignmentEditor"
import { CustomRoleManagerDialog } from "@/components/shared/CustomRoleManagerDialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogBody } from "@/components/ui/dialog"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { EyeIcon } from "@/components/shared/SolarIcon"
import { SolarDuotoneIcon } from "@/components/shared/SolarIcon"
import { toast } from "sonner"

const STATUS_COLORS: Record<string, string> = {
  active: "bg-green-100 text-green-800 border-green-200",
  invited: "bg-blue-100 text-blue-800 border-blue-200",
  suspended: "bg-orange-100 text-orange-800 border-orange-200",
}

function renderTeams(user: VendorUser) {
  const parts = [
    ...user.teamAssignments.map((a) => `${a.teamName}: ${a.roleName}`),
    ...user.directRoleNames.map((r) => `${r} (no team)`),
  ]
  return parts.length > 0 ? parts.join(", ") : "—"
}

// A single "Manage" link per row instead of a wall of per-row action
// buttons (Edit roles/Client access/Restrictions/Temporary Access/Suspend/
// Resend/Revoke) -- those all live on VendorUserDetail.tsx now. This page
// keeps only the vendor-wide settings (Teams/Roles/Invite) and the staff
// list itself.
export function VendorTeam() {
  const { data: users = [], isLoading } = useVendorUsers()
  const { data: assignableData } = useAssignableVendorRoles()
  const { data: teams = [] } = useVendorTeams()
  const { data: myRoleNames = [] } = useMyVendorRole()
  const isViewerAdmin = myRoleNames.includes("Admin")
  const inviteUser = useInviteVendorUser()
  const createTeam = useCreateVendorTeam()
  const { data: assignablePermissions = [] } = useVendorAssignablePermissions()
  const createCustomRole = useCreateCustomVendorRole()
  const deleteCustomRole = useDeleteCustomVendorRole()

  const [inviting, setInviting] = useState(false)
  const [email, setEmail] = useState("")
  const [fullName, setFullName] = useState("")
  const [assignmentRows, setAssignmentRows] = useState<AssignmentRow[]>([{ teamId: null, roleId: null }])
  const [managingTeams, setManagingTeams] = useState(false)
  const [newTeamName, setNewTeamName] = useState("")
  const [managingRoles, setManagingRoles] = useState(false)

  const roles = assignableData?.roles ?? []

  function resetInviteForm() {
    setEmail(""); setFullName(""); setAssignmentRows([{ teamId: null, roleId: null }])
  }

  async function handleInvite() {
    if (!email.trim() || !fullName.trim()) return toast.error("Email and name are required")
    const assignments = assignmentRowsToPayload(assignmentRows)
    if (assignments.length === 0) return toast.error("Select at least one role")
    try {
      const result = await inviteUser.mutateAsync({
        email: email.trim(), fullName: fullName.trim(),
        roleIds: [...new Set(assignments.map((a) => a.roleId))],
        assignments,
      })
      toast.success(result.inviteSent ? `Invite sent to ${result.email}` : `${result.email} added to your team`)
      setInviting(false)
      resetInviteForm()
    } catch (e: unknown) {
      toast.error((e as Error).message ?? "Failed to invite staff member")
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

  return (
    <AnimatedPage className="space-y-6">
      {isViewerAdmin && (
        <div className="flex items-center justify-end gap-2">
          <Button variant="outline" onClick={() => setManagingTeams(true)}>Manage Teams</Button>
          <Button variant="outline" onClick={() => setManagingRoles(true)}>Manage Roles</Button>
          <Button onClick={() => setInviting(true)}>Invite Staff</Button>
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
              <TableHead>Teams</TableHead>
              <TableHead className="w-20" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">Loading…</TableCell></TableRow>
            )}
            {!isLoading && users.length === 0 && (
              <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">No staff yet.</TableCell></TableRow>
            )}
            {users.map((u) => (
              <TableRow key={u.id}>
                <TableCell className="font-medium">{u.profile?.full_name ?? "—"}{u.isPrimary && <Badge className="ml-2 h-4 px-1 text-[9px]">You</Badge>}</TableCell>
                <TableCell className="text-muted-foreground">{u.profile?.email}</TableCell>
                <TableCell><Badge variant="outline" className={STATUS_COLORS[u.status]}>{u.status}</Badge></TableCell>
                <TableCell>{u.roleNames.join(", ") || "—"}</TableCell>
                <TableCell className="text-muted-foreground text-sm">{renderTeams(u)}</TableCell>
                <TableCell>
                  <Button asChild size="sm" variant="ghost" className="h-8 px-2 gap-1.5 text-xs">
                    <Link to={`/vendor/team/${u.id}`}>
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
          <DialogHeader><DialogTitle>Invite Staff</DialogTitle></DialogHeader>
          <DialogBody className="space-y-4">
            <div className="space-y-1.5">
              <Label>Full name</Label>
              <Input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Jane Doe" />
            </div>
            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="jane@vendor.com" />
            </div>
            <TeamRoleAssignmentEditor rows={assignmentRows} onChange={setAssignmentRows} teams={teams} roles={roles} />
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setInviting(false); resetInviteForm() }}>Cancel</Button>
            <Button onClick={handleInvite} disabled={inviteUser.isPending}>
              {inviteUser.isPending ? "Inviting…" : "Invite"}
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
    </AnimatedPage>
  )
}
