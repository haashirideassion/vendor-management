import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogBody } from "@/components/ui/dialog"
import type { MatchToleranceType } from "@/lib/types"

// 3-way match tolerance (Procurement Lifecycle Enhancement) -- absence of a
// configured setting means EXACT match required (today's unchanged
// zero-tolerance behavior); setting a value only relaxes it from here.
export function MatchToleranceDialog({
  open, onClose, toleranceType, toleranceValue, onSave, isSaving,
}: {
  open: boolean
  onClose: () => void
  toleranceType: MatchToleranceType
  toleranceValue: number
  onSave: (toleranceType: MatchToleranceType, toleranceValue: number) => Promise<void>
  isSaving: boolean
}) {
  const [type, setType] = useState<MatchToleranceType>(toleranceType)
  const [value, setValue] = useState(String(toleranceValue))

  useEffect(() => {
    if (open) { setType(toleranceType); setValue(String(toleranceValue)) }
  }, [open, toleranceType, toleranceValue])

  async function handleSave() {
    const parsed = Number(value)
    if (Number.isNaN(parsed) || parsed < 0) return
    await onSave(type, parsed)
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>3-Way Match Tolerance</DialogTitle></DialogHeader>
        <DialogBody className="space-y-4">
          <p className="text-xs text-muted-foreground">
            An invoice within this tolerance of the verified GRN/Service Confirmation total auto-matches. Anything outside it is flagged as an exception for review. Set to 0 to require an exact match (today's default).
          </p>
          <div className="space-y-1.5">
            <Label>Tolerance Type</Label>
            <Select value={type} onValueChange={(v) => setType(v as MatchToleranceType)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="amount">Fixed Amount</SelectItem>
                <SelectItem value="percentage">Percentage of Invoice</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>{type === "percentage" ? "Tolerance (%)" : "Tolerance Amount"}</Label>
            <Input
              type="number"
              min={0}
              step="any"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              disabled={isSaving}
            />
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
