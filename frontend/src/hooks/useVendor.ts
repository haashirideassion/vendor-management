import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { api } from "@/lib/api"
import { useAuth } from "@/contexts/AuthContext"
import type { Vendor, VendorWithDetails } from "@/lib/types"
import { toast } from "sonner"

export interface VendorOrganization {
  status: string
  vendor_id_code: string | null
  organization: { id: string; name: string; slug: string }
}

export interface OrganizationSearchResult {
  id: string
  name: string
  slug: string
}

export function useVendor() {
  const { user, accessToken } = useAuth()

  return useQuery({
    queryKey: ["vendor", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await api.post<{ data: VendorWithDetails | null }>(
        "/api/vendors/get-my-vendor",
        {},
        accessToken
      )
      if (data === null) return null
      return data as VendorWithDetails
    },
  })
}

export function useUpdateVendor() {
  const qc = useQueryClient()
  const { accessToken } = useAuth()

  return useMutation({
    mutationFn: async (updates: Partial<Vendor>) => {
      const { data } = await api.post<{ data: VendorWithDetails }>(
        "/api/vendors/update",
        updates,
        accessToken
      )
      return data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["vendor"] }),
  })
}

export function useUpdateVendorCategories() {
  const qc = useQueryClient()
  const { accessToken } = useAuth()

  return useMutation({
    mutationFn: async (categoryIds: string[]) => {
      await api.post(
        "/api/vendors/update-categories",
        { categoryIds },
        accessToken
      )
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["vendor"] })
      qc.invalidateQueries({ queryKey: ["vendors"] })
    },
    onError: (e: unknown) => toast.error((e as Error).message ?? "Failed to update categories"),
  })
}

export function useMyOrganizations() {
  const { user, accessToken } = useAuth()

  return useQuery({
    queryKey: ["vendor-my-organizations", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await api.post<{ data: VendorOrganization[] }>(
        "/api/vendors/my-organizations", {}, accessToken
      )
      return data
    },
  })
}

export function useOrganizationSearch(query: string) {
  const { accessToken } = useAuth()

  return useQuery({
    queryKey: ["organization-search", query],
    enabled: query.trim().length >= 2,
    queryFn: async () => {
      const { data } = await api.post<{ data: OrganizationSearchResult[] }>(
        "/api/organizations/search", { query }, accessToken
      )
      return data
    },
  })
}

// Exact-match lookup by Organisation Code -- vendor onboarding's Org Code
// field and the "Add Organisation" dialog's code-entry path both live-
// validate a typed code this way before it can be submitted.
export function useOrgCodeLookup(code: string) {
  const { accessToken } = useAuth()

  return useQuery({
    queryKey: ["organization-lookup-code", code],
    enabled: code.trim().length >= 3,
    queryFn: async () => {
      const { data } = await api.post<{ data: OrganizationSearchResult | null }>(
        "/api/organizations/lookup-code", { code }, accessToken
      )
      return data
    },
  })
}

export function useRequestOrganization() {
  const qc = useQueryClient()
  const { accessToken } = useAuth()

  return useMutation({
    mutationFn: async (orgId: string) => {
      const { data } = await api.post<{ data: VendorOrganization }>(
        "/api/vendors/request-organization", { org_id: orgId }, accessToken
      )
      return data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["vendor-my-organizations"] }),
  })
}
