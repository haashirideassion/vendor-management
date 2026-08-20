import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogBody } from "@/components/ui/dialog"

export interface AssignableRoleOption { id: string; name: string }
export interface DelegatedRole { role: { id: string; name: string }; valid_from: string | null; valid_until: string | null }

// Delegation / time-boxed access (RBAC/Teams redesign, Phase 7b) -- grants a
// role the person doesn't already hold, expiring automatically at the
// chosen date. Reuses the normal role-assignment mechanism (an expiring
// org_member_roles/vendor_user_roles row) rather than a separate
// "delegation" system -- once it expires, it simply stops granting
// permissions; the row remains as history.
export function TemporaryAccessDialog({
  open, onClose, title, roles, delegations, onGrant, onRevoke, isGranting, isRevoking,
}: {
  open: boolean
  onClose: () => void
  title: string
  roles: AssignableRoleOption[]
  delegations: DelegatedRole[]
  onGrant: (roleId: string, validUntil: string, reason?: string) => Promise<void>
  onRevoke: (roleId: string) => Promise<void>
  isGranting: boolean
  isRevoking: boolean
}) {
  const [roleId, setRoleId] = useState<string>("")
  const [validUntil, setValidUntil] = useState("")
  const [reason, setReason] = useState("")

  const now = new Date()
  const active = delegations.filter((d) => !d.valid_until || new Date(d.valid_until) > now)

  async function handleGrant() {
    if (!roleId || !validUntil) return
    await onGrant(roleId, new Date(validUntil).toISOString(), reason.trim() || undefined)
    setRoleId(""); setValidUntil(""); setReason("")
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Temporary Access — {title}</DialogTitle></DialogHeader>
        <DialogBody className="space-y-4">
          <div className="space-y-1">
            {active.length === 0 && <p className="text-sm text-muted-foreground">No temporary access currently granted.</p>}
            {active.map((d) => (
              <div key={d.role.id} className="flex items-center justify-between gap-2 rounded-md border px-3 py-2">
                <div>
                  <span className="text-sm font-medium">{d.role.name}</span>
                  {d.valid_until && <p className="text-xs text-muted-foreground">Expires {new Date(d.valid_until).toLocaleDateString()}</p>}
                </div>
                <Button size="sm" variant="outline" disabled={isRevoking} onClick={() => onRevoke(d.role.id)}>Revoke</Button>
              </div>
            ))}
          </div>

          <div className="border-t pt-4 space-y-3">
            <p className="text-sm font-medium">Grant temporary access</p>
            <p className="text-xs text-muted-foreground">
              Only offers roles this person doesn't already hold — editing an existing role is done via Edit Roles instead.
            </p>
            <div className="space-y-1.5">
              <Label className="text-xs">Role</Label>
              <Select value={roleId} onValueChange={setRoleId}>
                <SelectTrigger className="w-full"><SelectValue placeholder="Select a role" /></SelectTrigger>
                <SelectContent>
                  {roles.map((r) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Expires on</Label>
              <Input type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} min={new Date().toISOString().split("T")[0]} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Reason (optional)</Label>
              <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Covering for Finance Manager's leave" />
            </div>
            <Button onClick={handleGrant} disabled={isGranting || !roleId || !validUntil} className="w-full">
              {isGranting ? "Granting…" : "Grant Temporary Access"}
            </Button>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
