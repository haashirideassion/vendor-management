import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogBody } from "@/components/ui/dialog"

// Contract Lifecycle Management, Stage 7 -- value tiers driving the Final
// Approval matrix. Absence of a configured setting falls back to the
// defaults (500k / 2M) contractApprovals.ts's resolveTier already applies.
export function ContractApprovalThresholdsDialog({
  open, onClose, mediumThreshold, highThreshold, onSave, isSaving,
}: {
  open: boolean
  onClose: () => void
  mediumThreshold: number
  highThreshold: number
  onSave: (mediumThreshold: number, highThreshold: number) => Promise<void>
  isSaving: boolean
}) {
  const [medium, setMedium] = useState(String(mediumThreshold))
  const [high, setHigh] = useState(String(highThreshold))

  useEffect(() => {
    if (open) { setMedium(String(mediumThreshold)); setHigh(String(highThreshold)) }
  }, [open, mediumThreshold, highThreshold])

  async function handleSave() {
    const parsedMedium = Number(medium)
    const parsedHigh = Number(high)
    if (Number.isNaN(parsedMedium) || parsedMedium < 0) return
    if (Number.isNaN(parsedHigh) || parsedHigh < parsedMedium) return
    await onSave(parsedMedium, parsedHigh)
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Contract Approval Thresholds</DialogTitle></DialogHeader>
        <DialogBody className="space-y-4">
          <p className="text-xs text-muted-foreground">
            Determines the Stage 7 Final Approval chain by contract value (in your base currency): below the medium threshold needs Legal only, up to the high threshold adds Finance, and above it also adds Admin (VP/CFO).
          </p>
          <div className="space-y-1.5">
            <Label>Medium Threshold</Label>
            <Input type="number" min={0} step="any" value={medium} onChange={(e) => setMedium(e.target.value)} disabled={isSaving} />
          </div>
          <div className="space-y-1.5">
            <Label>High Threshold</Label>
            <Input type="number" min={0} step="any" value={high} onChange={(e) => setHigh(e.target.value)} disabled={isSaving} />
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isSaving}>Close</Button>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
