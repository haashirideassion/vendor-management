import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogBody } from "@/components/ui/dialog"

export interface AssignablePermission { id: string; key: string; module: string; action: string; description: string | null }
export interface CustomRoleSummary { id: string; name: string; description: string | null; is_system?: boolean }

// Custom tenant-created roles (RBAC/Teams redesign, Phase 7a) -- an Org or
// Vendor Admin composes a role from the same permission catalog system
// roles draw from. Scoped to exactly this tenant; cannot modify a system
// role. Once created, the role shows up automatically in the existing
// invite/Edit-Roles Team+Role picker -- no separate assignment UI needed.
export function CustomRoleManagerDialog({
  open, onClose, roles, permissions, onCreate, onDelete, isCreating, isDeleting,
}: {
  open: boolean
  onClose: () => void
  roles: CustomRoleSummary[]
  permissions: AssignablePermission[]
  onCreate: (input: { name: string; description?: string; permissionIds: string[] }) => Promise<void>
  onDelete: (roleId: string) => Promise<void>
  isCreating: boolean
  isDeleting: boolean
}) {
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [selectedPermissionIds, setSelectedPermissionIds] = useState<string[]>([])

  const customRoles = roles.filter((r) => !r.is_system)

  function togglePermission(id: string, checked: boolean) {
    setSelectedPermissionIds((prev) => (checked ? [...prev, id] : prev.filter((p) => p !== id)))
  }

  async function handleCreate() {
    if (!name.trim() || selectedPermissionIds.length === 0) return
    await onCreate({ name: name.trim(), description: description.trim() || undefined, permissionIds: selectedPermissionIds })
    setName("")
    setDescription("")
    setSelectedPermissionIds([])
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Manage Custom Roles</DialogTitle></DialogHeader>
        <DialogBody className="space-y-4">
          <div className="space-y-1">
            {customRoles.length === 0 && <p className="text-sm text-muted-foreground">No custom roles yet.</p>}
            {customRoles.map((r) => (
              <div key={r.id} className="flex items-center justify-between gap-2 rounded-md border px-3 py-2">
                <div>
                  <span className="text-sm font-medium">{r.name}</span>
                  {r.description && <p className="text-xs text-muted-foreground">{r.description}</p>}
                </div>
                <Button size="sm" variant="outline" disabled={isDeleting} onClick={() => onDelete(r.id)}>Delete</Button>
              </div>
            ))}
          </div>

          <div className="border-t pt-4 space-y-3">
            <p className="text-sm font-medium">Create a new custom role</p>
            <div className="space-y-1.5">
              <Label className="text-xs">Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Regional Finance Manager" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Description (optional)</Label>
              <Input value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Permissions</Label>
              <div className="max-h-48 overflow-y-auto rounded-md border p-2 space-y-1">
                {permissions.map((p) => (
                  <label key={p.id} className="flex items-start gap-2 text-sm py-0.5">
                    <Checkbox
                      checked={selectedPermissionIds.includes(p.id)}
                      onCheckedChange={(checked) => togglePermission(p.id, checked === true)}
                    />
                    <span>
                      <span className="font-medium">{p.key}</span>
                      {p.description && <span className="block text-xs text-muted-foreground">{p.description}</span>}
                    </span>
                  </label>
                ))}
              </div>
              {selectedPermissionIds.length > 0 && (
                <Badge variant="outline" className="text-xs">{selectedPermissionIds.length} selected</Badge>
              )}
            </div>
            <Button onClick={handleCreate} disabled={isCreating || !name.trim() || selectedPermissionIds.length === 0} className="w-full">
              {isCreating ? "Creating…" : "Create Role"}
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
