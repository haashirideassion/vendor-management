import { createContext, useContext, useEffect, useState } from "react"
import { useAuth } from "@/contexts/AuthContext"
import { api, setActiveOrgId } from "@/lib/api"

export interface OrgMembership {
  id: string
  name: string
  slug: string
  orgCode: string | null
  access: "member" | "group_admin"
  isLocalMember: boolean
  isPrimary: boolean
  roleNames: string[]
  permissions: string[]
  roleMode: "tiered" | "solo"
  approvalThreshold: number
  /** True for a self-registered org whose onboarding submission isn't
   *  approved yet -- every module except Org Onboarding/Profile is off-limits. */
  modulesLocked: boolean
  /** True once the org's onboarding draft has been submitted at least once
   *  (status 'submitted' or 'approved') -- flips the permanent nav entry
   *  from Org Onboarding to Profile, not just during the locked window. */
  onboardingSubmitted: boolean
  /** False for orgs that never go through self-service onboarding at all
   *  (e.g. superadmin-created) -- these show Profile only, never an Org
   *  Onboarding nav entry, regardless of onboardingSubmitted. */
  requiresOnboardingApproval: boolean
}

export type PrimaryResolution =
  | { kind: "neutral" }
  | { kind: "primary"; orgId: string }
  | { kind: "dangling"; configuredOrgId: string }
  | { kind: "no_memberships" }

export interface GroupSummary {
  id: string
  name: string
  parentGroupId: string | null
  primaryResolution: PrimaryResolution
}

interface OrgContextValue {
  orgs: OrgMembership[]
  groups: GroupSummary[]
  activeOrg: OrgMembership | null
  setActiveOrg: (orgId: string) => void
  loading: boolean
}

const OrgContext = createContext<OrgContextValue | null>(null)

const STORAGE_KEY = "cognivend.activeOrgId"

export function OrgProvider({ children }: { children: React.ReactNode }) {
  const { accessToken, isInternalUser } = useAuth()
  const [orgs, setOrgs] = useState<OrgMembership[]>([])
  const [groups, setGroups] = useState<GroupSummary[]>([])
  const [activeOrgId, setActiveOrgIdState] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!accessToken || !isInternalUser) {
      setOrgs([])
      setGroups([])
      setActiveOrgIdState(null)
      setActiveOrgId(null)
      setLoading(false)
      return
    }

    let cancelled = false
    setLoading(true)
    api.post<{ data: { orgs: OrgMembership[]; groups: GroupSummary[] } }>("/api/access/context", {}, accessToken)
      .then(({ data }) => {
        if (cancelled) return
        setOrgs(data.orgs)
        setGroups(data.groups)

        // Never auto-pick across groups (Phase 4.5) -- this fallback chain
        // only ever picks among the user's own orgs (direct membership
        // first via is_primary, since that's this specific concept's whole
        // purpose; group_admin-reached orgs are never auto-selected, since
        // acting in one should be a deliberate choice, not a default).
        const stored = localStorage.getItem(STORAGE_KEY)
        const initial =
          data.orgs.find((o) => o.id === stored) ??
          data.orgs.find((o) => o.isLocalMember && o.isPrimary) ??
          data.orgs.find((o) => o.isLocalMember) ??
          null

        if (initial) {
          setActiveOrgIdState(initial.id)
          setActiveOrgId(initial.id)
          localStorage.setItem(STORAGE_KEY, initial.id)
        } else {
          setActiveOrgIdState(null)
          setActiveOrgId(null)
        }
      })
      .catch(() => { if (!cancelled) { setOrgs([]); setGroups([]) } })
      .finally(() => { if (!cancelled) setLoading(false) })

    return () => { cancelled = true }
  }, [accessToken, isInternalUser])

  function setActiveOrg(orgId: string) {
    setActiveOrgIdState(orgId)
    setActiveOrgId(orgId)
    localStorage.setItem(STORAGE_KEY, orgId)
  }

  const activeOrg = orgs.find((o) => o.id === activeOrgId) ?? null

  return (
    <OrgContext.Provider value={{ orgs, groups, activeOrg, setActiveOrg, loading }}>
      {children}
    </OrgContext.Provider>
  )
}

export function useOrg() {
  const ctx = useContext(OrgContext)
  if (!ctx) throw new Error("useOrg must be used within OrgProvider")
  return ctx
}
