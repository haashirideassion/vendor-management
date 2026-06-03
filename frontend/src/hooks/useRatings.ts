import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { supabase } from "@/lib/supabase"
import type { VendorRating } from "@/lib/types"
import { useAuth } from "@/contexts/AuthContext"

export function useVendorRatings(vendorId: string | undefined) {
  return useQuery({
    queryKey: ["ratings", vendorId],
    enabled: !!vendorId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vendor_ratings")
        .select("*, profiles(full_name, email)")
        .eq("vendor_id", vendorId!)
        .order("created_at", { ascending: false })
      if (error) throw error
      return data as VendorRating[]
    },
  })
}

export function useUpsertRating() {
  const qc = useQueryClient()
  const { user } = useAuth()

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
      const { data, error } = await supabase
        .from("vendor_ratings")
        .upsert(
          { vendor_id: vendorId, rated_by: user!.id, score, comment: comment ?? null },
          { onConflict: "vendor_id,rated_by" }
        )
        .select()
        .single()
      if (error) throw error
      return data as VendorRating
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["ratings", vars.vendorId] })
      qc.invalidateQueries({ queryKey: ["vendor", vars.vendorId] })
      qc.invalidateQueries({ queryKey: ["vendors"] })
    },
  })
}
