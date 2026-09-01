import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { api } from "@/lib/api"
import { useAuth } from "@/contexts/AuthContext"
import { useOrg } from "@/contexts/OrgContext"
import type { MatchToleranceSettings, MatchToleranceType, ContractApprovalThresholds } from "@/lib/types"

export interface OrgMemberProfile { id: string; full_name: string; email: string }
export interface OrgTeam { id: string; name: string; description: string | null }
export interface OrgTeamAssignment { teamId: string; teamName: string; roleId: string; roleName: string }
export interface TeamRoleAssignment { teamId: string | null; roleId: string }
export interface OrgMember {
  id: string
  status: "invited" | "active" | "suspended"
  isPrimary: boolean
  createdAt: string
  profile: OrgMemberProfile
  roleNames: string[]
  // New Team+Role model, shown alongside the legacy roleNames above while
  // the two systems coexist -- see teamAssignment.service.ts.
  teamAssignments: OrgTeamAssignment[]
  directRoleNames: string[]
  // Org Chart support (migration 092) -- id of the member's manager, or
  // null if they have none (a chart root).
  reportsTo: string | null
}
export interface AssignableRole { id: string; name: string; description: string | null; is_system?: boolean }

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

export function useOrgTeams() {
  const { accessToken } = useAuth()
  const { activeOrg } = useOrg()
  return useQuery({
    queryKey: ["org-teams", activeOrg?.id],
    enabled: !!activeOrg,
    queryFn: async () => {
      const { data } = await api.post<{ data: OrgTeam[] }>("/api/org-members/teams/list", {}, accessToken)
      return data
    },
  })
}

export function useCreateOrgTeam() {
  const qc = useQueryClient()
  const { accessToken } = useAuth()
  const { activeOrg } = useOrg()
  return useMutation({
    mutationFn: async (input: { name: string; description?: string }) => {
      const { data } = await api.post<{ data: OrgTeam }>("/api/org-members/teams/create", input, accessToken)
      return data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["org-teams", activeOrg?.id] }),
  })
}

export function useInviteOrgMember() {
  const qc = useQueryClient()
  const { accessToken } = useAuth()
  const { activeOrg } = useOrg()
  return useMutation({
    mutationFn: async (input: { email: string; fullName: string; roleIds: string[]; assignments?: TeamRoleAssignment[]; reportsTo?: string | null }) => {
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
    mutationFn: async (input: { memberId: string; roleIds: string[]; assignments?: TeamRoleAssignment[] }) => {
      const { data } = await api.post<{ data: unknown }>("/api/org-members/update-roles", input, accessToken)
      return data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["org-members", activeOrg?.id] }),
  })
}

export function useSetOrgMemberManager() {
  const qc = useQueryClient()
  const { accessToken } = useAuth()
  const { activeOrg } = useOrg()
  return useMutation({
    mutationFn: async (input: { memberId: string; reportsTo: string | null }) => {
      const { data } = await api.post<{ data: unknown }>("/api/org-members/set-manager", input, accessToken)
      return data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["org-members", activeOrg?.id] }),
  })
}

function useOrgMemberLifecycleAction(path: string) {
  const qc = useQueryClient()
  const { accessToken } = useAuth()
  const { activeOrg } = useOrg()
  return useMutation({
    mutationFn: async (input: { memberId: string }) => {
      const { data } = await api.post<{ data: unknown }>(`/api/org-members/${path}`, input, accessToken)
      return data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["org-members", activeOrg?.id] }),
  })
}

export function useSuspendOrgMember() { return useOrgMemberLifecycleAction("suspend") }
export function useReinstateOrgMember() { return useOrgMemberLifecycleAction("reinstate") }
export function useRevokeOrgMemberInvite() { return useOrgMemberLifecycleAction("revoke") }

export interface EffectivePermission { id: string; key: string; module: string; action: string; description: string | null }
export interface PermissionRestriction { id: string; permission_id: string; reason: string | null; set_by: string | null; set_at: string | null }

export function useOrgMemberRestrictions(memberId: string | undefined) {
  const { accessToken } = useAuth()
  return useQuery({
    queryKey: ["org-member-restrictions", memberId],
    enabled: !!memberId,
    queryFn: async () => {
      const { data } = await api.post<{ data: { effectivePermissions: EffectivePermission[]; restrictions: PermissionRestriction[] } }>(
        "/api/org-members/restrictions/list", { memberId }, accessToken
      )
      return data
    },
  })
}

