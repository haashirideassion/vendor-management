import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { api } from "@/lib/api"
import { useAuth } from "@/contexts/AuthContext"

/**
 * Whether the CALLER (not an arbitrary vendorUserId) has any explicit
 * client-org assignment rows -- if so, they're a restricted Associate per
 * the precedence rule (any assignment rows at all -> restricted to exactly
 * those orgs, regardless of role). Informational only today -- drives the
 * "showing your assigned clients only" note on the vendor dashboard, not
 * (yet) an actual filter on the dashboard's own purchase request/contract/invoice
 * queries, which would need those list endpoints to accept a client-org
 * allow-list filter.
 */
export function useMyVendorAssignmentStatus() {
  const { user, accessToken } = useAuth()
  return useQuery({
    queryKey: ["my-vendor-assignment-status", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await api.post<{ data: string[] }>(
        "/api/vendor-users/assignments/list", { userId: user!.id }, accessToken
      )
      return { isRestricted: data.length > 0, assignedOrgIds: data }
    },
  })
}

/**
 * The CALLER's own resolved vendor-scope permission keys + role names,
 * mirroring the org-side usePermissions() pattern -- lets vendor screens
 * gate actions (e.g. quotation approve/return) on permission keys instead
 * of hardcoded role-name string checks. Shared underlying query so
 * useMyVendorPermissions/useMyVendorRole together only fire one request.
 */
function useMyVendorAccess() {
  const { user, accessToken } = useAuth()
  return useQuery({
    queryKey: ["my-vendor-access", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await api.post<{ data: { permissions: string[]; roleNames: string[] } }>(
        "/api/vendor-users/my-permissions", {}, accessToken
      )
      return data
    },
  })
}

export function useMyVendorPermissions() {
  const query = useMyVendorAccess()
  return { ...query, data: query.data?.permissions }
}

/** The real vendor-scope bundle name(s) (e.g. ["Admin"]) for UI display,
 *  instead of the generic legacy profiles.role "Vendor" bucket. */
export function useMyVendorRole() {
  const query = useMyVendorAccess()
  return { ...query, data: query.data?.roleNames }
}

export interface VendorUserProfile { id: string; full_name: string; email: string }
export interface VendorTeam { id: string; name: string; description: string | null }
export interface VendorTeamAssignment { teamId: string; teamName: string; roleId: string; roleName: string }
export interface TeamRoleAssignment { teamId: string | null; roleId: string }
export interface VendorUser {
  id: string
  status: "invited" | "active" | "suspended"
  isPrimary: boolean
  createdAt: string
  profile: VendorUserProfile
  roleNames: string[]
  // New Team+Role model, shown alongside the legacy roleNames above while
  // the two systems coexist -- see teamAssignment.service.ts.
  teamAssignments: VendorTeamAssignment[]
  directRoleNames: string[]
}
export interface OrgScopedVendorUser extends VendorUser {
  // "all" -- Admin/Manager/Finance, unrestricted across every client org.
  // "assigned" -- an Associate explicitly given access to this org via the
  // vendor's own "Client Access" picker.
  accessScope: "all" | "assigned"
}
export interface VendorClientOrg { id: string; name: string; slug: string; status: string }
export interface AssignableVendorRole { id: string; name: string; description: string | null; is_system?: boolean }

export function useVendorUsers() {
  const { user, accessToken } = useAuth()
  return useQuery({
    queryKey: ["vendor-users", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await api.post<{ data: VendorUser[] }>("/api/vendor-users/list", {}, accessToken)
      return data
    },
  })
}

// Org-side: which of a given vendor's staff can see/act on THIS org
// (X-Org-Id, attached by api.post automatically) -- read-only, for the org
// admin's Vendor Detail page.
export function useOrgScopedVendorUsers(vendorId: string | undefined) {
  const { accessToken } = useAuth()
  return useQuery({
    queryKey: ["org-scoped-vendor-users", vendorId],
    enabled: !!vendorId,
    queryFn: async () => {
      const { data } = await api.post<{ data: OrgScopedVendorUser[] }>(
        "/api/vendor-users/org-list", { vendor_id: vendorId }, accessToken
      )
      return data
    },
  })
}

