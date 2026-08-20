import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { api } from "@/lib/api"
import type { VendorRating, RatingDimension } from "@/lib/types"
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

// A rater gets exactly one rating per vendor, ever (backend enforces this on
// /create) -- derived client-side from the same list rather than a separate
// endpoint, so callers (RateVendorDialog) can tell up front whether to show
// the form or "you've already rated this vendor."
export function useMyVendorRating(vendorId: string | undefined) {
  const { user } = useAuth()
  const { data: ratings, ...rest } = useVendorRatings(vendorId)
  const myRating = ratings?.find((r) => r.rated_by === user?.id) ?? null
  return { myRating, ...rest }
}

export type RatingDimensionScores = Record<RatingDimension, number>

export function useCreateRating() {
  const qc = useQueryClient()
  const { accessToken } = useAuth()

  return useMutation({
    mutationFn: async ({
      vendorId,
      scores,
      comment,
    }: {
      vendorId: string
      scores: RatingDimensionScores
      comment?: string
    }) => {
      const { data } = await api.post<{ data: VendorRating }>(
        "/api/ratings/create",
        { vendor_id: vendorId, ...scores, comment },
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
