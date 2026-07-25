import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { api } from "@/lib/api"
import { useAuth } from "@/contexts/AuthContext"

export interface PlatformGroupOrg { id: string; name: string; slug: string }
export interface PlatformGroupAdmin { id: string; full_name: string; email: string }
export interface PlatformGroup {
  id: string
  name: string
  parentGroupId: string | null
  primaryOrgId: string | null
  status: "active" | "archived" | "merged"
  createdAt: string
  memberOrgs: PlatformGroupOrg[]
  subGroups: { id: string; name: string }[]
  admins: PlatformGroupAdmin[]
}

const QUERY_KEY = ["platform-groups"]

export function usePlatformGroups() {
  const { accessToken } = useAuth()
  return useQuery({
    queryKey: QUERY_KEY,
    queryFn: async () => {
      const { data } = await api.post<{ data: PlatformGroup[] }>("/api/superadmin/groups/list", {}, accessToken)
      return data
    },
  })
}

// Exact-match lookup by Group Code -- vendor onboarding's Group Code field
// and org onboarding's is_group_company Group Code field both live-validate
// a typed code this way before it can be submitted.
export function useGroupCodeLookup(code: string) {
  const { accessToken } = useAuth()
  return useQuery({
    queryKey: ["group-lookup-code", code],
    enabled: code.trim().length >= 3,
    queryFn: async () => {
      const { data } = await api.post<{ data: { id: string; name: string } | null }>(
        "/api/groups/lookup-code", { code }, accessToken
      )
      return data
    },
  })
}

export function useGroupsHealth() {
  const { accessToken } = useAuth()
  return useQuery({
    queryKey: ["platform-groups-health"],
    queryFn: async () => {
      const { data } = await api.post<{ data: { id: string; name: string; parent_group_id: string | null }[] }>(
        "/api/superadmin/groups/health", {}, accessToken
      )
      return data
    },
  })
}

function useGroupMutation<TInput>(path: string) {
  const qc = useQueryClient()
  const { accessToken } = useAuth()
  return useMutation({
    mutationFn: async (input: TInput) => {
      const { data } = await api.post<{ data: unknown }>(path, input, accessToken)
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QUERY_KEY })
      qc.invalidateQueries({ queryKey: ["platform-groups-health"] })
    },
  })
}

export const useCreateGroup = () => useGroupMutation<{ name: string; parentGroupId?: string | null }>("/api/superadmin/groups/create")
export const useAddOrgToGroup = () => useGroupMutation<{ groupId: string; organizationId: string; relationshipType?: string }>("/api/superadmin/groups/add-org")
export const useSetGroupPrimary = () => useGroupMutation<{ groupId: string; organizationId: string | null }>("/api/superadmin/groups/set-primary")
export const useReparentGroup = () => useGroupMutation<{ groupId: string; newParentGroupId: string | null }>("/api/superadmin/groups/reparent")
export const useGrantGroupAdmin = () => useGroupMutation<{ groupId: string; email: string }>("/api/superadmin/groups/grant-admin")
export const useRevokeGroupAdmin = () => useGroupMutation<{ groupId: string; userId: string }>("/api/superadmin/groups/revoke-admin")
export const useMergeGroups = () => useGroupMutation<{ survivingGroupId: string; absorbedGroupId: string }>("/api/superadmin/groups/merge")
export const useRemoveOrgFromGroupSuperadmin = () => useGroupMutation<{ groupId: string; organizationId: string; successorOrgId?: string }>("/api/superadmin/groups/remove-org")
export const useDissolveGroup = () => useGroupMutation<{ groupId: string; plan?: unknown }>("/api/superadmin/groups/dissolve")
