import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { api } from "@/lib/api"
import { useAuth } from "@/contexts/AuthContext"
import type { PurchaseOrder, POLineItem, POStatus } from "@/lib/types"

// ─── Filters ──────────────────────────────────────────────────────────────────

export interface POFilters {
  status?: POStatus
  vendor_id?: string
  engagement_id?: string
  contract_id?: string
}

// ─── Queries ──────────────────────────────────────────────────────────────────

export function usePurchaseOrders(filters?: POFilters) {
  const { accessToken } = useAuth()

  return useQuery({
    queryKey: ["purchase-orders", filters],
    queryFn: async () => {
      const { data } = await api.post<{ data: PurchaseOrder[] }>(
        "/api/purchase-orders/list",
        {
          status: filters?.status,
          vendor_id: filters?.vendor_id,
          engagement_id: filters?.engagement_id,
          contract_id: filters?.contract_id,
        },
        accessToken
      )
      return data as PurchaseOrder[]
    },
  })
}

export function usePurchaseOrder(id: string) {
  const { accessToken } = useAuth()

  return useQuery({
    queryKey: ["purchase-orders", id],
    queryFn: async () => {
      const { data } = await api.post<{ data: PurchaseOrder }>(
        "/api/purchase-orders/get",
        { id },
        accessToken
      )
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
  const { user, accessToken } = useAuth()

  return useMutation({
    mutationFn: async ({ line_items, ...poInput }: CreatePOInput) => {
      if (!user) throw new Error("Not authenticated")

      const { data } = await api.post<{ data: PurchaseOrder }>(
        "/api/purchase-orders/create",
        { ...poInput, line_items, created_by: user.id },
        accessToken
      )
      return data as PurchaseOrder
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
  const { accessToken } = useAuth()

  return useMutation({
    mutationFn: async ({ id }: { id: string }) => {
      const { data } = await api.post<{ data: PurchaseOrder }>(
        "/api/purchase-orders/issue",
        { id },
        accessToken
      )
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
  const { accessToken } = useAuth()

  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: POStatus }) => {
      const { data } = await api.post<{ data: PurchaseOrder }>(
        "/api/purchase-orders/update-status",
        { id, status },
        accessToken
      )
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
