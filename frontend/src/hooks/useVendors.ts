import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { api } from "@/lib/api"
import { useAuth } from "@/contexts/AuthContext"
import type { Vendor, VendorStatus, VendorWithDetails } from "@/lib/types"

interface VendorFilters {
  status?: VendorStatus | ""
  category?: string
  search?: string
}

export function useVendors(filters: VendorFilters = {}) {
  const { accessToken } = useAuth()

  return useQuery({
    queryKey: ["vendors", filters],
    queryFn: async () => {
      const { data } = await api.post<{ data: VendorWithDetails[] }>(
        "/api/vendors/list",
        { status: filters.status, category: filters.category, search: filters.search },
        accessToken
      )
      return data as VendorWithDetails[]
    },
  })
}

export function useVendorById(id: string | undefined) {
  const { accessToken } = useAuth()

  return useQuery({
    queryKey: ["vendor", id],
    enabled: !!id,
    queryFn: async () => {
      const { data } = await api.post<{ data: VendorWithDetails }>(
        "/api/vendors/get",
        { id },
        accessToken
      )
      return data as VendorWithDetails
    },
  })
}

export function useVendorsByCategories(categoryIds: string[]) {
  const { accessToken } = useAuth()

  return useQuery({
    queryKey: ["vendors", "by-categories", categoryIds],
    enabled: categoryIds.length > 0,
    queryFn: async () => {
      const { data } = await api.post<{ data: Pick<Vendor, "id" | "company_name" | "contact_name">[] }>(
        "/api/vendors/by-categories",
        { categoryIds },
        accessToken
      )
      return data as Pick<Vendor, "id" | "company_name" | "contact_name">[]
    },
  })
}

export interface AdminOnboardVendorInput {
  company_name: string
  legal_name?: string
  contact_name: string
  contact_email: string
  contact_phone?: string
  tax_gst_number?: string
  pan_number?: string
  registration_number?: string
  bank_name?: string
  bank_account_number?: string
  bank_routing_number?: string
  category_ids?: string[]
  /** Present when onboarding from a Group Overview screen; omitted for a standalone org's own vendor list (org-only reach). */
  groupId?: string
}

// Admin-initiated onboarding (distinct from the vendor's own self-service
// /vendors/create) -- reach (which orgs get an organization_vendors row) is
// a snapshot decided server-side from whether groupId is present, per the
// confirmed group-reach/org-reach model. Takes an explicit actingOrgId
// (the org this submission is made "as") rather than relying on whatever
// org the switcher currently has active, since a Group Overview submission
// needs a specific member org of that group -- not necessarily the user's
// globally active one.
export function useAdminOnboardVendor() {
  const qc = useQueryClient()
  const { accessToken } = useAuth()

  return useMutation({
    mutationFn: async ({ actingOrgId, ...input }: AdminOnboardVendorInput & { actingOrgId: string }) => {
      const { data } = await api.post<{ data: { id: string; orgIds: string[] } }>(
        "/api/vendors/admin-onboard", input, accessToken, actingOrgId
      )
      return data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["vendors"] }),
  })
}

// Bootstraps portal access for a vendor onboarded via admin-onboard (zero
// vendor_users, no login yet) -- one-time action, backend 409s if the vendor
// already has any portal users.
export function useInvitePortalUser() {
  const qc = useQueryClient()
  const { accessToken } = useAuth()

  return useMutation({
    mutationFn: async (vendorId: string) => {
      const { data } = await api.post<{ data: { vendorUserId: string; email: string; inviteSent: boolean } }>(
        "/api/vendors/invite-portal-user",
        { vendor_id: vendorId },
        accessToken
      )
      return data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["vendor"] }),
  })
}

export function useUpdateVendorStatus() {
  const qc = useQueryClient()
  const { accessToken } = useAuth()

  return useMutation({
    mutationFn: async ({ id, status, admin_notes }: { id: string; status: VendorStatus; admin_notes?: string }) => {
      const { data } = await api.post<{ data: VendorWithDetails }>(
        "/api/vendors/update-status",
        { id, status, admin_notes },
        accessToken
      )
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["vendors"] })
      qc.invalidateQueries({ queryKey: ["vendor"] })
    },
  })
}

// A Local Admin revokes just THIS org's access to a vendor reached via a
// group, without removing the vendor from the group relationship overall.
export function useRevokeGroupVendorAccess() {
  const qc = useQueryClient()
  const { accessToken } = useAuth()

  return useMutation({
    mutationFn: async ({ id }: { id: string }) => {
      const { data } = await api.post<{ data: VendorWithDetails }>(
        "/api/vendors/revoke-group-access",
        { id },
        accessToken
      )
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["vendors"] })
      qc.invalidateQueries({ queryKey: ["vendor"] })
    },
  })
}
