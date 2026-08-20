import { useState } from "react"
import { useBreakGlassView, BREAK_GLASS_ENTITY_TYPES, type BreakGlassEntityType } from "@/hooks/useBreakGlass"
import { AnimatedPage } from "@/components/shared/AnimatedPage"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { SolarDuotoneIcon, Alert01Icon } from "@/components/shared/SolarIcon"
import { toast } from "sonner"

export function SuperadminBreakGlass() {
  const [entityType, setEntityType] = useState<BreakGlassEntityType | "">("")
  const [entityId, setEntityId] = useState("")
  const [reason, setReason] = useState("")
  const view = useBreakGlassView()

  const canSubmit = !!entityType && entityId.trim().length > 0 && reason.trim().length > 0

  async function handleSubmit() {
    // Rejected client-side before it ever reaches the API -- an empty
    // reason (or missing entity type/id) never leaves the browser.
    if (!entityType) return toast.error("Entity type is required")
    if (!entityId.trim()) return toast.error("Entity ID is required")
    if (!reason.trim()) return toast.error("A reason is required — this access is logged")

    try {
      await view.mutateAsync({ entityType, entityId: entityId.trim(), reason: reason.trim() })
    } catch (e: unknown) {
      toast.error((e as Error).message ?? "Failed to access entity")
    }
  }

  return (
    <AnimatedPage className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
      <div className="space-y-6 min-w-0 py-6">
        {/* <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 dark:border-red-800 dark:bg-red-950/40">
          <SolarDuotoneIcon icon={Alert01Icon} size={18} strokeWidth={1.5} primaryColor="rgb(220 38 38)" secondaryColor="rgb(220 38 38)" className="mt-0.5 shrink-0" />
          <p className="text-sm text-red-800 dark:text-red-200">
            This is logged. Your identity, the entity, and your stated reason are permanently recorded in the audit log.
          </p>
        </div> */}

        <div className="max-w-lg space-y-4 rounded-xl border bg-card p-5">
          <div className="space-y-1.5">
            <Label>Entity type</Label>
            <Select value={entityType} onValueChange={(v) => setEntityType(v as BreakGlassEntityType)}>
              <SelectTrigger><SelectValue placeholder="Select entity type" /></SelectTrigger>
              <SelectContent>
                {BREAK_GLASS_ENTITY_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Entity ID</Label>
            <Input value={entityId} onChange={(e) => setEntityId(e.target.value)} placeholder="uuid" />
          </div>
          <div className="space-y-1.5">
            <Label>Reason (required)</Label>
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why do you need to view this record?" rows={3} />
          </div>
          <Button onClick={handleSubmit} disabled={!canSubmit || view.isPending} className="w-full">
            {view.isPending ? "Accessing…" : "View Record"}
          </Button>
        </div>

        {view.data && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
              <SolarDuotoneIcon icon={Alert01Icon} size={16} strokeWidth={1.5} primaryColor="currentColor" secondaryColor="currentColor" />
              Viewed via break-glass — logged. Read-only.
            </div>
            <pre className="max-h-[50vh] overflow-auto rounded-xl border bg-muted/40 p-4 text-xs">
              {JSON.stringify(view.data, null, 2)}
            </pre>
          </div>
        )}
      </div>

      <aside className="space-y-3 rounded-xl border bg-card p-5 lg:sticky lg:top-6">
        <h2 className="text-sm font-semibold">Info of Break Glass Access</h2>
        <div className="space-y-3 text-xs text-muted-foreground">
          <p>
            <span className="font-medium text-foreground">How it works: </span>
            superadmin picks the exact record (an invoice, PO, purchase request, etc.), types a required reason, then
            views it — read-only, clearly marked as "viewed via break-glass."
          </p>
          <p>
            <span className="font-medium text-foreground">Why it exists: </span>
            superadmin's normal access is deliberately limited to org/vendor metadata only — never purchase requests,
            POs, invoices, contracts. But sometimes there's a real reason to check one specific record (a support
            ticket, a billing dispute). Break-glass is that one-off door, instead of giving superadmin standing
            access to everything all the time.
          </p>
          <p>
            <span className="font-medium text-foreground">The key part: </span>
            every use gets written to the Audit Log automatically — so it's never quiet or hidden, and an org can
            always see if and when superadmin looked at something of theirs.
          </p>
        </div>
      </aside>
    </AnimatedPage>
  )
}
