import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogBody } from "@/components/ui/dialog"

export interface EffectivePermission { id: string; key: string; module: string; action: string; description: string | null }
export interface PermissionRestriction { id: string; permission_id: string; reason: string | null }

// Subtractive-only override (RBAC/Teams redesign, Phase 4) -- this dialog
// only ever lets an Admin narrow one of the person's OWN currently-
// effective permissions (derived from their Team+Role/direct roles). There
// is deliberately no way to grant a permission here; turning a switch back
// on just removes the restriction, reverting to whatever the person's
// roles already grant.
export function PermissionRestrictionsDialog({
  open, onClose, title, effectivePermissions, restrictions, onToggle, isPending,
}: {
  open: boolean
  onClose: () => void
  title: string
  effectivePermissions: EffectivePermission[]
  restrictions: PermissionRestriction[]
  onToggle: (permissionId: string, restricted: boolean, reason?: string) => void
  isPending: boolean
}) {
  const [restrictingPermission, setRestrictingPermission] = useState<EffectivePermission | null>(null)
  const [reason, setReason] = useState("")

  const restrictedByPermissionId = new Map(restrictions.map((r) => [r.permission_id, r]))

  function openRestrict(p: EffectivePermission) {
    setRestrictingPermission(p)
    setReason("")
  }

  function confirmRestrict() {
    if (!restrictingPermission) return
    onToggle(restrictingPermission.id, true, reason.trim() || undefined)
    setRestrictingPermission(null)
  }

  return (
    <>
      <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Permission Restrictions — {title}</DialogTitle></DialogHeader>
          <DialogBody className="space-y-1">
            <p className="text-xs text-muted-foreground mb-2">
              Turning a permission off restricts only this person, below whatever their roles already grant. It never adds access beyond their existing roles.
            </p>
            {effectivePermissions.length === 0 && (
              <p className="text-sm text-muted-foreground">This person has no permissions from their current roles yet.</p>
            )}
            {effectivePermissions.map((p) => {
              const restriction = restrictedByPermissionId.get(p.id)
              const enabled = !restriction
              return (
                <div key={p.id} className="flex items-center justify-between gap-3 py-1.5 border-b last:border-b-0">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{p.key}</p>
                    {p.description && <p className="text-xs text-muted-foreground truncate">{p.description}</p>}
                    {restriction?.reason && <p className="text-xs text-destructive">Restricted: {restriction.reason}</p>}
                  </div>
                  <Switch
                    checked={enabled}
                    disabled={isPending}
                    onCheckedChange={(checked) => (checked ? onToggle(p.id, false) : openRestrict(p))}
                  />
                </div>
              )
            })}
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={onClose}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!restrictingPermission} onOpenChange={(o) => !o && setRestrictingPermission(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Restrict "{restrictingPermission?.key}"</DialogTitle></DialogHeader>
          <DialogBody className="space-y-3">
            <p className="text-sm text-muted-foreground">
              This person will lose this specific permission, even though their role still grants it to everyone else holding it.
            </p>
            <div className="space-y-1.5">
              <Label>Reason (optional, recorded in the audit log)</Label>
              <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Temporarily reassigned to another team" />
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRestrictingPermission(null)}>Cancel</Button>
            <Button variant="destructive" onClick={confirmRestrict} disabled={isPending}>
              {isPending ? "Restricting…" : "Restrict"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