export interface ApprovalPolicyRow { roleId: string; roleName: string; thresholdAmount: number | null; configured: boolean }

export function useApprovalPolicy() {
  const { accessToken } = useAuth()
  const { activeOrg } = useOrg()
  return useQuery({
    queryKey: ["approval-policy", activeOrg?.id],
    enabled: !!activeOrg,
    queryFn: async () => {
      const { data } = await api.post<{ data: ApprovalPolicyRow[] }>("/api/org-members/approval-policy/list", {}, accessToken)
      return data
    },
  })
}

export function useSetApprovalPolicy() {
  const qc = useQueryClient()
  const { accessToken } = useAuth()
  const { activeOrg } = useOrg()
  return useMutation({
    mutationFn: async (input: { roleId: string; thresholdAmount?: number | null; clear?: boolean }) => {
      const { data } = await api.post<{ data: unknown }>("/api/org-members/approval-policy/set", input, accessToken)
      return data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["approval-policy", activeOrg?.id] }),
  })
}

export function useMatchTolerance() {
  const { accessToken } = useAuth()
  const { activeOrg } = useOrg()
  return useQuery({
    queryKey: ["match-tolerance", activeOrg?.id],
    enabled: !!activeOrg,
    queryFn: async () => {
      const { data, configured } = await api.post<{ data: MatchToleranceSettings; configured: boolean }>(
        "/api/org-members/match-tolerance/get", {}, accessToken
      )
      return { ...data, configured }
    },
  })
}

export function useSetMatchTolerance() {
  const qc = useQueryClient()
  const { accessToken } = useAuth()
  const { activeOrg } = useOrg()
  return useMutation({
    mutationFn: async (input: { toleranceType: MatchToleranceType; toleranceValue: number }) => {
      const { data } = await api.post<{ data: MatchToleranceSettings }>(
        "/api/org-members/match-tolerance/set", input, accessToken
      )
      return data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["match-tolerance", activeOrg?.id] }),
  })
}

// CLM Phase 3 -- Stage 7's value-tier thresholds, same shape as match tolerance above.
export function useContractApprovalThresholds() {
  const { accessToken } = useAuth()
  const { activeOrg } = useOrg()
  return useQuery({
    queryKey: ["contract-approval-thresholds", activeOrg?.id],
    enabled: !!activeOrg,
    queryFn: async () => {
      const { data, configured } = await api.post<{ data: ContractApprovalThresholds; configured: boolean }>(
        "/api/org-members/contract-approval-thresholds/get", {}, accessToken
      )
      return { ...data, configured }
    },
  })
}

export function useSetContractApprovalThresholds() {
  const qc = useQueryClient()
  const { accessToken } = useAuth()
  const { activeOrg } = useOrg()
  return useMutation({
    mutationFn: async (input: { mediumThreshold: number; highThreshold: number }) => {
      const { data } = await api.post<{ data: ContractApprovalThresholds }>(
        "/api/org-members/contract-approval-thresholds/set", input, accessToken
      )
      return data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["contract-approval-thresholds", activeOrg?.id] }),
  })
}

// The org's base currency isn't fetched from its own endpoint -- it's
// already part of the OrgContext payload (/api/access/context) as
// activeOrg.baseCurrency. This mutation just changes it; OrgContext has no
// refetch mechanism of its own (it fetches once on auth change only), so a
// full reload is the simplest way to get every cached read of baseCurrency
// across the app consistent afterward -- acceptable for a setting this
// rarely touched.
export function useSetBaseCurrency() {
  const { accessToken } = useAuth()
  return useMutation({
    mutationFn: async (currency: string) => {
      const { data } = await api.post<{ data: { base_currency: string } }>(
        "/api/organizations/set-base-currency", { currency }, accessToken
      )
      return data
    },
  })
}

export interface LegalEntityOption { id: string; label: string }

export function useOrgLegalEntityScopeOptions() {
  const { accessToken } = useAuth()
  const { activeOrg } = useOrg()
  return useQuery({
    queryKey: ["org-legal-entity-scope-options", activeOrg?.id],
    enabled: !!activeOrg,
    queryFn: async () => {
      const { data } = await api.post<{ data: LegalEntityOption[] }>("/api/org-members/legal-entity-scope/options", {}, accessToken)
      return data
    },
  })
}

