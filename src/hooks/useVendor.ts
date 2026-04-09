import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { supabase } from "@/lib/supabase"
import { useAuth } from "@/contexts/AuthContext"
import type { Vendor, VendorWithDetails } from "@/lib/types"

export function useVendor() {
  const { user } = useAuth()

  return useQuery({
    queryKey: ["vendor", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vendors")
        .select(`
          *,
          vendor_categories(*, service_categories(*)),
          vendor_services(*),
          vendor_documents(*),
          vendor_ratings(score)
        `)
        .eq("profile_id", user!.id)
        .single()
      if (error && error.code !== "PGRST116") throw error
      if (!data) return null
      const ratings = (data as VendorWithDetails).vendor_ratings ?? []
      const avg = ratings.length ? ratings.reduce((s, r) => s + r.score, 0) / ratings.length : 0
      return { ...data, avg_rating: avg } as VendorWithDetails
    },
  })
}

export function useUpdateVendor() {
  const qc = useQueryClient()
  const { user } = useAuth()

  return useMutation({
    mutationFn: async (updates: Partial<Vendor>) => {
      const { data, error } = await supabase
        .from("vendors")
        .update(updates)
        .eq("profile_id", user!.id)
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["vendor"] }),
  })
}