export function useVendorClientOrgs() {
  const { user, accessToken } = useAuth()
  return useQuery({
    queryKey: ["vendor-client-orgs", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await api.post<{ data: VendorClientOrg[] }>("/api/vendor-users/client-orgs", {}, accessToken)
      return data
    },
  })
}

export function useAssignableVendorRoles() {
  const { user, accessToken } = useAuth()
  return useQuery({
    queryKey: ["vendor-assignable-roles", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await api.post<{ data: { roles: AssignableVendorRole[] } }>(
        "/api/vendor-users/assignable-roles", {}, accessToken
      )
      return data
    },
  })
}

export function useVendorUserAssignments(userId: string | undefined) {
  const { accessToken } = useAuth()
  return useQuery({
    queryKey: ["vendor-user-assignments", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data } = await api.post<{ data: string[] }>("/api/vendor-users/assignments/list", { userId }, accessToken)
      return data
    },
  })
}

export function useVendorTeams() {
  const { user, accessToken } = useAuth()
  return useQuery({
    queryKey: ["vendor-teams", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await api.post<{ data: VendorTeam[] }>("/api/vendor-users/teams/list", {}, accessToken)
      return data
    },
  })
}

export function useCreateVendorTeam() {
  const qc = useQueryClient()
  const { accessToken } = useAuth()
  return useMutation({
    mutationFn: async (input: { name: string; description?: string }) => {
      const { data } = await api.post<{ data: VendorTeam }>("/api/vendor-users/teams/create", input, accessToken)
      return data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["vendor-teams"] }),
  })
}

export function useInviteVendorUser() {
  const qc = useQueryClient()
  const { accessToken } = useAuth()
  return useMutation({
    mutationFn: async (input: { email: string; fullName: string; roleIds: string[]; assignments?: TeamRoleAssignment[] }) => {
      const { data } = await api.post<{ data: { vendorUserId: string; email: string; inviteSent: boolean } }>(
        "/api/vendor-users/invite", input, accessToken
      )
      return data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["vendor-users"] }),
  })
}

export function useUpdateVendorUserRoles() {
  const qc = useQueryClient()
  const { accessToken } = useAuth()
  return useMutation({
    mutationFn: async (input: { vendorUserId: string; roleIds: string[]; assignments?: TeamRoleAssignment[] }) => {
      const { data } = await api.post<{ data: unknown }>("/api/vendor-users/update-roles", input, accessToken)
      return data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["vendor-users"] }),
  })
}

export function useSetVendorUserAssignments() {
  const qc = useQueryClient()
  const { accessToken } = useAuth()
  return useMutation({
    mutationFn: async (input: { userId: string; organizationIds: string[] }) => {
      const { data } = await api.post<{ data: unknown }>("/api/vendor-users/assignments/set", input, accessToken)
      return data
    },
    onSuccess: (_data, variables) => qc.invalidateQueries({ queryKey: ["vendor-user-assignments", variables.userId] }),
  })
}

export interface AssignablePermission { id: string; key: string; module: string; action: string; description: string | null }
export interface DelegatedRole { role: { id: string; name: string }; valid_from: string | null; valid_until: string | null }

export function useVendorUserDelegations(vendorUserId: string | undefined) {
  const { accessToken } = useAuth()
  return useQuery({
    queryKey: ["vendor-user-delegations", vendorUserId],
    enabled: !!vendorUserId,
    queryFn: async () => {
      const { data } = await api.post<{ data: DelegatedRole[] }>("/api/vendor-users/roles/delegations-list", { vendorUserId }, accessToken)
      return data
    },
  })
}

