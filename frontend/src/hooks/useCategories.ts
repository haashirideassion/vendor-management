import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { api } from "@/lib/api"
import { useAuth } from "@/contexts/AuthContext"
import type { ServiceCategory } from "@/lib/types"

export function useVendorCategories(vendorId?: string) {
  const { accessToken } = useAuth()

  return useQuery({
    queryKey: ["vendor-categories", vendorId],
    enabled: !!vendorId,
    queryFn: async () => {
      const { data } = await api.post<{ data: Array<{ service_categories: ServiceCategory & { is_active: boolean } | null }> }>(
        "/api/categories/by-vendor",
        { vendorId },
        accessToken
      )
      return (data ?? [])
        .filter((vc) => vc.service_categories?.is_active)
        .map((vc) => vc.service_categories as ServiceCategory)
        .filter(Boolean)
    },
  })
}

export function useCategories(activeOnly = false) {
  const { accessToken } = useAuth()

  return useQuery({
    queryKey: ["categories", activeOnly],
    queryFn: async () => {
      const { data } = await api.post<{ data: ServiceCategory[] }>(
        "/api/categories/list",
        { activeOnly },
        accessToken
      )
      return data as ServiceCategory[]
    },
  })
}

export function useCreateCategory() {
  const qc = useQueryClient()
  const { accessToken } = useAuth()

  return useMutation({
    mutationFn: async (payload: { name: string; description?: string }) => {
      const { data } = await api.post<{ data: ServiceCategory }>(
        "/api/categories/create",
        { name: payload.name, description: payload.description },
        accessToken
      )
      return data as ServiceCategory
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["categories"] }),
  })
}

export function useUpdateCategory() {
  const qc = useQueryClient()
  const { accessToken } = useAuth()

  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<ServiceCategory> & { id: string }) => {
      const { data } = await api.post<{ data: ServiceCategory }>(
        "/api/categories/update",
        { id, ...updates },
        accessToken
      )
      return data as ServiceCategory
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["categories"] }),
  })
}

export function useDeleteCategory() {
  const qc = useQueryClient()
  const { accessToken } = useAuth()

  return useMutation({
    mutationFn: async (id: string) => {
      await api.post("/api/categories/delete", { id }, accessToken)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["categories"] }),
  })
}
