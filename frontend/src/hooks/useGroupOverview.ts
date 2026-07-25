import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { api } from "@/lib/api"
import { useAuth } from "@/contexts/AuthContext"

export interface GroupOverviewOrg {
  id: string
  name: string
  slug: string
  status: string
}

export interface GroupOverview {
  id: string
  name: string
  parentGroupId: string | null
  primaryOrgId: string | null
  status: string
  ancestors: { id: string; name: string }[]
  memberOrgs: GroupOverviewOrg[]
  subGroups: { id: string; name: string; status: string }[]
}

export function useGroupOverview(groupId: string | undefined) {
  const { accessToken } = useAuth()
  return useQuery({
    queryKey: ["group-overview", groupId],
    enabled: !!groupId,
    queryFn: async () => {
      const { data } = await api.post<{ data: GroupOverview }>("/api/groups/overview", { groupId }, accessToken)
      return data
    },
  })
}

export function useSetGroupPrimary(groupId: string | undefined) {
  const qc = useQueryClient()
  const { accessToken } = useAuth()
  return useMutation({
    mutationFn: async (organizationId: string) => {
      const { data } = await api.post<{ data: unknown }>(
        "/api/groups/set-primary", { groupId, organizationId }, accessToken
      )
      return data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["group-overview", groupId] }),
  })
}

export function useRemoveOrgFromGroup(groupId: string | undefined) {
  const qc = useQueryClient()
  const { accessToken } = useAuth()
  return useMutation({
    mutationFn: async (input: { organizationId: string; successorOrgId?: string }) => {
      const { data } = await api.post<{ data: unknown }>(
        "/api/groups/remove-org", { groupId, ...input }, accessToken
      )
      return data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["group-overview", groupId] }),
  })
}
