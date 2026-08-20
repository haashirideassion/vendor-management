import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

export interface AssignableRole { id: string; name: string; description: string | null }
export interface AssignableTeam { id: string; name: string; description: string | null }
export interface AssignmentRow { teamId: string | null; roleId: string | null }

const NO_TEAM = "__none__"

// Repeatable (Team, Role) pair picker -- role assignment is per-team, not
// global to the person (someone can be Finance->Manager and
// Reconciliation->Associate at once), per the confirmed RBAC/Teams design.
// Team is always optional; Role is never optional. Shared between the org
// and vendor staff pages since the picker itself is identical, only the
// available teams/roles differ.
export function TeamRoleAssignmentEditor({
  rows, onChange, teams, roles,
}: {
  rows: AssignmentRow[]
  onChange: (rows: AssignmentRow[]) => void
  teams: AssignableTeam[]
  roles: AssignableRole[]
}) {
  function updateRow(index: number, patch: Partial<AssignmentRow>) {
    onChange(rows.map((r, i) => (i === index ? { ...r, ...patch } : r)))
  }
  function addRow() {
    onChange([...rows, { teamId: null, roleId: null }])
  }
  function removeRow(index: number) {
    onChange(rows.filter((_, i) => i !== index))
  }

  return (
    <div className="space-y-3">
      {rows.map((row, i) => (
        <div key={i} className="space-y-2 rounded-lg border p-3">
          <div className="flex items-center justify-between gap-2">
            <Label className="text-xs text-muted-foreground">Team (optional)</Label>
            {rows.length > 1 && (
              <button
                type="button"
                onClick={() => removeRow(i)}
                className="text-xs text-muted-foreground hover:text-destructive"
              >
                Remove
              </button>
            )}
          </div>
          <Select
            value={row.teamId ?? NO_TEAM}
            onValueChange={(v) => updateRow(i, { teamId: v === NO_TEAM ? null : v })}
          >
            <SelectTrigger className="w-full"><SelectValue placeholder="No team" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_TEAM}>No team</SelectItem>
              {teams.map((t) => (
                <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Label className="text-xs text-muted-foreground">Role</Label>
          <RadioGroup value={row.roleId ?? ""} onValueChange={(v) => updateRow(i, { roleId: v })} className="space-y-1.5">
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
      ))}
      <Button type="button" variant="outline" size="sm" onClick={addRow}>+ Add another team</Button>
    </div>
  )
}

export function assignmentRowsToPayload(rows: AssignmentRow[]): { teamId: string | null; roleId: string }[] {
  return rows.filter((r): r is { teamId: string | null; roleId: string } => !!r.roleId)
}
