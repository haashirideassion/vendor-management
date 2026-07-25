import { useState, useEffect } from "react"
import { Link } from "react-router-dom"
import {
  usePlatformOrganizations, useCreateOrganizationWithAdmin, type PlatformOrganization,
} from "@/hooks/useSuperadmin"
import { usePagination } from "@/hooks/usePagination"
import { GroupsPanel } from "@/pages/superadmin/GroupsPanel"
import { AnimatedPage } from "@/components/shared/AnimatedPage"
import { PaginationBar } from "@/components/shared/PaginationBar"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogBody } from "@/components/ui/dialog"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Search01Icon, EyeIcon, Cancel01Icon } from "@/components/shared/SolarIcon"
import { SolarDuotoneIcon } from "@/components/shared/SolarIcon"
import { EFFECTIVE_ORG_STATUS_LABELS, EFFECTIVE_ORG_STATUS_COLORS } from "@/lib/constants"
import { format } from "date-fns"
import { toast } from "sonner"

type LifecycleTab = "active" | "dormant"

function slugify(name: string) {
  return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")
}

const PAGE_SIZE = 10

function OrganizationsPanel({ creating, onCreatingChange }: { creating: boolean; onCreatingChange: (v: boolean) => void }) {
  const { data: orgs = [], isLoading } = usePlatformOrganizations()
  const createOrg = useCreateOrganizationWithAdmin()

  const [name, setName] = useState("")
  const [adminName, setAdminName] = useState("")
  const [adminEmail, setAdminEmail] = useState("")

  const [tab, setTab] = useState<LifecycleTab>("active")
  const [search, setSearch] = useState("")
  const [status, setStatus] = useState<PlatformOrganization["status"] | "">("")

  function resetForm() {
    setName("")
    setAdminName("")
    setAdminEmail("")
  }

  async function handleCreate() {
    if (!name.trim() || !adminName.trim() || !adminEmail.trim()) {
      toast.error("Organization name, admin name, and admin email are all required")
      return
    }
    try {
      const result = await createOrg.mutateAsync({
        orgName: name.trim(), orgCode: slugify(name), adminName: adminName.trim(), adminEmail: adminEmail.trim(),
      })
      toast.success(
        result.inviteSent
          ? `Organization created. Invite sent to ${result.adminEmail}.`
          : `Organization created. ${result.adminEmail} already has an account and was added as admin.`
      )
      onCreatingChange(false)
      resetForm()
    } catch (e: unknown) {
      toast.error((e as Error).message ?? "Failed to create organization")
    }
  }

  const activeOrgs = orgs.filter((o) => o.status === "active")
  const dormantOrgs = orgs.filter((o) => o.status !== "active")
  const tabOrgs = tab === "active" ? activeOrgs : dormantOrgs

  const searched = search.trim()
    ? tabOrgs.filter((o) => o.name.toLowerCase().includes(search.trim().toLowerCase()) || o.slug.toLowerCase().includes(search.trim().toLowerCase()))
    : tabOrgs
  const filtered = status ? searched.filter((o) => o.status === status) : searched

  const { page, setPage, totalPages, totalItems, paginated, reset } = usePagination(filtered, PAGE_SIZE)
  useEffect(() => { reset() }, [search, status, tab])

  return (
    <div className="space-y-5">
      <Tabs value={tab} onValueChange={(v) => { setTab(v as LifecycleTab); setStatus("") }}>
        <TabsList>
          <TabsTrigger value="active">
            Active
            {activeOrgs.length > 0 && <span className="tab-count">{activeOrgs.length}</span>}
          </TabsTrigger>
          <TabsTrigger value="dormant">
            Dormant
            {dormantOrgs.length > 0 && <span className="tab-count">{dormantOrgs.length}</span>}
          </TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="flex flex-wrap items-center gap-3 p-4 rounded-xl border bg-card">
        <div className="relative flex-1 min-w-48 max-w-xs">
          <SolarDuotoneIcon
            icon={Search01Icon}
            size={15}
            strokeWidth={1.5}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
          />
          <Input placeholder="Search by name or slug" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        {tab === "dormant" && (
          <Select value={status || "all"} onValueChange={(v) => setStatus(v === "all" ? "" : (v as PlatformOrganization["status"]))}>
            <SelectTrigger className="w-40"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="suspended">Suspended</SelectItem>
              <SelectItem value="archived">Archived</SelectItem>
            </SelectContent>
          </Select>
        )}
        {(search || status) && (
          <Button variant="ghost" size="sm" className="h-9 gap-1.5 text-muted-foreground" onClick={() => { setSearch(""); setStatus("") }}>
            <SolarDuotoneIcon icon={Cancel01Icon} size={13} strokeWidth={1.5} />
            Clear
          </Button>
        )}
      </div>

      <div className="rounded-xl border bg-card overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Slug</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Members</TableHead>
              <TableHead>Vendors</TableHead>
              <TableHead>Created</TableHead>
              <TableHead>Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">Loading…</TableCell></TableRow>
            )}
            {!isLoading && paginated.length === 0 && (
              <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">No organizations found.</TableCell></TableRow>
            )}
            {paginated.map((org) => (
              <TableRow key={org.id}>
                <TableCell className="font-medium whitespace-nowrap">{org.name}</TableCell>
                <TableCell className="text-muted-foreground whitespace-nowrap">{org.slug}</TableCell>
                <TableCell>
                  <Badge variant="outline" className={`whitespace-nowrap ${EFFECTIVE_ORG_STATUS_COLORS[org.effectiveStatus]}`}>
                    {EFFECTIVE_ORG_STATUS_LABELS[org.effectiveStatus]}
                  </Badge>
                </TableCell>
                <TableCell>{org.organization_members?.[0]?.count ?? 0}</TableCell>
                <TableCell>{org.organization_vendors?.[0]?.count ?? 0}</TableCell>
                <TableCell className="whitespace-nowrap">{format(new Date(org.created_at), "dd MMM yyyy")}</TableCell>
                <TableCell>
                  <Button asChild size="sm" variant="ghost" className="h-8 px-2 gap-1.5 text-xs">
                    <Link to={`/admin/superadmin/organizations/${org.id}`}>
                      <SolarDuotoneIcon icon={EyeIcon} size={14} strokeWidth={1.5} />
                      View
                    </Link>
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <PaginationBar page={page} totalPages={totalPages} totalItems={totalItems} onPageChange={setPage} itemLabel="organization" />

      <Dialog open={creating} onOpenChange={(o) => { onCreatingChange(o); if (!o) resetForm() }}>
        <DialogContent>
          <DialogHeader><DialogTitle>New Organization</DialogTitle></DialogHeader>
          <DialogBody className="space-y-4">
            <div className="space-y-1.5">
              <Label>Organization name *</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Acme Corp" />
            </div>
            <div className="space-y-1.5">
              <Label>Initial admin name *</Label>
              <Input value={adminName} onChange={(e) => setAdminName(e.target.value)} placeholder="Jane Doe" />
            </div>
            <div className="space-y-1.5">
              <Label>Initial admin email *</Label>
              <Input
                type="email"
                value={adminEmail}
                onChange={(e) => setAdminEmail(e.target.value)}
                placeholder="jane@acme.com"
              />
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => { onCreatingChange(false); resetForm() }}>Cancel</Button>
            <Button onClick={handleCreate} disabled={createOrg.isPending}>
              {createOrg.isPending ? "Creating…" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

type TopTab = "organizations" | "groups"

export function SuperadminOrganizations() {
  const [tab, setTab] = useState<TopTab>("organizations")
  const [creatingOrg, setCreatingOrg] = useState(false)
  const [creatingGroup, setCreatingGroup] = useState(false)

  return (
    <AnimatedPage className="space-y-6">
      <Tabs value={tab} onValueChange={(v) => setTab(v as TopTab)}>
        <div className="flex items-center justify-between gap-3">
          <TabsList>
            <TabsTrigger value="organizations">Organizations</TabsTrigger>
            <TabsTrigger value="groups">Groups</TabsTrigger>
          </TabsList>
          {tab === "organizations" && <Button onClick={() => setCreatingOrg(true)}>New Organization</Button>}
          {tab === "groups" && <Button onClick={() => setCreatingGroup(true)}>New Group</Button>}
        </div>

        <TabsContent value="organizations" className="space-y-6 pt-4">
          <OrganizationsPanel creating={creatingOrg} onCreatingChange={setCreatingOrg} />
        </TabsContent>

        <TabsContent value="groups" className="pt-4">
          <GroupsPanel creating={creatingGroup} onCreatingChange={setCreatingGroup} />
        </TabsContent>
      </Tabs>
    </AnimatedPage>
  )
}
