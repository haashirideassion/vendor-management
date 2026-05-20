import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { supabase } from "@/lib/supabase"
import type { Vendor, VendorStatus, VendorWithDetails } from "@/lib/types"

interface VendorFilters {
  status?: VendorStatus | ""
  category?: string
  search?: string
}

export function useVendors(filters: VendorFilters = {}) {
  return useQuery({
    queryKey: ["vendors", filters],
    queryFn: async () => {
      // If filtering by category, first get matching vendor IDs
      let vendorIdFilter: string[] | null = null
      if (filters.category) {
        const { data: vc } = await supabase
          .from("vendor_categories")
          .select("vendor_id")
          .eq("category_id", filters.category)
        vendorIdFilter = vc?.map((r) => r.vendor_id) ?? []
        if (vendorIdFilter.length === 0) return []
      }

      let query = supabase
        .from("vendors")
        .select(`*, vendor_categories(*, service_categories(*)), vendor_ratings(score)`)
        .order("created_at", { ascending: false })

      if (filters.status) query = query.eq("status", filters.status)
      if (filters.search) {
        query = query.or(
          `company_name.ilike.%${filters.search}%,contact_email.ilike.%${filters.search}%,vendor_id_code.ilike.%${filters.search}%`
        )
      }
      if (vendorIdFilter) query = query.in("id", vendorIdFilter)

      const { data, error } = await query
      if (error) throw error

      return (data as VendorWithDetails[]).map((v) => {
        const ratings = v.vendor_ratings ?? []
        const avg = ratings.length ? ratings.reduce((s, r) => s + r.score, 0) / ratings.length : 0
        return { ...v, avg_rating: avg }
      })
    },
  })
}

export function useVendorById(id: string | undefined) {
  return useQuery({
    queryKey: ["vendor", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vendors")
        .select(`*, vendor_categories(*, service_categories(*)), vendor_services(*), vendor_documents(*), vendor_ratings(*, profiles(full_name, email))`)
        .eq("id", id!)
        .single()
      if (error) throw error
      const ratings = (data as VendorWithDetails).vendor_ratings ?? []
      const avg = ratings.length ? ratings.reduce((s, r) => s + r.score, 0) / ratings.length : 0
      return { ...data, avg_rating: avg } as VendorWithDetails
    },
  })
}

export function useVendorsByCategories(categoryIds: string[]) {
  return useQuery({
    queryKey: ["vendors", "by-categories", categoryIds],
    enabled: categoryIds.length > 0,
    queryFn: async () => {
      const { data: vc } = await supabase
        .from("vendor_categories")
        .select("vendor_id")
        .in("category_id", categoryIds)
      const vendorIds = [...new Set((vc ?? []).map((r) => r.vendor_id))]
      if (vendorIds.length === 0) return []

      const { data, error } = await supabase
        .from("vendors")
        .select("id, company_name, contact_name")
        .in("id", vendorIds)
        .eq("status", "active")
        .order("company_name")
      if (error) throw error
      return data as Pick<Vendor, "id" | "company_name" | "contact_name">[]
    },
  })
}

export function useUpdateVendorStatus() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, status, admin_notes }: { id: string; status: VendorStatus; admin_notes?: string }) => {
      const updates: Partial<Vendor> = { status }
      if (admin_notes !== undefined) updates.admin_notes = admin_notes
      const { data, error } = await supabase.from("vendors").update(updates).eq("id", id).select().single()
      if (error) throw error
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["vendors"] })
      qc.invalidateQueries({ queryKey: ["vendor"] })
    },
  })
}
