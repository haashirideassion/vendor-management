import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { supabase } from "@/lib/supabase"
import { useAuth } from "@/contexts/AuthContext"
import type { Vendor, VendorWithDetails } from "@/lib/types"
import { toast } from "sonner"

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
      const { error } = await supabase
        .from("vendors")
        .update(updates)
        .eq("profile_id", user!.id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["vendor"] }),
  })
}

export function useUpdateVendorCategories() {
  const qc = useQueryClient()
  const { user } = useAuth()

  return useMutation({
    mutationFn: async (categoryIds: string[]) => {
      const { data: vendor, error: vendorError } = await supabase
        .from("vendors")
        .select("id")
        .eq("profile_id", user!.id)
        .single()
      if (vendorError) throw vendorError
      if (!vendor) throw new Error("Vendor not found")

      const { error: deleteError } = await supabase
        .from("vendor_categories")
        .delete()
        .eq("vendor_id", vendor.id)
      if (deleteError) throw deleteError

      if (categoryIds.length > 0) {
        const uniqueIds = [...new Set(categoryIds)]
        const { error: insertError } = await supabase
          .from("vendor_categories")
          .insert(uniqueIds.map((cid) => ({ vendor_id: vendor.id, category_id: cid })))
        if (insertError) throw insertError
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["vendor"] })
      qc.invalidateQueries({ queryKey: ["vendors"] })
    },
    onError: (e: unknown) => toast.error((e as Error).message ?? "Failed to update categories"),
  })
}