export function useDelegateVendorRole() {
  const qc = useQueryClient()
  const { accessToken } = useAuth()
  return useMutation({
    mutationFn: async (input: { vendorUserId: string; roleId: string; validUntil: string; reason?: string }) => {
      const { data } = await api.post<{ data: unknown }>("/api/vendor-users/roles/delegate", input, accessToken)
      return data
    },
    onSuccess: (_data, variables) => qc.invalidateQueries({ queryKey: ["vendor-user-delegations", variables.vendorUserId] }),
  })
}

export function useRevokeVendorRoleDelegation() {
  const qc = useQueryClient()
  const { accessToken } = useAuth()
  return useMutation({
    mutationFn: async (input: { vendorUserId: string; roleId: string }) => {
      const { data } = await api.post<{ data: unknown }>("/api/vendor-users/roles/revoke-delegation", input, accessToken)
      return data
    },
    onSuccess: (_data, variables) => qc.invalidateQueries({ queryKey: ["vendor-user-delegations", variables.vendorUserId] }),
  })
}

export function useVendorAssignablePermissions() {
  const { user, accessToken } = useAuth()
  return useQuery({
    queryKey: ["vendor-assignable-permissions", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await api.post<{ data: AssignablePermission[] }>("/api/vendor-users/roles/assignable-permissions", {}, accessToken)
      return data
    },
  })
}

export function useCreateCustomVendorRole() {
  const qc = useQueryClient()
  const { accessToken } = useAuth()
  return useMutation({
    mutationFn: async (input: { name: string; description?: string; permissionIds: string[] }) => {
      const { data } = await api.post<{ data: AssignableVendorRole }>("/api/vendor-users/roles/create-custom", input, accessToken)
      return data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["vendor-assignable-roles"] }),
  })
}

export function useDeleteCustomVendorRole() {
  const qc = useQueryClient()
  const { accessToken } = useAuth()
  return useMutation({
    mutationFn: async (input: { roleId: string }) => {
      const { data } = await api.post<{ data: unknown }>("/api/vendor-users/roles/delete-custom", input, accessToken)
      return data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["vendor-assignable-roles"] }),
  })
}

function useVendorUserLifecycleAction(path: string) {
  const qc = useQueryClient()
  const { accessToken } = useAuth()
  return useMutation({
    mutationFn: async (input: { vendorUserId: string }) => {
      const { data } = await api.post<{ data: unknown }>(`/api/vendor-users/${path}`, input, accessToken)
      return data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["vendor-users"] }),
  })
}

export function useSuspendVendorUser() { return useVendorUserLifecycleAction("suspend") }
export function useReinstateVendorUser() { return useVendorUserLifecycleAction("reinstate") }
export function useRevokeVendorUserInvite() { return useVendorUserLifecycleAction("revoke") }

export interface EffectivePermission { id: string; key: string; module: string; action: string; description: string | null }
export interface PermissionRestriction { id: string; permission_id: string; reason: string | null; set_by: string | null; set_at: string | null }

export function useVendorUserRestrictions(vendorUserId: string | undefined) {
  const { accessToken } = useAuth()
  return useQuery({
    queryKey: ["vendor-user-restrictions", vendorUserId],
    enabled: !!vendorUserId,
    queryFn: async () => {
      const { data } = await api.post<{ data: { effectivePermissions: EffectivePermission[]; restrictions: PermissionRestriction[] } }>(
        "/api/vendor-users/restrictions/list", { vendorUserId }, accessToken
      )
      return data
    },
  })
}

export function useSetVendorUserRestriction() {
  const qc = useQueryClient()
  const { accessToken } = useAuth()
  return useMutation({
    mutationFn: async (input: { vendorUserId: string; permissionId: string; restricted: boolean; reason?: string }) => {
      const { data } = await api.post<{ data: unknown }>("/api/vendor-users/restrictions/set", input, accessToken)
      return data
    },
    onSuccess: (_data, variables) => qc.invalidateQueries({ queryKey: ["vendor-user-restrictions", variables.vendorUserId] }),
  })
}
export function useResendVendorUserInvite() { return useVendorUserLifecycleAction("resend") }
