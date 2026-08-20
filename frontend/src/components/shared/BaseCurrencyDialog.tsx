import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogBody } from "@/components/ui/dialog"
import { CURRENCIES } from "@/lib/constants"

// The currency approval_policies.threshold_amount is denominated in, and
// what every purchase request/PO/invoice/contract's amount_in_base_currency is
// converted into at creation time (migration 077). Changing it does NOT
// retroactively recompute already-existing transactions' conversions.
export function BaseCurrencyDialog({
  open, onClose, currentCurrency, onSave, isSaving,
}: {
  open: boolean
  onClose: () => void
  currentCurrency: string
  onSave: (currency: string) => Promise<void>
  isSaving: boolean
}) {
  const [currency, setCurrency] = useState(currentCurrency)

  useEffect(() => {
    if (open) setCurrency(currentCurrency)
  }, [open, currentCurrency])

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Base Currency</DialogTitle></DialogHeader>
        <DialogBody className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Approval thresholds and reporting totals are all denominated in this currency. Purchase Requests/POs/invoices/contracts in other currencies are converted into it automatically using a live exchange rate, snapshotted at the moment each one is created — changing this later does not retroactively recompute existing transactions.
          </p>
          <Select value={currency} onValueChange={setCurrency}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {CURRENCIES.map((c) => <SelectItem key={c.code} value={c.code}>{c.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isSaving}>Close</Button>
          <Button onClick={() => onSave(currency)} disabled={isSaving || currency === currentCurrency}>
            {isSaving ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
