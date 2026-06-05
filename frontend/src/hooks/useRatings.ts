import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { api } from "@/lib/api"
import type { VendorRating } from "@/lib/types"
import { useAuth } from "@/contexts/AuthContext"

export function useVendorRatings(vendorId: string | undefined) {
  const { accessToken } = useAuth()

  return useQuery({
    queryKey: ["ratings", vendorId],
    enabled: !!vendorId,
    queryFn: async () => {
      const { data } = await api.post<{ data: VendorRating[] }>(
        "/api/ratings/by-vendor",
        { vendorId },
        accessToken
      )
      return data as VendorRating[]
    },
  })
}

export function useUpsertRating() {
  const qc = useQueryClient()
  const { user, accessToken } = useAuth()

  return useMutation({
    mutationFn: async ({
      vendorId,
      score,
      comment,
    }: {
      vendorId: string
      score: number
      comment?: string
    }) => {
      const { data } = await api.post<{ data: VendorRating }>(
        "/api/ratings/upsert",
        { vendor_id: vendorId, rated_by: user!.id, score, comment },
        accessToken
      )
      return data as VendorRating
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["ratings", vars.vendorId] })
      qc.invalidateQueries({ queryKey: ["vendor", vars.vendorId] })
      qc.invalidateQueries({ queryKey: ["vendors"] })
    },
  })
}
