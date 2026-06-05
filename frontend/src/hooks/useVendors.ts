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
