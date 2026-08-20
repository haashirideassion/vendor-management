import { useState } from "react"
import { usePlatformOrganizations } from "@/hooks/useSuperadmin"
import {
  useSuperadminVendorsListAll, useFeatureEntitlementTenantState, useSetFeatureEntitlement,
  type EntitlementScope, type TenantModuleEntitlement,
} from "@/hooks/useFeatureEntitlements"
import { AnimatedPage } from "@/components/shared/AnimatedPage"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogBody } from "@/components/ui/dialog"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { toast } from "sonner"

// Platform-level, Super-Admin-only: which product modules a given org or
// vendor tenant has at all, independent of role/permission (Phase 2 of the
// RBAC/Teams redesign). Absence of an override means entitled -- turning a
// module OFF here is the only thing this screen actually writes; turning
// it back ON just removes that override, reverting to the default.
export function SuperadminFeatureEntitlements() {
  const [scope, setScope] = useState<EntitlementScope>("org")
  const [tenantId, setTenantId] = useState<string | undefined>(undefined)
  const [disablingModule, setDisablingModule] = useState<TenantModuleEntitlement | null>(null)
  const [reason, setReason] = useState("")

  const { data: orgs = [] } = usePlatformOrganizations()
  const { data: vendors = [] } = useSuperadminVendorsListAll()
  const { data: modules = [], isLoading } = useFeatureEntitlementTenantState(scope, tenantId)
  const setEntitlement = useSetFeatureEntitlement()

  function handleScopeChange(next: EntitlementScope) {
    setScope(next)
    setTenantId(undefined)
  }

  async function handleEnable(m: TenantModuleEntitlement) {
    if (!tenantId) return
    try {
      await setEntitlement.mutateAsync({ scope, tenantId, moduleCode: m.moduleCode, enabled: true })
      toast.success(`${m.label} re-enabled`)
    } catch (e: unknown) {
      toast.error((e as Error).message ?? "Failed to update entitlement")
    }
  }

  function openDisable(m: TenantModuleEntitlement) {
    setDisablingModule(m)
    setReason("")
  }

  async function confirmDisable() {
    if (!tenantId || !disablingModule) return
    try {
      await setEntitlement.mutateAsync({ scope, tenantId, moduleCode: disablingModule.moduleCode, enabled: false, reason: reason.trim() || undefined })
      toast.success(`${disablingModule.label} disabled`)
      setDisablingModule(null)
    } catch (e: unknown) {
      toast.error((e as Error).message ?? "Failed to update entitlement")
    }
  }

  return (
    <AnimatedPage className="space-y-6">
      <div>
        <h1 className="text-lg font-bold">Feature Entitlements</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Control which product modules a specific organisation or vendor has access to at all — independent of their roles or permissions.
        </p>
      </div>

      <div className="flex gap-3 items-end">
        <div className="space-y-1.5">
          <Label className="text-xs">Tenant type</Label>
          <Select value={scope} onValueChange={(v) => handleScopeChange(v as EntitlementScope)}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="org">Organisation</SelectItem>
              <SelectItem value="vendor">Vendor</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5 flex-1 max-w-sm">
          <Label className="text-xs">{scope === "org" ? "Organisation" : "Vendor"}</Label>
          <Select value={tenantId ?? ""} onValueChange={setTenantId}>
            <SelectTrigger className="w-full"><SelectValue placeholder={`Select a ${scope === "org" ? "organisation" : "vendor"}`} /></SelectTrigger>
            <SelectContent>
              {scope === "org"
                ? orgs.map((o) => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)
                : vendors.map((v) => <SelectItem key={v.id} value={v.id}>{v.company_name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      {tenantId && (
        <div className="rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Module</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Entitled</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">Loading…</TableCell></TableRow>
              )}
              {!isLoading && modules.length === 0 && (
                <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">No modules found.</TableCell></TableRow>
              )}
              {modules.map((m) => (
                <TableRow key={m.moduleCode}>
                  <TableCell className="font-medium">{m.label}</TableCell>
                  <TableCell className="text-muted-foreground text-sm">{m.description}</TableCell>
                  <TableCell>
                    {m.enabled ? (
                      <Badge variant="outline" className="bg-green-100 text-green-800 border-green-200">Entitled</Badge>
                    ) : (
                      <Badge variant="outline" className="bg-orange-100 text-orange-800 border-orange-200" title={m.notes ?? undefined}>
                        Disabled{m.notes ? ` — ${m.notes}` : ""}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <Switch
                      checked={m.enabled}
                      disabled={setEntitlement.isPending}
                      onCheckedChange={(checked) => (checked ? handleEnable(m) : openDisable(m))}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={!!disablingModule} onOpenChange={(o) => !o && setDisablingModule(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Disable {disablingModule?.label}</DialogTitle></DialogHeader>
          <DialogBody className="space-y-3">
            <p className="text-sm text-muted-foreground">
              This tenant will lose access to every feature in this module immediately, regardless of any user's role.
            </p>
            <div className="space-y-1.5">
              <Label>Reason (optional, recorded in the audit log)</Label>
              <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Not part of this tenant's current plan" />
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDisablingModule(null)}>Cancel</Button>
            <Button variant="destructive" onClick={confirmDisable} disabled={setEntitlement.isPending}>
              {setEntitlement.isPending ? "Disabling…" : "Disable"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AnimatedPage>
  )
}
