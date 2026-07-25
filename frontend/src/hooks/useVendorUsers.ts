import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { api } from "@/lib/api"
import { useAuth } from "@/contexts/AuthContext"

/**
 * Whether the CALLER (not an arbitrary vendorUserId) has any explicit
 * client-org assignment rows -- if so, they're a restricted Associate per
 * the precedence rule (any assignment rows at all -> restricted to exactly
 * those orgs, regardless of role). Informational only today -- drives the
 * "showing your assigned clients only" note on the vendor dashboard, not
 * (yet) an actual filter on the dashboard's own engagement/contract/invoice
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
export interface VendorUser {
  id: string
  status: "invited" | "active" | "suspended"
  isPrimary: boolean
  profile: VendorUserProfile
  roleNames: string[]
}
export interface VendorClientOrg { id: string; name: string; slug: string; status: string }
export interface AssignableVendorRole { id: string; name: string; description: string | null }

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

export function useInviteVendorUser() {
  const qc = useQueryClient()
  const { accessToken } = useAuth()
  return useMutation({
    mutationFn: async (input: { email: string; fullName: string; roleIds: string[] }) => {
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
    mutationFn: async (input: { vendorUserId: string; roleIds: string[] }) => {
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
