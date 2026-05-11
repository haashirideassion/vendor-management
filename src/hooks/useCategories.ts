import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { supabase } from "@/lib/supabase"
import type { ServiceCategory } from "@/lib/types"

export function useVendorCategories(vendorId?: string) {
  return useQuery({
    queryKey: ["vendor-categories", vendorId],
    enabled: !!vendorId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vendor_categories")
        .select("*, service_categories(*)")
        .eq("vendor_id", vendorId!)
      if (error) throw error
      return (data ?? [])
        .filter((vc) => vc.service_categories?.is_active)
        .map((vc) => vc.service_categories as ServiceCategory)
        .filter(Boolean)
    },
  })
}

export function useCategories(activeOnly = false) {
  return useQuery({
    queryKey: ["categories", activeOnly],
    queryFn: async () => {
      let query = supabase
        .from("service_categories")
        .select("*")
        .order("name")
      if (activeOnly) query = query.eq("is_active", true)
      const { data, error } = await query
      if (error) throw error
      return data as ServiceCategory[]
    },
  })
}

export function useCreateCategory() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: { name: string; description?: string }) => {
      const { data, error } = await supabase
        .from("service_categories")
        .insert({ name: payload.name, description: payload.description ?? null })
        .select()
        .single()
      if (error) throw error
      return data as ServiceCategory
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["categories"] }),
  })
}

export function useUpdateCategory() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<ServiceCategory> & { id: string }) => {
      const { data, error } = await supabase
        .from("service_categories")
        .update(updates)
        .eq("id", id)
        .select()
        .single()
      if (error) throw error
      return data as ServiceCategory
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["categories"] }),
  })
}

export function useDeleteCategory() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("service_categories").delete().eq("id", id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["categories"] }),
  })
}
