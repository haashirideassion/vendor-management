import { useState, useEffect } from "react"
import { Link } from "react-router-dom"
import { usePlatformGroups, useGroupsHealth, useCreateGroup, type PlatformGroup } from "@/hooks/useGroups"
import { usePagination } from "@/hooks/usePagination"
import { PaginationBar } from "@/components/shared/PaginationBar"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogBody } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { SolarDuotoneIcon, Search01Icon, EyeIcon, Cancel01Icon } from "@/components/shared/SolarIcon"
import { toast } from "sonner"

const STATUS_COLORS: Record<string, string> = {
  active: "bg-green-100 text-green-800 border-green-200",
  archived: "bg-gray-100 text-gray-800 border-gray-200",
  merged: "bg-gray-100 text-gray-800 border-gray-200",
}

const PAGE_SIZE = 10

// The Groups tab content of the Organizations page (moved out of its former
// standalone SuperadminGroups page/route per the confirmed nav decision --
// Groups lives as a tab, not a separate nav entry). Detail/manage actions
// live at their own route (GroupDetailPage), not a dialog.
export function GroupsPanel({ creating, onCreatingChange }: { creating: boolean; onCreatingChange: (v: boolean) => void }) {
  const { data: groups = [], isLoading } = usePlatformGroups()
  const { data: unhealthyGroups = [] } = useGroupsHealth()
  const createGroup = useCreateGroup()

  const [newName, setNewName] = useState("")
  const [newParentId, setNewParentId] = useState<string>("")
  const [search, setSearch] = useState("")
  const [status, setStatus] = useState<PlatformGroup["status"] | "">("")

  async function handleCreate() {
    if (!newName.trim()) return toast.error("Group name is required")
    try {
      await createGroup.mutateAsync({ name: newName.trim(), parentGroupId: newParentId || null })
      toast.success("Group created")
      onCreatingChange(false)
      setNewName("")
      setNewParentId("")
    } catch (e: unknown) {
      toast.error((e as Error).message ?? "Failed to create group")
    }
  }

  const unhealthyIds = new Set(unhealthyGroups.map((g) => g.id))

  const searched = search.trim()
    ? groups.filter((g) => g.name.toLowerCase().includes(search.trim().toLowerCase()))
    : groups
  const filtered = status ? searched.filter((g) => g.status === status) : searched

  const { page, setPage, totalPages, totalItems, paginated, reset } = usePagination(filtered, PAGE_SIZE)
  useEffect(() => { reset() }, [search, status])

  return (
    <div className="space-y-5">
      {unhealthyGroups.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
          {unhealthyGroups.length} group{unhealthyGroups.length !== 1 ? "s" : ""} with zero active group admins — nothing can be approved or reassigned there until one is granted.
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3 p-4 rounded-xl border bg-card">
        <div className="relative flex-1 min-w-48 max-w-xs">
          <SolarDuotoneIcon
            icon={Search01Icon}
            size={15}
            strokeWidth={1.5}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
          />
          <Input placeholder="Search by name" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={status || "all"} onValueChange={(v) => setStatus(v === "all" ? "" : (v as PlatformGroup["status"]))}>
          <SelectTrigger className="w-40"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="archived">Archived</SelectItem>
            <SelectItem value="merged">Merged</SelectItem>
          </SelectContent>
        </Select>
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
              <TableHead>Parent</TableHead>
              <TableHead>Primary Org</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Members</TableHead>
              <TableHead>Admins</TableHead>
              <TableHead>Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">Loading…</TableCell></TableRow>
            )}
            {!isLoading && paginated.length === 0 && (
              <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">No groups found.</TableCell></TableRow>
            )}
            {paginated.map((g) => {
              const parent = groups.find((p) => p.id === g.parentGroupId)
              const primary = g.memberOrgs.find((o) => o.id === g.primaryOrgId)
              return (
                <TableRow key={g.id}>
                  <TableCell className="font-medium whitespace-nowrap">
                    {g.name}
                    {unhealthyIds.has(g.id) && (
                      <Badge variant="outline" className="ml-2 h-4 px-1 text-[9px] text-amber-700 border-amber-300">no admin</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground whitespace-nowrap">{parent?.name ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground whitespace-nowrap">{primary?.name ?? "—"}</TableCell>
                  <TableCell><Badge variant="outline" className={`whitespace-nowrap ${STATUS_COLORS[g.status]}`}>{g.status}</Badge></TableCell>
                  <TableCell>{g.memberOrgs.length}</TableCell>
                  <TableCell>{g.admins.length}</TableCell>
                  <TableCell>
                    <Button asChild size="sm" variant="ghost" className="h-8 px-2 gap-1.5 text-xs">
                      <Link to={`/admin/superadmin/groups/${g.id}`}>
                        <SolarDuotoneIcon icon={EyeIcon} size={14} strokeWidth={1.5} />
                        View
                      </Link>
                    </Button>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>

      <PaginationBar page={page} totalPages={totalPages} totalItems={totalItems} onPageChange={setPage} itemLabel="group" />

      <Dialog open={creating} onOpenChange={onCreatingChange}>
        <DialogContent>
          <DialogHeader><DialogTitle>New Group</DialogTitle></DialogHeader>
          <DialogBody className="space-y-4">
            <div className="space-y-1.5">
              <Label>Group name</Label>
              <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Alpha Holdings" />
            </div>
            <div className="space-y-1.5">
              <Label>Parent group (optional)</Label>
              <Select value={newParentId} onValueChange={setNewParentId}>
                <SelectTrigger><SelectValue placeholder="No parent (top-level)" /></SelectTrigger>
                <SelectContent>
                  {groups.map((g) => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => onCreatingChange(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={createGroup.isPending}>
              {createGroup.isPending ? "Creating…" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
