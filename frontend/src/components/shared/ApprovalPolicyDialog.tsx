import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogBody } from "@/components/ui/dialog"

export interface ApprovalPolicyRow { roleId: string; roleName: string; thresholdAmount: number | null; configured: boolean }

// Procurement Lifecycle Enhancement, Phase 1: amount-tiered approval
// thresholds. A LIVE settings screen, deliberately not part of org
// onboarding -- financial policy changes over time and shouldn't be locked
// to a one-time onboarding field. Leaving a role's field blank means
// "unconfigured" (today's unchanged unconditional self-approval for that
// role); entering an amount means "self-approve up to this much, escalate
// above it."
export function ApprovalPolicyDialog({
  open, onClose, policy, onSave, isSaving,
}: {
  open: boolean
  onClose: () => void
  policy: ApprovalPolicyRow[]
  onSave: (roleId: string, thresholdAmount: number | null, clear: boolean) => Promise<void>
  isSaving: boolean
}) {
  const [drafts, setDrafts] = useState<Record<string, string>>({})

  function valueFor(row: ApprovalPolicyRow): string {
    if (drafts[row.roleId] !== undefined) return drafts[row.roleId]
    return row.configured && row.thresholdAmount !== null ? String(row.thresholdAmount) : ""
  }

  async function handleSave(row: ApprovalPolicyRow) {
    const raw = valueFor(row).trim()
    if (raw === "") {
      await onSave(row.roleId, null, true) // revert to unconfigured
    } else {
      const parsed = Number(raw)
      if (Number.isNaN(parsed) || parsed < 0) return
      await onSave(row.roleId, parsed, false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Approval Policy</DialogTitle></DialogHeader>
        <DialogBody className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Leave a role's limit blank to keep today's behavior (that role can approve any amount on its own). Set a limit to require escalation above it.
          </p>
          {policy.map((row) => (
            <div key={row.roleId} className="flex items-center gap-2">
              <Label className="text-sm w-32 shrink-0">{row.roleName}</Label>
              <Input
                type="number"
                min={0}
                placeholder="No limit"
                value={valueFor(row)}
                onChange={(e) => setDrafts((prev) => ({ ...prev, [row.roleId]: e.target.value }))}
                onBlur={() => handleSave(row)}
                disabled={isSaving}
              />
            </div>
          ))}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
