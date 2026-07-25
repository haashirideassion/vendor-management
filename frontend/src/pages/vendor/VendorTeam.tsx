import { useState } from "react"
import {
  useVendorUsers, useVendorClientOrgs, useAssignableVendorRoles, useVendorUserAssignments,
  useInviteVendorUser, useUpdateVendorUserRoles, useSetVendorUserAssignments, useMyVendorRole, type VendorUser,
} from "@/hooks/useVendorUsers"
import { AnimatedPage } from "@/components/shared/AnimatedPage"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogBody } from "@/components/ui/dialog"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { toast } from "sonner"

const STATUS_COLORS: Record<string, string> = {
  active: "bg-green-100 text-green-800 border-green-200",
  invited: "bg-blue-100 text-blue-800 border-blue-200",
  suspended: "bg-orange-100 text-orange-800 border-orange-200",
}

// Staff + client-assignment management. Admin-only action (vendor_users.manage
// is Admin-only in the RBAC seed) -- gated here on the viewer's own resolved
// role via useMyVendorRole() so Manager/Associate/Finance don't see actions
// the backend would reject anyway, in addition to the existing server-side
// vendor_users.manage check on the actual mutations.
export function VendorTeam() {
  const { data: users = [], isLoading } = useVendorUsers()
  const { data: clientOrgs = [] } = useVendorClientOrgs()
  const { data: assignableData } = useAssignableVendorRoles()
  const { data: myRoleNames = [] } = useMyVendorRole()
  const isViewerAdmin = myRoleNames.includes("Admin")
  const inviteUser = useInviteVendorUser()
  const updateRoles = useUpdateVendorUserRoles()

  const [inviting, setInviting] = useState(false)
  const [email, setEmail] = useState("")
  const [fullName, setFullName] = useState("")
  // Exactly one role per vendor staff member -- the three vendor-scope
  // bundles (Admin/Manager/Associate) are distinct functional buckets, not
  // meant to be combined on one person (018_rbac_seed.sql), so selection is
  // single-choice (radio), not multi-select.
  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null)
  const [editingUser, setEditingUser] = useState<VendorUser | null>(null)
  const [editRoleId, setEditRoleId] = useState<string | null>(null)
  const [assigningUser, setAssigningUser] = useState<VendorUser | null>(null)

  const roles = assignableData?.roles ?? []

  function resetInviteForm() {
    setEmail(""); setFullName(""); setSelectedRoleId(null)
  }

  async function handleInvite() {
    if (!email.trim() || !fullName.trim()) return toast.error("Email and name are required")
    if (!selectedRoleId) return toast.error("Select a role")
    try {
      const result = await inviteUser.mutateAsync({ email: email.trim(), fullName: fullName.trim(), roleIds: [selectedRoleId] })
      toast.success(result.inviteSent ? `Invite sent to ${result.email}` : `${result.email} added to your team`)
      setInviting(false)
      resetInviteForm()
    } catch (e: unknown) {
      toast.error((e as Error).message ?? "Failed to invite staff member")
    }
  }

  function openEditRoles(user: VendorUser) {
    setEditingUser(user)
    setEditRoleId(roles.find((r) => user.roleNames.includes(r.name))?.id ?? null)
  }

  async function handleSaveRoles() {
    if (!editingUser || !editRoleId) return toast.error("Select a role")
    try {
      await updateRoles.mutateAsync({ vendorUserId: editingUser.id, roleIds: [editRoleId] })
      toast.success("Roles updated")
      setEditingUser(null)
    } catch (e: unknown) {
      toast.error((e as Error).message ?? "Failed to update roles")
    }
  }

  const isAssociate = (u: VendorUser) => u.roleNames.includes("Associate") && !u.roleNames.some((r) => r === "Admin" || r === "Manager")

  return (
    <AnimatedPage className="space-y-6">
      {isViewerAdmin && (
        <div className="flex items-center justify-end">
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
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">Loading…</TableCell></TableRow>
            )}
            {!isLoading && users.length === 0 && (
              <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">No staff yet.</TableCell></TableRow>
            )}
            {users.map((u) => (
              <TableRow key={u.id}>
                <TableCell className="font-medium">{u.profile?.full_name ?? "—"}{u.isPrimary && <Badge className="ml-2 h-4 px-1 text-[9px]">You</Badge>}</TableCell>
                <TableCell className="text-muted-foreground">{u.profile?.email}</TableCell>
                <TableCell><Badge variant="outline" className={STATUS_COLORS[u.status]}>{u.status}</Badge></TableCell>
                <TableCell>{u.roleNames.join(", ") || "—"}</TableCell>
                <TableCell className="flex gap-2 justify-end">
                  {isViewerAdmin && (
                    <>
                      <Button size="sm" variant="outline" onClick={() => openEditRoles(u)}>Edit roles</Button>
                      {isAssociate(u) && (
                        <Button size="sm" variant="outline" onClick={() => setAssigningUser(u)}>Client access</Button>
                      )}
                    </>
                  )}
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
            <div className="space-y-1.5">
              <Label>Role</Label>
              <RadioGroup value={selectedRoleId ?? ""} onValueChange={setSelectedRoleId} className="space-y-2">
                {roles.map((role) => (
                  <label key={role.id} className="flex items-start gap-2 text-sm">
                    <RadioGroupItem value={role.id} className="mt-0.5" />
                    <span>
                      <span className="font-medium">{role.name}</span>
                      {role.description && <span className="block text-xs text-muted-foreground">{role.description}</span>}
                    </span>
                  </label>
                ))}
              </RadioGroup>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setInviting(false); resetInviteForm() }}>Cancel</Button>
            <Button onClick={handleInvite} disabled={inviteUser.isPending}>
              {inviteUser.isPending ? "Inviting…" : "Invite"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editingUser} onOpenChange={(o) => !o && setEditingUser(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit Roles — {editingUser?.profile?.full_name}</DialogTitle></DialogHeader>
          <DialogBody>
            <RadioGroup value={editRoleId ?? ""} onValueChange={setEditRoleId} className="space-y-2">
              {roles.map((role) => (
                <label key={role.id} className="flex items-start gap-2 text-sm">
                  <RadioGroupItem value={role.id} className="mt-0.5" />
                  <span>
                    <span className="font-medium">{role.name}</span>
                    {role.description && <span className="block text-xs text-muted-foreground">{role.description}</span>}
                  </span>
                </label>
              ))}
            </RadioGroup>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingUser(null)}>Cancel</Button>
            <Button onClick={handleSaveRoles} disabled={updateRoles.isPending}>
              {updateRoles.isPending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {assigningUser && (
        <ClientAssignmentDialog user={assigningUser} clientOrgs={clientOrgs} onClose={() => setAssigningUser(null)} />
      )}
    </AnimatedPage>
  )
}

function ClientAssignmentDialog({
  user, clientOrgs, onClose,
}: {
  user: VendorUser
  clientOrgs: { id: string; name: string; slug: string; status: string }[]
  onClose: () => void
}) {
  const { data: currentAssignments = [], isLoading } = useVendorUserAssignments(user.id)
  const setAssignments = useSetVendorUserAssignments()
  const [selected, setSelected] = useState<string[] | null>(null)

  const effectiveSelected = selected ?? currentAssignments

  async function handleSave() {
    try {
      await setAssignments.mutateAsync({ userId: user.id, organizationIds: effectiveSelected })
      toast.success("Client assignments updated")
      onClose()
    } catch (e: unknown) {
      toast.error((e as Error).message ?? "Failed to update assignments")
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Client Access — {user.profile?.full_name}</DialogTitle></DialogHeader>
        <DialogBody className="space-y-2">
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : (
            <>
              <p className="text-xs text-muted-foreground">
                No orgs selected means this Associate sees nothing until explicitly assigned.
              </p>
              {clientOrgs.map((org) => (
                <label key={org.id} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={effectiveSelected.includes(org.id)}
                    onCheckedChange={(checked) =>
                      setSelected((checked === true
                        ? [...effectiveSelected, org.id]
                        : effectiveSelected.filter((id) => id !== org.id)))
                    }
                  />
                  {org.name}
                </label>
              ))}
            </>
          )}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={setAssignments.isPending}>
            {setAssignments.isPending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