export function useOrgMemberLegalEntityScope(memberId: string | undefined) {
  const { accessToken } = useAuth()
  return useQuery({
    queryKey: ["org-member-legal-entity-scope", memberId],
    enabled: !!memberId,
    queryFn: async () => {
      const { data } = await api.post<{ data: string[] }>("/api/org-members/legal-entity-scope/list", { memberId }, accessToken)
      return data
    },
  })
}

export function useSetOrgMemberLegalEntityScope() {
  const qc = useQueryClient()
  const { accessToken } = useAuth()
  return useMutation({
    mutationFn: async (input: { memberId: string; legalEntityIds: string[] }) => {
      const { data } = await api.post<{ data: unknown }>("/api/org-members/legal-entity-scope/set", input, accessToken)
      return data
    },
    onSuccess: (_data, variables) => qc.invalidateQueries({ queryKey: ["org-member-legal-entity-scope", variables.memberId] }),
  })
}

export interface AssignablePermission { id: string; key: string; module: string; action: string; description: string | null }

export function useOrgAssignablePermissions() {
  const { accessToken } = useAuth()
  const { activeOrg } = useOrg()
  return useQuery({
    queryKey: ["org-assignable-permissions", activeOrg?.id],
    enabled: !!activeOrg,
    queryFn: async () => {
      const { data } = await api.post<{ data: AssignablePermission[] }>("/api/org-members/roles/assignable-permissions", {}, accessToken)
      return data
    },
  })
}

export function useCreateCustomOrgRole() {
  const qc = useQueryClient()
  const { accessToken } = useAuth()
  const { activeOrg } = useOrg()
  return useMutation({
    mutationFn: async (input: { name: string; description?: string; permissionIds: string[] }) => {
      const { data } = await api.post<{ data: AssignableRole }>("/api/org-members/roles/create-custom", input, accessToken)
      return data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["org-assignable-roles", activeOrg?.id] }),
  })
}

export function useDeleteCustomOrgRole() {
  const qc = useQueryClient()
  const { accessToken } = useAuth()
  const { activeOrg } = useOrg()
  return useMutation({
    mutationFn: async (input: { roleId: string }) => {
      const { data } = await api.post<{ data: unknown }>("/api/org-members/roles/delete-custom", input, accessToken)
      return data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["org-assignable-roles", activeOrg?.id] }),
  })
}

export interface DelegatedRole { role: { id: string; name: string }; valid_from: string | null; valid_until: string | null }

export function useOrgMemberDelegations(memberId: string | undefined) {
  const { accessToken } = useAuth()
  return useQuery({
    queryKey: ["org-member-delegations", memberId],
    enabled: !!memberId,
    queryFn: async () => {
      const { data } = await api.post<{ data: DelegatedRole[] }>("/api/org-members/roles/delegations-list", { memberId }, accessToken)
      return data
    },
  })
}

export function useDelegateOrgRole() {
  const qc = useQueryClient()
  const { accessToken } = useAuth()
  return useMutation({
    mutationFn: async (input: { memberId: string; roleId: string; validUntil: string; reason?: string }) => {
      const { data } = await api.post<{ data: unknown }>("/api/org-members/roles/delegate", input, accessToken)
      return data
    },
    onSuccess: (_data, variables) => qc.invalidateQueries({ queryKey: ["org-member-delegations", variables.memberId] }),
  })
}

export function useRevokeOrgRoleDelegation() {
  const qc = useQueryClient()
  const { accessToken } = useAuth()
  return useMutation({
    mutationFn: async (input: { memberId: string; roleId: string }) => {
      const { data } = await api.post<{ data: unknown }>("/api/org-members/roles/revoke-delegation", input, accessToken)
      return data
    },
    onSuccess: (_data, variables) => qc.invalidateQueries({ queryKey: ["org-member-delegations", variables.memberId] }),
  })
}

export function useSetOrgMemberRestriction() {
  const qc = useQueryClient()
  const { accessToken } = useAuth()
  return useMutation({
    mutationFn: async (input: { memberId: string; permissionId: string; restricted: boolean; reason?: string }) => {
      const { data } = await api.post<{ data: unknown }>("/api/org-members/restrictions/set", input, accessToken)
      return data
    },
    onSuccess: (_data, variables) => qc.invalidateQueries({ queryKey: ["org-member-restrictions", variables.memberId] }),
  })
}
export function useResendOrgMemberInvite() { return useOrgMemberLifecycleAction("resend") }
