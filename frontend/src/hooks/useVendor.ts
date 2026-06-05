import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { api } from "@/lib/api"
import { useAuth } from "@/contexts/AuthContext"
import type { Vendor, VendorWithDetails } from "@/lib/types"
import { toast } from "sonner"

export function useVendor() {
  const { user, accessToken } = useAuth()

  return useQuery({
    queryKey: ["vendor", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await api.post<{ data: VendorWithDetails | null }>(
        "/api/vendors/get-my-vendor",
        { profileId: user!.id },
        accessToken
      )
      if (data === null) return null
      return data as VendorWithDetails
    },
  })
}

export function useUpdateVendor() {
  const qc = useQueryClient()
  const { user, accessToken } = useAuth()

  return useMutation({
    mutationFn: async (updates: Partial<Vendor>) => {
      const { data } = await api.post<{ data: VendorWithDetails }>(
        "/api/vendors/update",
        { profileId: user!.id, ...updates },
        accessToken
      )
      return data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["vendor"] }),
  })
}

export function useUpdateVendorCategories() {
  const qc = useQueryClient()
  const { user, accessToken } = useAuth()

  return useMutation({
    mutationFn: async (categoryIds: string[]) => {
      const { data: vendorData } = await api.post<{ data: { id: string } }>(
        "/api/vendors/get-my-vendor",
        { profileId: user!.id },
        accessToken
      )
      if (!vendorData) throw new Error("Vendor not found")

      await api.post(
        "/api/vendors/update-categories",
        { vendorId: vendorData.id, categoryIds },
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
