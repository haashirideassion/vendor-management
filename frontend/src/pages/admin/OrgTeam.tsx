import { useState } from "react"
import { useOrgMembers, useAssignableOrgRoles, useInviteOrgMember, useUpdateOrgMemberRoles, type OrgMember } from "@/hooks/useOrgMembers"
import { useOrg } from "@/contexts/OrgContext"
import { AnimatedPage } from "@/components/shared/AnimatedPage"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
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

// Invite/edit-roles are Admin-only actions (organization_members has no
// dedicated permission key, unlike vendor scope's vendor_users.manage -- the
// backend now checks the actor's own Admin-tier role directly on both
// routes). Gated here on the viewer's own resolved role via activeOrg so
// Manager/Associate/Finance don't see actions the backend would reject
// anyway, mirroring the vendor-side VendorTeam.tsx pattern.
export function OrgTeam() {
  const { data: members = [], isLoading } = useOrgMembers()
  const { data: assignable } = useAssignableOrgRoles()
  const { activeOrg } = useOrg()
  const isViewerAdmin = !!activeOrg?.roleNames.includes("Admin")
  const inviteMember = useInviteOrgMember()
  const updateRoles = useUpdateOrgMemberRoles()

  const [inviting, setInviting] = useState(false)
  const [email, setEmail] = useState("")
  const [fullName, setFullName] = useState("")
  // Exactly one role per org member -- the tiers are cumulative bundles
  // (Manager's permission set already contains Associate's, Admin's already
  // contains Manager's; 018_rbac_seed.sql), so a member only ever needs the
  // one role matching their tier, not a combination. Single-choice (radio),
  // mirroring the vendor-side fix already shipped this session.
  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null)
  const [editingMember, setEditingMember] = useState<OrgMember | null>(null)
  const [editRoleId, setEditRoleId] = useState<string | null>(null)

  const isSolo = assignable?.roleMode === "solo"

  function resetInviteForm() {
    setEmail("")
    setFullName("")
    setSelectedRoleId(null)
  }

  async function handleInvite() {
    if (!email.trim() || !fullName.trim()) return toast.error("Email and name are required")
    if (!isSolo && !selectedRoleId) return toast.error("Select a role")
    try {
      const result = await inviteMember.mutateAsync({
        email: email.trim(), fullName: fullName.trim(),
        roleIds: isSolo ? [] : [selectedRoleId!],
      })
      toast.success(result.inviteSent ? `Invite sent to ${result.email}` : `${result.email} added to this organization`)
      setInviting(false)
      resetInviteForm()
    } catch (e: unknown) {
      toast.error((e as Error).message ?? "Failed to invite member")
    }
  }

  function openEditRoles(member: OrgMember) {
    setEditingMember(member)
    setEditRoleId((assignable?.roles ?? []).find((r) => member.roleNames.includes(r.name))?.id ?? null)
  }

  async function handleSaveRoles() {
    if (!editingMember || !editRoleId) return toast.error("Select a role")
    try {
      await updateRoles.mutateAsync({ memberId: editingMember.id, roleIds: [editRoleId] })
      toast.success("Roles updated")
      setEditingMember(null)
    } catch (e: unknown) {
      toast.error((e as Error).message ?? "Failed to update roles")
    }
  }

  return (
    <AnimatedPage className="space-y-6">
      {isViewerAdmin && (
        <div className="flex items-center justify-end">
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
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">Loading…</TableCell></TableRow>
            )}
            {!isLoading && members.length === 0 && (
              <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">No members yet.</TableCell></TableRow>
            )}
            {members.map((m) => (
              <TableRow key={m.id}>
                <TableCell className="font-medium">{m.profile?.full_name ?? "—"}{m.isPrimary && <Badge className="ml-2 h-4 px-1 text-[9px]">You</Badge>}</TableCell>
                <TableCell className="text-muted-foreground">{m.profile?.email}</TableCell>
                <TableCell><Badge variant="outline" className={STATUS_COLORS[m.status]}>{m.status}</Badge></TableCell>
                <TableCell>{m.roleNames.join(", ") || "—"}</TableCell>
                <TableCell>
                  {!isSolo && isViewerAdmin && (
                    <Button size="sm" variant="outline" onClick={() => openEditRoles(m)}>Edit roles</Button>
                  )}
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
              <div className="space-y-1.5">
                <Label>Role</Label>
                <RadioGroup value={selectedRoleId ?? ""} onValueChange={setSelectedRoleId} className="space-y-2">
                  {(assignable?.roles ?? []).map((role) => (
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

      <Dialog open={!!editingMember} onOpenChange={(o) => !o && setEditingMember(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit Roles — {editingMember?.profile?.full_name}</DialogTitle></DialogHeader>
          <DialogBody>
            <RadioGroup value={editRoleId ?? ""} onValueChange={setEditRoleId} className="space-y-2">
              {(assignable?.roles ?? []).map((role) => (
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
            <Button variant="outline" onClick={() => setEditingMember(null)}>Cancel</Button>
            <Button onClick={handleSaveRoles} disabled={updateRoles.isPending}>
              {updateRoles.isPending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AnimatedPage>
  )
}
