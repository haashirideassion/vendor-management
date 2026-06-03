import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { supabase } from "@/lib/supabase"
import type { GRN, GRNLineItem, GRNStatus } from "@/lib/types"

const SELECT_FIELDS = `
  *,
  vendor:vendor_id ( company_name ),
  purchase_order:po_id ( po_number ),
  line_items:grn_line_items (*)
`

// ─── Filters ──────────────────────────────────────────────────────────────────

export interface GRNFilters {
  status?: GRNStatus
  vendor_id?: string
  po_id?: string
}

// ─── Queries ──────────────────────────────────────────────────────────────────

export function useGRNs(filters?: GRNFilters) {
  return useQuery({
    queryKey: ["grns", filters],
    queryFn: async () => {
      let query = supabase
        .from("grns")
        .select(SELECT_FIELDS)
        .order("created_at", { ascending: false })

      if (filters?.status)    query = query.eq("status", filters.status)
      if (filters?.vendor_id) query = query.eq("vendor_id", filters.vendor_id)
      if (filters?.po_id)     query = query.eq("po_id", filters.po_id)

      const { data, error } = await query
      if (error) throw error
      return data as GRN[]
    },
  })
}

export function useGRN(id: string) {
  return useQuery({
    queryKey: ["grns", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("grns")
        .select(SELECT_FIELDS)
        .eq("id", id)
        .single()
      if (error) throw error
      return data as GRN
    },
    enabled: !!id,
  })
}

// ─── Mutations ────────────────────────────────────────────────────────────────

export interface CreateGRNInput {
  po_id: string
  vendor_id: string
  received_date: string
  notes?: string
  line_items: Omit<GRNLineItem, "id" | "grn_id" | "created_at">[]
}

export function useCreateGRN() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ line_items, ...grnInput }: CreateGRNInput) => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error("Not authenticated")

      const { data: grn, error: grnError } = await supabase
        .from("grns")
        .insert({
          ...grnInput,
          created_by: user.id,
          status: "verified",
          verified_by: user.id,
          verified_at: new Date().toISOString(),
        })
        .select()
        .single()
      if (grnError) throw grnError

      if (line_items.length > 0) {
        const { error: lineError } = await supabase
          .from("grn_line_items")
          .insert(line_items.map(li => ({ ...li, grn_id: grn.id })))
        if (lineError) throw lineError
      }

      return grn as GRN
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["grns"] })
      toast.success("GRN recorded and verified")
    },
    onError: () => toast.error("Failed to create GRN"),
  })
}

export function useUpdateGRNStatus() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      id,
      status,
      notes,
    }: {
      id: string
      status: GRNStatus
      notes?: string
    }) => {
      const { data: { user } } = await supabase.auth.getUser()
      const update: Partial<GRN> = { status, notes: notes ?? null }

      if (status === "verified") {
        update.verified_by  = user?.id ?? null
        update.verified_at = new Date().toISOString()
      }

      const { data, error } = await supabase
        .from("grns")
        .update(update)
        .eq("id", id)
        .select()
        .single()
      if (error) throw error
      return data as GRN
    },
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ["grns"] })
      queryClient.invalidateQueries({ queryKey: ["grns", id] })
      toast.success("GRN updated")
    },
    onError: () => toast.error("Failed to update GRN"),
  })
}
