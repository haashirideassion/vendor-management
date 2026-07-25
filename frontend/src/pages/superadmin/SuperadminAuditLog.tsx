import { useState } from "react"
import { useSuperadminAuditLog, type AuditLogFilters } from "@/hooks/useSuperadminAuditLog"
import { usePlatformOrganizations } from "@/hooks/useSuperadmin"
import { usePlatformUsers } from "@/hooks/useSuperadminUsers"
import { AnimatedPage } from "@/components/shared/AnimatedPage"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { SolarDuotoneIcon, Cancel01Icon } from "@/components/shared/SolarIcon"
import { format } from "date-fns"

const ACTING_AS_LABELS: Record<string, string> = {
  none: "Direct (blank)",
  group_admin: "Group Admin",
  superadmin: "Superadmin",
}

const ENTITY_TYPE_LABELS: Record<string, string> = {
  engagement: "Engagement",
  contract: "Contract",
  grn: "GRN",
  invoice: "Invoice",
  category: "Category",
  purchase_order: "Purchase Order",
  organization: "Organization",
  organization_group: "Group",
  organization_member: "Org Member",
  org_onboarding_draft: "Org Onboarding",
  vendor: "Vendor",
  vendor_user: "Vendor User",
  profile: "Profile",
}

export function SuperadminAuditLog() {
  const [filters, setFilters] = useState<AuditLogFilters>({})
  const { data: rows = [], isLoading } = useSuperadminAuditLog(filters)
  const { data: orgs = [] } = usePlatformOrganizations()
  const { data: users = [] } = usePlatformUsers()

  function setFilter<K extends keyof AuditLogFilters>(key: K, value: AuditLogFilters[K] | "") {
    setFilters((f) => {
      const next = { ...f }
      if (value === "" || value === undefined) delete next[key]
      else next[key] = value
      return next
    })
  }

  const hasFilters = Object.keys(filters).length > 0

  return (
    <AnimatedPage className="space-y-6">
      <div className="space-y-3 p-4 rounded-xl border bg-card">
        {hasFilters && (
          <div className="flex justify-end">
            <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-muted-foreground" onClick={() => setFilters({})}>
              <SolarDuotoneIcon icon={Cancel01Icon} size={13} strokeWidth={1.5} />
              Clear all
            </Button>
          </div>
        )}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
        <div className="space-y-1 min-w-0">
          <Label className="text-xs">Organization</Label>
          <Select value={filters.orgId ?? "any"} onValueChange={(v) => setFilter("orgId", v === "any" ? "" : v)}>
            <SelectTrigger className="w-full"><SelectValue placeholder="Any" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="any">Any</SelectItem>
              {orgs.map((o) => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1 min-w-0">
          <Label className="text-xs">Entity type</Label>
          <Select value={filters.entityType ?? "any"} onValueChange={(v) => setFilter("entityType", v === "any" ? "" : v)}>
            <SelectTrigger className="w-full"><SelectValue placeholder="Any" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="any">Any</SelectItem>
              {Object.entries(ENTITY_TYPE_LABELS).map(([value, label]) => (
                <SelectItem key={value} value={value}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1 min-w-0">
          <Label className="text-xs">Entity ID</Label>
          <Input value={filters.entityId ?? ""} onChange={(e) => setFilter("entityId", e.target.value)} placeholder="uuid" />
        </div>
        <div className="space-y-1 min-w-0">
          <Label className="text-xs">Action</Label>
          <Input value={filters.action ?? ""} onChange={(e) => setFilter("action", e.target.value)} placeholder="status_changed" />
        </div>
        <div className="space-y-1 min-w-0">
          <Label className="text-xs">Actor</Label>
          <Select value={filters.performedBy ?? "any"} onValueChange={(v) => setFilter("performedBy", v === "any" ? "" : v)}>
            <SelectTrigger className="w-full"><SelectValue placeholder="Any" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="any">Any</SelectItem>
              {users.map((u) => <SelectItem key={u.id} value={u.id}>{u.fullName || u.email}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1 min-w-0">
          <Label className="text-xs">Acting as</Label>
          <Select value={filters.actingAs ?? "any"} onValueChange={(v) => setFilter("actingAs", v === "any" ? "" : (v as AuditLogFilters["actingAs"]))}>
            <SelectTrigger className="w-full"><SelectValue placeholder="Any" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="any">Any</SelectItem>
              <SelectItem value="none">Direct (blank)</SelectItem>
              <SelectItem value="group_admin">Group Admin</SelectItem>
              <SelectItem value="superadmin">Superadmin</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1 min-w-0">
          <Label className="text-xs">From</Label>
          <Input type="date" value={filters.dateFrom ?? ""} onChange={(e) => setFilter("dateFrom", e.target.value)} />
        </div>
        <div className="space-y-1 min-w-0">
          <Label className="text-xs">To</Label>
          <Input type="date" value={filters.dateTo ?? ""} onChange={(e) => setFilter("dateTo", e.target.value)} />
        </div>
        </div>
      </div>

      <div className="rounded-xl border bg-card overflow-x-auto">
        <Table className="table-fixed w-full">
          <TableHeader>
            <TableRow>
              <TableHead className="w-[14%]">Date</TableHead>
              <TableHead className="w-[18%]">Org</TableHead>
              <TableHead className="w-[18%]">Entity</TableHead>
              <TableHead className="w-[16%]">Action</TableHead>
              <TableHead className="w-[18%]">Actor</TableHead>
              <TableHead className="w-[16%]">Acting As</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">Loading…</TableCell></TableRow>
            )}
            {!isLoading && rows.length === 0 && (
              <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">No matching audit entries.</TableCell></TableRow>
            )}
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="text-muted-foreground whitespace-nowrap">{format(new Date(r.created_at), "dd MMM yyyy HH:mm")}</TableCell>
                <TableCell className="text-muted-foreground truncate" title={r.organizations?.name ?? undefined}>{r.organizations?.name ?? "—"}</TableCell>
                <TableCell className="text-xs truncate">
                  <div className="font-medium">{ENTITY_TYPE_LABELS[r.entity_type] ?? r.entity_type}</div>
                  <div className="text-muted-foreground font-mono">{r.entity_id.slice(0, 8)}…</div>
                </TableCell>
                <TableCell className="font-medium truncate" title={r.action}>{r.action}</TableCell>
                <TableCell className="text-muted-foreground truncate">{r.profiles?.full_name ?? r.profiles?.email ?? "—"}</TableCell>
                <TableCell>
                  {r.acting_as ? (
                    <Badge variant="outline">{ACTING_AS_LABELS[r.acting_as]}</Badge>
                  ) : (
                    <span className="text-muted-foreground text-xs">{ACTING_AS_LABELS.none}</span>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </AnimatedPage>
  )
}
