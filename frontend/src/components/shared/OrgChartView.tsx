import { Link } from "react-router-dom"
import { Badge } from "@/components/ui/badge"
import { SolarDuotoneIcon, InformationCircleIcon } from "@/components/shared/SolarIcon"
import type { OrgMember } from "@/hooks/useOrgMembers"

const STATUS_COLORS: Record<string, string> = {
  active: "bg-green-100 text-green-800 border-green-200",
  invited: "bg-blue-100 text-blue-800 border-blue-200",
  suspended: "bg-orange-100 text-orange-800 border-orange-200",
}

interface ChartNode extends OrgMember {
  children: ChartNode[]
  // True when this node's link to its parent is a display fallback (role
  // seniority), not a real reports_to relationship -- see buildForest.
  implicitParent: boolean
}

// Members with no manager (or whose manager fell outside this set, e.g. a
// dangling reference) are chart roots -- `visited` guards against a cycle
// that could in principle exist from data predating the no-cycle check in
// orgMembers.ts's /set-manager, so a bad row can't hang the page in an
// infinite loop.
function buildForest(members: OrgMember[]): { roots: ChartNode[]; hasImplicitNesting: boolean } {
  const byId = new Map<string, ChartNode>(members.map((m) => [m.id, { ...m, children: [], implicitParent: false }]))
  const roots: ChartNode[] = []
  const visited = new Set<string>()

  for (const member of members) {
    const node = byId.get(member.id)!
    if (visited.has(member.id)) continue
    const parent = member.reportsTo ? byId.get(member.reportsTo) : undefined
    if (parent && parent.id !== member.id) {
      parent.children.push(node)
    } else {
      roots.push(node)
    }
    visited.add(member.id)
  }

  // Admin outranks Manager/Finance/Associate even when nobody's set an
  // explicit reporting line yet -- among the roots (members nobody assigned
  // as their own manager), nest every non-Admin root under the org's
  // primary Admin so the chart reflects real seniority instead of one flat
  // row. Purely a display fallback (dashed connector, see OrgChartNode) --
  // doesn't touch reports_to, and only ever nests non-Admin roots; a second
  // Admin root stays its own top-level box rather than being nested under
  // the first.
  const adminRoots = roots.filter((r) => r.roleNames.includes("Admin"))
  const nonAdminRoots = roots.filter((r) => !r.roleNames.includes("Admin"))
  if (adminRoots.length > 0 && nonAdminRoots.length > 0) {
    const topAdmin = adminRoots.find((r) => r.isPrimary) ?? adminRoots[0]
    for (const r of nonAdminRoots) {
      r.implicitParent = true
      topAdmin.children.push(r)
    }
    return { roots: adminRoots, hasImplicitNesting: true }
  }
  return { roots, hasImplicitNesting: false }
}

function MemberCard({ member }: { member: OrgMember }) {
  return (
    <Link
      to={`/admin/team/${member.id}`}
      className="flex flex-col items-center gap-1 rounded-xl border bg-card px-4 py-2.5 min-w-40 text-center shadow-sm hover:border-primary/50 transition-colors"
    >
      <p className="text-sm font-medium leading-tight">
        {member.profile?.full_name ?? "—"}
        {member.isPrimary && <Badge className="ml-1.5 h-4 px-1 text-[9px] align-middle">You</Badge>}
      </p>
      <p className="text-[11px] text-muted-foreground">{member.roleNames.join(", ") || "—"}</p>
      <Badge variant="outline" className={`h-4 px-1.5 text-[9px] ${STATUS_COLORS[member.status]}`}>{member.status}</Badge>
    </Link>
  )
}

function OrgChartNode({ node }: { node: ChartNode }) {
  return (
    <div className="flex flex-col items-center">
      <MemberCard member={node} />
      {node.children.length > 0 && (
        <>
          <div className="w-px h-5 bg-border" />
          <div className="flex items-start">
            {node.children.map((child, idx) => {
              // Dashed for a fallback (role-seniority) link, solid for a
              // real reports_to -- see buildForest's implicitParent.
              const lineClass = child.implicitParent
                ? "border-l border-dashed border-border"
                : "bg-border"
              return (
                <div key={child.id} className="flex flex-col items-center px-3 relative">
                  {/* Horizontal connector across siblings, only the segment
                      between this child's own stem and its neighbor's --
                      first child skips its left half, last skips its right
                      half, so the line only spans between children. */}
                  <div className="absolute top-0 left-0 right-0 h-px">
                    {idx !== 0 && (
                      <div className={`absolute left-0 top-0 w-1/2 h-px ${child.implicitParent ? "border-t border-dashed border-border" : "bg-border"}`} />
                    )}
                    {idx !== node.children.length - 1 && (
                      <div className={`absolute right-0 top-0 w-1/2 h-px ${child.implicitParent ? "border-t border-dashed border-border" : "bg-border"}`} />
                    )}
                  </div>
                  <div className={`w-px h-5 ${lineClass}`} />
                  <OrgChartNode node={child} />
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}

export function OrgChartView({ members }: { members: OrgMember[] }) {
  const { roots, hasImplicitNesting } = buildForest(members)

  if (roots.length === 0) {
    return <p className="text-sm text-muted-foreground text-center py-12">No members yet.</p>
  }

  return (
    <div>
      {hasImplicitNesting && (
        <div className="flex items-start gap-2 mx-4 mt-4 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2.5 text-sm text-blue-800 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-200">
          <SolarDuotoneIcon icon={InformationCircleIcon} size={15} strokeWidth={1.5} className="shrink-0 mt-0.5" />
          <span>
            Dashed lines are a default by role seniority (Admin above Manager/Finance/Associate), not a set reporting line.
            Open a member's profile and use "Reports To" to make it real.
          </span>
        </div>
      )}
      <div className="overflow-x-auto py-6">
        <div className="flex items-start justify-center gap-10 w-fit mx-auto min-w-full">
          {roots.map((root) => <OrgChartNode key={root.id} node={root} />)}
        </div>
      </div>
    </div>
  )
}
