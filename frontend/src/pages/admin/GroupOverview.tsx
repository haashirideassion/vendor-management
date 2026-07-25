import { useState } from "react"
import { useParams, Link } from "react-router-dom"
import { useGroupOverview, useSetGroupPrimary, useRemoveOrgFromGroup, type GroupOverviewOrg } from "@/hooks/useGroupOverview"
import { AnimatedPage } from "@/components/shared/AnimatedPage"
import { VendorOnboardDialog } from "@/components/shared/VendorOnboardDialog"
import { InviteVendorLinkDialog } from "@/components/shared/InviteVendorLinkDialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogBody } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { SolarDuotoneIcon, LinkIcon } from "@/components/shared/SolarIcon"
import { ApiError } from "@/lib/api"
import { toast } from "sonner"

export function GroupOverview() {
  const { groupId } = useParams<{ groupId: string }>()
  const { data: group, isLoading } = useGroupOverview(groupId)
  const setPrimary = useSetGroupPrimary(groupId)
  const removeOrg = useRemoveOrgFromGroup(groupId)

  const [removalTarget, setRemovalTarget] = useState<GroupOverviewOrg | null>(null)
  const [successorCandidates, setSuccessorCandidates] = useState<string[] | null>(null)
  const [successorChoice, setSuccessorChoice] = useState<string>("")
  const [onboarding, setOnboarding] = useState(false)
  const [invitingLink, setInvitingLink] = useState(false)

  if (isLoading || !group) {
    return (
      <AnimatedPage className="space-y-6">
        <p className="text-sm text-muted-foreground py-8 text-center">Loading…</p>
      </AnimatedPage>
    )
  }

  const sortedOrgs = [...group.memberOrgs].sort((a, b) => {
    if (a.id === group.primaryOrgId) return -1
    if (b.id === group.primaryOrgId) return 1
    return a.name.localeCompare(b.name)
  })

  async function handleSetPrimary(orgId: string) {
    try {
      await setPrimary.mutateAsync(orgId)
      toast.success("Primary organization updated")
    } catch (e: unknown) {
      toast.error((e as Error).message ?? "Failed to set primary organization")
    }
  }

  async function attemptRemoval(org: GroupOverviewOrg, successorOrgId?: string) {
    try {
      await removeOrg.mutateAsync({ organizationId: org.id, successorOrgId })
      toast.success(`${org.name} removed from group`)
      setRemovalTarget(null)
      setSuccessorCandidates(null)
      setSuccessorChoice("")
    } catch (e: unknown) {
      if (e instanceof ApiError && e.code === "PRIMARY_ORG_REMOVAL_BLOCKED") {
        const details = e.details as { candidates?: string[] } | undefined
        setRemovalTarget(org)
        setSuccessorCandidates(details?.candidates ?? [])
        return
      }
      toast.error((e as Error).message ?? "Failed to remove organization from group")
    }
  }

  const actingOrgId = group.primaryOrgId ?? group.memberOrgs[0]?.id

  return (
    <AnimatedPage className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          {group.ancestors.length > 0 && (
            <div className="flex items-center gap-1.5 mb-1 text-sm text-muted-foreground">
              {group.ancestors.map((a) => (
                <span key={a.id} className="flex items-center gap-1.5">
                  <Link to={`/admin/groups/${a.id}`} className="hover:text-foreground hover:underline">
                    {a.name}
                  </Link>
                  <span className="text-muted-foreground/40">/</span>
                </span>
              ))}
            </div>
          )}
          <h1 className="text-2xl font-semibold">{group.name}</h1>
          <p className="text-sm text-muted-foreground">Group overview — member organizations and sub-groups.</p>
        </div>
        {actingOrgId && (
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => setInvitingLink(true)}>
              <SolarDuotoneIcon icon={LinkIcon} size={15} strokeWidth={1.5} />
              Invite via Link
            </Button>
            <Button onClick={() => setOnboarding(true)}>Onboard Vendor</Button>
          </div>
        )}
      </div>

      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Member Organizations</h2>
        {sortedOrgs.length === 0 && (
          <p className="text-sm text-muted-foreground py-4">No member organizations in this group.</p>
        )}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {sortedOrgs.map((org) => {
            const isPrimary = org.id === group.primaryOrgId
            return (
              <div key={org.id} className="rounded-xl border bg-card p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-medium">{org.name}</p>
                    <p className="text-xs text-muted-foreground">{org.slug}</p>
                  </div>
                  {isPrimary && <Badge>Primary</Badge>}
                </div>
                <div className="flex gap-2">
                  {!isPrimary && (
                    <Button size="sm" variant="outline" onClick={() => handleSetPrimary(org.id)} disabled={setPrimary.isPending}>
                      Set as primary
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" className="text-destructive" onClick={() => attemptRemoval(org)}>
                    Remove
                  </Button>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Sub-groups</h2>
        {group.subGroups.length === 0 && (
          <p className="text-sm text-muted-foreground py-4">No sub-groups.</p>
        )}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {group.subGroups.map((sg) => (
            <Link key={sg.id} to={`/admin/groups/${sg.id}`} className="rounded-xl border bg-card p-4 hover:bg-accent transition-colors">
              <p className="font-medium">{sg.name}</p>
              <p className="text-xs text-muted-foreground">Sub-group</p>
            </Link>
          ))}
        </div>
      </div>

      <Dialog open={!!removalTarget} onOpenChange={(o) => { if (!o) { setRemovalTarget(null); setSuccessorCandidates(null) } }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Choose a successor primary organization</DialogTitle></DialogHeader>
          <DialogBody className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {removalTarget?.name} is this group's current primary organization. Choose which remaining organization
              should become primary before it can be removed.
            </p>
            <Select value={successorChoice} onValueChange={setSuccessorChoice}>
              <SelectTrigger><SelectValue placeholder="Select successor organization" /></SelectTrigger>
              <SelectContent>
                {(successorCandidates ?? []).map((id) => {
                  const org = group.memberOrgs.find((o) => o.id === id)
                  return <SelectItem key={id} value={id}>{org?.name ?? id}</SelectItem>
                })}
              </SelectContent>
            </Select>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setRemovalTarget(null); setSuccessorCandidates(null) }}>Cancel</Button>
            <Button
              disabled={!successorChoice || removeOrg.isPending}
              onClick={() => removalTarget && attemptRemoval(removalTarget, successorChoice)}
            >
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {actingOrgId && (
        <VendorOnboardDialog
          open={onboarding}
          onOpenChange={setOnboarding}
          actingOrgId={actingOrgId}
          groupId={groupId}
          groupName={group.name}
        />
      )}
      {actingOrgId && groupId && (
        <InviteVendorLinkDialog
          open={invitingLink}
          onOpenChange={setInvitingLink}
          target={{ scope: "group", groupId }}
          targetName={group.name}
        />
      )}
    </AnimatedPage>
  )
}
