import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { supabase } from "@/lib/supabase"
import type { PurchaseOrder, POLineItem, POStatus } from "@/lib/types"

const SELECT_FIELDS = `
  *,
  vendor:vendor_id ( company_name, contact_name ),
  engagement:engagement_id ( title ),
  line_items:po_line_items (*)
`

// ─── Filters ──────────────────────────────────────────────────────────────────

export interface POFilters {
  status?: POStatus
  vendor_id?: string
  engagement_id?: string
  contract_id?: string
}

// ─── Queries ──────────────────────────────────────────────────────────────────

export function usePurchaseOrders(filters?: POFilters) {
  return useQuery({
    queryKey: ["purchase-orders", filters],
    queryFn: async () => {
      let query = supabase
        .from("purchase_orders")
        .select(SELECT_FIELDS)
        .order("created_at", { ascending: false })

      if (filters?.status)        query = query.eq("status", filters.status)
      if (filters?.vendor_id)     query = query.eq("vendor_id", filters.vendor_id)
      if (filters?.engagement_id) query = query.eq("engagement_id", filters.engagement_id)
      if (filters?.contract_id)   query = query.eq("contract_id", filters.contract_id)

      const { data, error } = await query
      if (error) throw error
      return data as PurchaseOrder[]
    },
  })
}

export function usePurchaseOrder(id: string) {
  return useQuery({
    queryKey: ["purchase-orders", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("purchase_orders")
        .select(SELECT_FIELDS)
        .eq("id", id)
        .single()
      if (error) throw error
      return data as PurchaseOrder
    },
    enabled: !!id,
  })
}

// ─── Mutations ────────────────────────────────────────────────────────────────

export interface CreatePOInput {
  engagement_id?: string
  vendor_id: string
  total_value: number
  currency?: string
  issue_date?: string
  expected_delivery_date?: string
  delivery_address?: string
  payment_terms?: string
  notes?: string
  line_items: Omit<POLineItem, "id" | "po_id" | "created_at">[]
}

export function useCreatePurchaseOrder() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ line_items, ...poInput }: CreatePOInput) => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error("Not authenticated")

      // Insert PO first to get the auto-generated ID and po_number
      const { data: po, error: poError } = await supabase
        .from("purchase_orders")
        .insert({ ...poInput, created_by: user.id, status: "draft" })
        .select()
        .single()
      if (poError) throw poError

      // Insert line items
      if (line_items.length > 0) {
        const { error: lineError } = await supabase
          .from("po_line_items")
          .insert(line_items.map(li => ({ ...li, po_id: po.id })))
        if (lineError) throw lineError
      }

      return po as PurchaseOrder
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["purchase-orders"] })
      toast.success("Purchase order created")
    },
    onError: () => toast.error("Failed to create purchase order"),
  })
}

export function useIssuePurchaseOrder() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id }: { id: string }) => {
      const { data, error } = await supabase
        .from("purchase_orders")
        .update({ status: "issued", issue_date: new Date().toISOString().slice(0, 10) })
        .eq("id", id)
        .select()
        .single()
      if (error) throw error
      return data as PurchaseOrder
    },
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ["purchase-orders"] })
      queryClient.invalidateQueries({ queryKey: ["purchase-orders", id] })
      toast.success("Purchase order issued")
    },
    onError: () => toast.error("Failed to issue purchase order"),
  })
}

export function useUpdatePOStatus() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: POStatus }) => {
      const { data, error } = await supabase
        .from("purchase_orders")
        .update({ status })
        .eq("id", id)
        .select()
        .single()
      if (error) throw error
      return data as PurchaseOrder
    },
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ["purchase-orders"] })
      queryClient.invalidateQueries({ queryKey: ["purchase-orders", id] })
      toast.success("Purchase order updated")
    },
    onError: () => toast.error("Failed to update purchase order"),
  })
}
