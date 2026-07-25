import { useState } from "react"
import { useParams, Link } from "react-router-dom"
import {
  usePlatformGroups, useAddOrgToGroup, useSetGroupPrimary,
  useReparentGroup, useGrantGroupAdmin, useRevokeGroupAdmin, useMergeGroups,
  useRemoveOrgFromGroupSuperadmin, useDissolveGroup,
} from "@/hooks/useGroups"
import { usePlatformOrganizations } from "@/hooks/useSuperadmin"
import { AnimatedPage } from "@/components/shared/AnimatedPage"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogBody } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { SolarDuotoneIcon, ArrowLeft01Icon, Building06Icon, Settings01Icon, EyeIcon } from "@/components/shared/SolarIcon"
import { EFFECTIVE_ORG_STATUS_LABELS, EFFECTIVE_ORG_STATUS_COLORS } from "@/lib/constants"
import { ApiError } from "@/lib/api"
import { format } from "date-fns"
import { toast } from "sonner"

export function GroupDetailPage() {
  const { groupId } = useParams<{ groupId: string }>()
  const { data: groups = [], isLoading } = usePlatformGroups()
  const { data: orgs = [] } = usePlatformOrganizations()
  const group = groups.find((g) => g.id === groupId)

  const addOrg = useAddOrgToGroup()
  const setPrimary = useSetGroupPrimary()
  const reparent = useReparentGroup()
  const grantAdmin = useGrantGroupAdmin()
  const revokeAdmin = useRevokeGroupAdmin()
  const mergeGroups = useMergeGroups()
  const removeOrg = useRemoveOrgFromGroupSuperadmin()
  const dissolveGroup = useDissolveGroup()

  const [addOrgId, setAddOrgId] = useState("")
  const [adminEmail, setAdminEmail] = useState("")
  const [mergeTargetId, setMergeTargetId] = useState("")
  const [reparentId, setReparentId] = useState(group?.parentGroupId ?? "")
  const [dissolveBlocked, setDissolveBlocked] = useState<{ orgs: string[]; subGroups: string[] } | null>(null)
  const [orgReassignments, setOrgReassignments] = useState<Record<string, string>>({})
  const [subGroupReassignments, setSubGroupReassignments] = useState<Record<string, string>>({})
  const [removalTarget, setRemovalTarget] = useState<{ id: string; name: string } | null>(null)
  const [successorCandidates, setSuccessorCandidates] = useState<string[]>([])
  const [successorChoice, setSuccessorChoice] = useState("")

  if (isLoading) {
    return (
      <AnimatedPage className="space-y-6">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </AnimatedPage>
    )
  }

  if (!group) {
    return (
      <AnimatedPage className="space-y-6">
        <Link to="/admin/superadmin/organizations" className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
          <SolarDuotoneIcon icon={ArrowLeft01Icon} size={13} strokeWidth={1.5} />
          Organizations
        </Link>
        <p className="text-sm text-muted-foreground">Group not found.</p>
      </AnimatedPage>
    )
  }

  const availableOrgsToAdd = orgs.filter((o) => !group.memberOrgs.some((m) => m.id === o.id))
  const otherGroups = groups.filter((g) => g.id !== group.id)
  const memberOrgDetails = group.memberOrgs.map((m) => ({ ...m, full: orgs.find((o) => o.id === m.id) }))

  async function handleAddOrg() {
    if (!addOrgId) return
    try {
      await addOrg.mutateAsync({ groupId: group!.id, organizationId: addOrgId })
      toast.success("Organization added to group")
      setAddOrgId("")
    } catch (e: unknown) {
      toast.error((e as Error).message ?? "Failed to add organization")
    }
  }

  async function attemptRemoveOrg(orgId: string, orgName: string, successorOrgId?: string) {
    try {
      await removeOrg.mutateAsync({ groupId: group!.id, organizationId: orgId, successorOrgId })
      toast.success(`${orgName} removed`)
      setRemovalTarget(null)
    } catch (e: unknown) {
      if (e instanceof ApiError && e.code === "PRIMARY_ORG_REMOVAL_BLOCKED") {
        const details = e.details as { candidates?: string[] } | undefined
        setRemovalTarget({ id: orgId, name: orgName })
        setSuccessorCandidates(details?.candidates ?? [])
        return
      }
      toast.error((e as Error).message ?? "Failed to remove organization")
    }
  }

  async function handleSetPrimary(orgId: string) {
    try {
      await setPrimary.mutateAsync({ groupId: group!.id, organizationId: orgId })
      toast.success("Primary organization set")
    } catch (e: unknown) {
      toast.error((e as Error).message ?? "Failed to set primary")
    }
  }

  async function handleReparent() {
    try {
      await reparent.mutateAsync({ groupId: group!.id, newParentGroupId: reparentId || null })
      toast.success("Group reparented")
    } catch (e: unknown) {
      toast.error((e as Error).message ?? "Failed to reparent group")
    }
  }

  async function handleGrantAdmin() {
    if (!adminEmail.trim()) return
    try {
      await grantAdmin.mutateAsync({ groupId: group!.id, email: adminEmail.trim() })
      toast.success("Group admin granted")
      setAdminEmail("")
    } catch (e: unknown) {
      toast.error((e as Error).message ?? "Failed to grant group admin")
    }
  }

  async function handleRevokeAdmin(userId: string) {
    try {
      await revokeAdmin.mutateAsync({ groupId: group!.id, userId })
      toast.success("Group admin revoked")
    } catch (e: unknown) {
      toast.error((e as Error).message ?? "Failed to revoke group admin")
    }
  }

  async function handleMerge() {
    if (!mergeTargetId) return
    try {
      await mergeGroups.mutateAsync({ survivingGroupId: mergeTargetId, absorbedGroupId: group!.id })
      toast.success("Group merged")
    } catch (e: unknown) {
      toast.error((e as Error).message ?? "Failed to merge group")
    }
  }

  async function handleDissolve() {
    try {
      await dissolveGroup.mutateAsync({ groupId: group!.id })
      toast.success("Group dissolved")
    } catch (e: unknown) {
      if (e instanceof ApiError && e.code === "GROUP_NOT_EMPTY") {
        const details = e.details as { orgs?: string[]; subGroups?: string[] } | undefined
        setDissolveBlocked({ orgs: details?.orgs ?? [], subGroups: details?.subGroups ?? [] })
        return
      }
      toast.error((e as Error).message ?? "Failed to dissolve group")
    }
  }

  async function handleDissolveWithPlan() {
    try {
      await dissolveGroup.mutateAsync({
        groupId: group!.id,
        plan: {
          orgReassignments: Object.entries(orgReassignments).map(([organizationId, targetGroupId]) => ({ organizationId, targetGroupId })),
          subGroupReassignments: Object.entries(subGroupReassignments).map(([subGroupId, targetGroupId]) => ({ subGroupId, targetGroupId: targetGroupId || null })),
        },
      })
      toast.success("Group dissolved")
    } catch (e: unknown) {
      toast.error((e as Error).message ?? "Failed to dissolve group")
    }
  }

  return (
    <AnimatedPage className="space-y-6">
      <div>
        <Link to="/admin/superadmin/organizations" className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground mb-3">
          <SolarDuotoneIcon icon={ArrowLeft01Icon} size={13} strokeWidth={1.5} />
          Organizations
        </Link>
        <h1 className="text-xl font-bold tracking-tight">{group.name}</h1>
      </div>

      <Tabs defaultValue="organizations">
        <TabsList className="mb-2 h-10 gap-1 bg-muted/50 p-1 rounded-xl">
          <TabsTrigger value="organizations" className="rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm gap-1.5 text-sm h-8 px-3">
            <SolarDuotoneIcon icon={Building06Icon} size={14} strokeWidth={1.5} />
            Organizations
            {group.memberOrgs.length > 0 && <span className="tab-count">{group.memberOrgs.length}</span>}
          </TabsTrigger>
          <TabsTrigger value="manage" className="rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm gap-1.5 text-sm h-8 px-3">
            <SolarDuotoneIcon icon={Settings01Icon} size={14} strokeWidth={1.5} />
            Manage
          </TabsTrigger>
        </TabsList>

        {/* ── Organizations ── */}
        <TabsContent value="organizations" className="space-y-4 mt-0">
          <div className="rounded-xl border bg-card overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Members</TableHead>
                  <TableHead>Vendors</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {memberOrgDetails.length === 0 && (
                  <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">No member organizations.</TableCell></TableRow>
                )}
                {memberOrgDetails.map((o) => (
                  <TableRow key={o.id}>
                    <TableCell className="font-medium whitespace-nowrap">
                      {o.name}
                      {o.id === group.primaryOrgId && <Badge className="ml-2 h-4 px-1 text-[9px]">Primary</Badge>}
                    </TableCell>
                    <TableCell>
                      {o.full && (
                        <Badge variant="outline" className={`whitespace-nowrap ${EFFECTIVE_ORG_STATUS_COLORS[o.full.effectiveStatus]}`}>
                          {EFFECTIVE_ORG_STATUS_LABELS[o.full.effectiveStatus]}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>{o.full?.organization_members?.[0]?.count ?? "—"}</TableCell>
                    <TableCell>{o.full?.organization_vendors?.[0]?.count ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground whitespace-nowrap">{o.full ? format(new Date(o.full.created_at), "dd MMM yyyy") : "—"}</TableCell>
                    <TableCell className="flex flex-wrap gap-2">
                      <Button asChild size="sm" variant="ghost" className="h-8 px-2 gap-1.5 text-xs">
                        <Link to={`/admin/superadmin/organizations/${o.id}`}>
                          <SolarDuotoneIcon icon={EyeIcon} size={14} strokeWidth={1.5} />
                          View more
                        </Link>
                      </Button>
                      {o.id !== group.primaryOrgId && (
                        <Button size="sm" variant="outline" onClick={() => handleSetPrimary(o.id)}>Set primary</Button>
                      )}
                      <Button size="sm" variant="outline" className="text-destructive border-destructive/30 hover:bg-destructive/10" onClick={() => attemptRemoveOrg(o.id, o.name)}>Remove</Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="flex gap-2 rounded-xl border bg-card p-4">
            <Select value={addOrgId} onValueChange={setAddOrgId}>
              <SelectTrigger className="flex-1"><SelectValue placeholder="Add an organization…" /></SelectTrigger>
              <SelectContent>
                {availableOrgsToAdd.map((o) => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button variant="outline" onClick={handleAddOrg} disabled={!addOrgId}>Add</Button>
          </div>
        </TabsContent>

        {/* ── Manage ── */}
        <TabsContent value="manage" className="mt-0">
          <div className="max-w-2xl space-y-6">
            {/* Admins */}
            <div className="space-y-2 rounded-xl border bg-card p-5">
              <Label>Group admins</Label>
              {group.admins.map((a) => (
                <div key={a.id} className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm">
                  <span>{a.full_name} <span className="text-muted-foreground">({a.email})</span></span>
                  <Button size="sm" variant="ghost" className="text-destructive" onClick={() => handleRevokeAdmin(a.id)}>Revoke</Button>
                </div>
              ))}
              <div className="flex gap-2">
                <Input value={adminEmail} onChange={(e) => setAdminEmail(e.target.value)} placeholder="user@company.com" className="flex-1" />
                <Button variant="outline" onClick={handleGrantAdmin} disabled={!adminEmail.trim()}>Grant admin</Button>
              </div>
            </div>

            {/* Reparent */}
            <div className="space-y-2 rounded-xl border bg-card p-5">
              <Label>Parent group</Label>
              <div className="flex gap-2">
                <Select value={reparentId} onValueChange={setReparentId}>
                  <SelectTrigger className="flex-1"><SelectValue placeholder="No parent (top-level)" /></SelectTrigger>
                  <SelectContent>
                    {otherGroups.map((g) => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Button variant="outline" onClick={handleReparent}>Move</Button>
              </div>
            </div>

            {/* Merge */}
            <div className="space-y-2 rounded-xl border bg-card p-5">
              <Label>Merge this group into…</Label>
              <div className="flex gap-2">
                <Select value={mergeTargetId} onValueChange={setMergeTargetId}>
                  <SelectTrigger className="flex-1"><SelectValue placeholder="Select surviving group" /></SelectTrigger>
                  <SelectContent>
                    {otherGroups.map((g) => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Button variant="outline" onClick={handleMerge} disabled={!mergeTargetId}>Merge</Button>
              </div>
            </div>

            {/* Dissolve */}
            <div className="space-y-2 rounded-xl border border-destructive/30 bg-card p-5">
              <Label className="text-destructive">Dissolve group</Label>
              {!dissolveBlocked ? (
                <Button variant="destructive" size="sm" onClick={handleDissolve}>Dissolve</Button>
              ) : (
                <div className="space-y-3">
                  <p className="text-xs text-muted-foreground">
                    This group still has active members — reassign every one of them before it can be dissolved.
                  </p>
                  {dissolveBlocked.orgs.map((orgId) => {
                    const org = group.memberOrgs.find((o) => o.id === orgId)
                    return (
                      <div key={orgId} className="flex items-center gap-2 text-sm">
                        <span className="w-32 shrink-0 truncate">{org?.name ?? orgId}</span>
                        <Select value={orgReassignments[orgId] ?? ""} onValueChange={(v) => setOrgReassignments((s) => ({ ...s, [orgId]: v }))}>
                          <SelectTrigger className="flex-1"><SelectValue placeholder="Reassign to…" /></SelectTrigger>
                          <SelectContent>
                            {otherGroups.map((g) => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                    )
                  })}
                  {dissolveBlocked.subGroups.map((sgId) => {
                    const sg = group.subGroups.find((s) => s.id === sgId)
                    return (
                      <div key={sgId} className="flex items-center gap-2 text-sm">
                        <span className="w-32 shrink-0 truncate">{sg?.name ?? sgId}</span>
                        <Select value={subGroupReassignments[sgId] ?? ""} onValueChange={(v) => setSubGroupReassignments((s) => ({ ...s, [sgId]: v }))}>
                          <SelectTrigger className="flex-1"><SelectValue placeholder="Promote to top-level or pick a parent…" /></SelectTrigger>
                          <SelectContent>
                            {otherGroups.map((g) => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                    )
                  })}
                  <Button variant="destructive" size="sm" onClick={handleDissolveWithPlan}>Confirm dissolve</Button>
                </div>
              )}
            </div>
          </div>
        </TabsContent>
      </Tabs>

      <Dialog open={!!removalTarget} onOpenChange={(o) => !o && setRemovalTarget(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Choose a successor primary organization</DialogTitle></DialogHeader>
          <DialogBody className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {removalTarget?.name} is this group's current primary organization.
            </p>
            <Select value={successorChoice} onValueChange={setSuccessorChoice}>
              <SelectTrigger><SelectValue placeholder="Select successor organization" /></SelectTrigger>
              <SelectContent>
                {successorCandidates.map((id) => {
                  const org = group.memberOrgs.find((o) => o.id === id)
                  return <SelectItem key={id} value={id}>{org?.name ?? id}</SelectItem>
                })}
              </SelectContent>
            </Select>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRemovalTarget(null)}>Cancel</Button>
            <Button
              disabled={!successorChoice}
              onClick={() => removalTarget && attemptRemoveOrg(removalTarget.id, removalTarget.name, successorChoice)}
            >
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AnimatedPage>
  )
}
