import { useEffect, useState } from "react"
import { useInvoicePayments, useRecordInvoicePayment } from "@/hooks/useInvoices"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogBody } from "@/components/ui/dialog"
import { PAYMENT_METHOD_LABELS } from "@/lib/constants"
import { formatCurrency } from "@/lib/utils"
import type { Invoice, PaymentMethod } from "@/lib/types"

const METHODS: PaymentMethod[] = ["bank_transfer", "cheque", "cash", "card", "upi", "other"]

// Records a payment against an invoice -- supports partial/installment
// payments, defaulting the amount to the full remaining balance (today's
// one-click "Mark Paid" behavior) but editable for a partial amount.
export function RecordPaymentDialog({
  open, onOpenChange, invoice,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  invoice: Invoice
}) {
  const { data: payments = [] } = useInvoicePayments(open ? invoice.id : undefined)
  const recordPayment = useRecordInvoicePayment()

  const alreadyPaid = payments.reduce((sum, p) => sum + p.amount, 0)
  const remaining = invoice.total_amount - alreadyPaid

  const [amount, setAmount] = useState(String(remaining))
  const [method, setMethod] = useState<PaymentMethod>("bank_transfer")
  const [reference, setReference] = useState("")
  const [paidDate, setPaidDate] = useState(new Date().toISOString().slice(0, 10))
  const [notes, setNotes] = useState("")

  useEffect(() => {
    if (open) {
      setAmount(String(remaining))
      setMethod("bank_transfer")
      setReference("")
      setPaidDate(new Date().toISOString().slice(0, 10))
      setNotes("")
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, invoice.id])

  async function handleSubmit() {
    const parsed = Number(amount)
    if (Number.isNaN(parsed) || parsed <= 0) return
    try {
      await recordPayment.mutateAsync({
        invoiceId: invoice.id,
        amount: parsed,
        paymentMethod: method,
        referenceNumber: reference.trim() || undefined,
        paidDate,
        notes: notes.trim() || undefined,
      })
      onOpenChange(false)
    } catch { /* hook toasts its own error */ }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Record Payment</DialogTitle></DialogHeader>
        <DialogBody className="space-y-4">
          <p className="text-xs text-muted-foreground">
            Remaining balance: <span className="font-medium tabular-nums">{formatCurrency(remaining, invoice.currency)}</span>
            {alreadyPaid > 0 && ` (of ${formatCurrency(invoice.total_amount, invoice.currency)} total, ${formatCurrency(alreadyPaid, invoice.currency)} already paid)`}
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Amount <span className="text-destructive">*</span></Label>
              <Input type="number" min={0.01} max={remaining} step="any" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Payment Date <span className="text-destructive">*</span></Label>
              <Input type="date" value={paidDate} onChange={(e) => setPaidDate(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Method <span className="text-destructive">*</span></Label>
              <Select value={method} onValueChange={(v) => setMethod(v as PaymentMethod)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {METHODS.map((m) => <SelectItem key={m} value={m}>{PAYMENT_METHOD_LABELS[m]}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Reference Number</Label>
              <Input placeholder="Transaction / cheque no…" value={reference} onChange={(e) => setReference(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Notes</Label>
            <Textarea placeholder="Optional…" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={recordPayment.isPending}>Cancel</Button>
          <Button
            onClick={handleSubmit}
            disabled={recordPayment.isPending || Number(amount) <= 0 || Number(amount) > remaining + 1e-6}
          >
            {recordPayment.isPending ? "Recording…" : "Record Payment"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
