import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { api } from "@/lib/api"
import { useAuth } from "@/contexts/AuthContext"
import type { OrgOnboardingDraft } from "@/lib/types"
import type { EffectiveOrgStatus } from "@/lib/constants"

export interface PlatformOrganization {
  id: string
  name: string
  slug: string
  status: "active" | "suspended" | "archived"
  org_code: string | null
  role_mode: "solo" | "tiered"
  created_at: string
  organization_members: { count: number }[]
  organization_vendors: { count: number }[]
  effectiveStatus: EffectiveOrgStatus
}

export interface PlatformOrgMember {
  id: string
  status: string
  isPrimary: boolean
  profile: { id: string; full_name: string | null; email: string } | null
  roleNames: string[]
}

export interface PlatformOrgVendor {
  id: string
  companyName: string
  contactName: string | null
  contactEmail: string | null
  status: string
}

export interface PlatformOrgDetail {
  organization: PlatformOrganization
  members: PlatformOrgMember[]
  vendors: PlatformOrgVendor[]
  onboardingDraft: OrgOnboardingDraft | null
}

export function usePlatformAdminStatus() {
  const { user, accessToken } = useAuth()
  return useQuery({
    queryKey: ["platform-admin-whoami", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await api.post<{ data: { isPlatformAdmin: boolean } }>(
        "/api/superadmin/whoami", {}, accessToken
      )
      return data.isPlatformAdmin
    },
  })
}

// Same endpoint as above, but also surfaces org membership -- used right
// after login to decide whether a platform admin with no org of their own
// should land on the superadmin console instead of the (otherwise-empty)
// admin dashboard.
export async function fetchWhoami(accessToken: string | null) {
  const { data } = await api.post<{ data: { isPlatformAdmin: boolean; hasOrgMembership: boolean } }>(
    "/api/superadmin/whoami", {}, accessToken
  )
  return data
}

export function usePlatformOrganizations() {
  const { accessToken } = useAuth()
  return useQuery({
    queryKey: ["platform-organizations"],
    queryFn: async () => {
      const { data } = await api.post<{ data: PlatformOrganization[] }>(
        "/api/superadmin/organizations/list", {}, accessToken
      )
      return data
    },
  })
}

export function usePlatformOrganizationDetail(orgId: string | null) {
  const { accessToken } = useAuth()
  return useQuery({
    queryKey: ["platform-organization-detail", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data } = await api.post<{ data: PlatformOrgDetail }>(
        "/api/superadmin/organizations/detail", { org_id: orgId }, accessToken
      )
      return data
    },
  })
}

export interface CreateOrganizationWithAdminResult {
  organization: PlatformOrganization
  adminEmail: string
  inviteSent: boolean
}

export function useCreateOrganizationWithAdmin() {
  const qc = useQueryClient()
  const { accessToken } = useAuth()
  return useMutation({
    mutationFn: async (input: { orgName: string; orgCode: string; adminEmail: string; adminName: string }) => {
      const { data } = await api.post<{ data: CreateOrganizationWithAdminResult }>(
        "/api/superadmin/organizations/create-with-admin", input, accessToken
      )
      return data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["platform-organizations"] }),
  })
}

export function useUpdateOrganizationStatus() {
  const qc = useQueryClient()
  const { accessToken } = useAuth()
  return useMutation({
    mutationFn: async (input: { id: string; status: "active" | "suspended" | "archived"; reason?: string }) => {
      const { data } = await api.post<{ data: PlatformOrganization }>(
        "/api/superadmin/organizations/update-status", input, accessToken
      )
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["platform-organizations"] })
      qc.invalidateQueries({ queryKey: ["platform-organization-detail"] })
    },
  })
}
