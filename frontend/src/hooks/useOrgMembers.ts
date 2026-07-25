import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { api } from "@/lib/api"
import { useAuth } from "@/contexts/AuthContext"
import { useOrg } from "@/contexts/OrgContext"

export interface OrgMemberProfile { id: string; full_name: string; email: string }
export interface OrgMember {
  id: string
  status: "invited" | "active" | "suspended"
  isPrimary: boolean
  profile: OrgMemberProfile
  roleNames: string[]
}
export interface AssignableRole { id: string; name: string; description: string | null }

export function useOrgMembers() {
  const { accessToken } = useAuth()
  const { activeOrg } = useOrg()
  return useQuery({
    queryKey: ["org-members", activeOrg?.id],
    enabled: !!activeOrg,
    queryFn: async () => {
      const { data } = await api.post<{ data: OrgMember[] }>("/api/org-members/list", {}, accessToken)
      return data
    },
  })
}

export function useAssignableOrgRoles() {
  const { accessToken } = useAuth()
  const { activeOrg } = useOrg()
  return useQuery({
    queryKey: ["org-assignable-roles", activeOrg?.id],
    enabled: !!activeOrg,
    queryFn: async () => {
      const { data } = await api.post<{ data: { roleMode: "tiered" | "solo"; roles: AssignableRole[] } }>(
        "/api/org-members/assignable-roles", {}, accessToken
      )
      return data
    },
  })
}

export function useInviteOrgMember() {
  const qc = useQueryClient()
  const { accessToken } = useAuth()
  const { activeOrg } = useOrg()
  return useMutation({
    mutationFn: async (input: { email: string; fullName: string; roleIds: string[] }) => {
      const { data } = await api.post<{ data: { memberId: string; email: string; inviteSent: boolean } }>(
        "/api/org-members/invite", input, accessToken
      )
      return data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["org-members", activeOrg?.id] }),
  })
}

export function useUpdateOrgMemberRoles() {
  const qc = useQueryClient()
  const { accessToken } = useAuth()
  const { activeOrg } = useOrg()
  return useMutation({
    mutationFn: async (input: { memberId: string; roleIds: string[] }) => {
      const { data } = await api.post<{ data: unknown }>("/api/org-members/update-roles", input, accessToken)
      return data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["org-members", activeOrg?.id] }),
  })
}
