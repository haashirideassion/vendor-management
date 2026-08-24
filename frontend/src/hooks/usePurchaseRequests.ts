import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { api } from "@/lib/api"
import { useAuth } from "@/contexts/AuthContext"
import type { PurchaseRequest, PurchaseRequestLineItem, PurchaseRequestStatus } from "@/lib/types"

// ─── Filters ──────────────────────────────────────────────────────────────────

export interface PurchaseRequestFilters {
  status?: PurchaseRequestStatus
  vendor_id?: string
  search?: string
}

// ─── Queries ──────────────────────────────────────────────────────────────────

export function usePurchaseRequests(filters?: PurchaseRequestFilters) {
  const { accessToken } = useAuth()

  return useQuery({
    queryKey: ["purchase_requests", filters],
    queryFn: async () => {
      const { data } = await api.post<{ data: PurchaseRequest[] }>(
        "/api/purchase-requests/list",
        {
          status:    filters?.status,
          vendor_id: filters?.vendor_id,
          search:    filters?.search,
        },
        accessToken
      )
      return data
    },
    refetchInterval: 30_000,
  })
}

export function usePurchaseRequest(id: string) {
  const { accessToken } = useAuth()

  return useQuery({
    queryKey: ["purchase_requests", id],
    queryFn: async () => {
      const { data } = await api.post<{ data: PurchaseRequest }>(
        "/api/purchase-requests/get",
        { id },
        accessToken
      )
      return data
    },
    enabled: !!id,
  })
}

// ─── Mutations ────────────────────────────────────────────────────────────────

export interface CreatePurchaseRequestInput {
  title: string
  description?: string | null
  vendor_ids: string[]
  category_ids: string[]
  estimated_value?: number | null
  currency: string
  start_date?: string | null
  end_date?: string | null
  notes?: string | null
  line_items?: Omit<PurchaseRequestLineItem, "id" | "purchase_request_id" | "created_at">[]
  // Required by the backend once vendor_ids is non-empty -- an RFQ is
  // created per invited vendor and quotation deadline is no longer optional.
  response_deadline?: string | null
  // Optional org-wide reporting tag, propagated forward to RFQ/PO/GRN/
  // Service Confirmation/Invoice -- never required, never inferred.
  team_id?: string | null
}

export function useCreatePurchaseRequest() {
  const queryClient = useQueryClient()
  const { user, accessToken } = useAuth()

  return useMutation({
    mutationFn: async (input: CreatePurchaseRequestInput) => {
      if (!user) throw new Error("Not authenticated")

      const { data } = await api.post<{ data: PurchaseRequest }>(
        "/api/purchase-requests/create",
        { ...input, created_by: user.id },
        accessToken
      )
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["purchase_requests"] })
      queryClient.invalidateQueries({ queryKey: ["rfqs"] })
      toast.success("Purchase request created")
    },
    onError: () => toast.error("Failed to create purchase request"),
  })
}

export function useUpdatePurchaseRequestStatus() {
  const queryClient = useQueryClient()
  const { user, accessToken } = useAuth()

  return useMutation({
    mutationFn: async ({
      id,
      status,
      notes,
    }: {
      id: string
      status: PurchaseRequestStatus
      notes?: string
    }) => {
      const { data } = await api.post<{ data: PurchaseRequest }>(
        "/api/purchase-requests/update-status",
        {
          id,
          status,
          notes,
          ...(status === "approved" ? { approved_by: user?.id } : {}),
        },
        accessToken
      )
      return data
    },
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ["purchase_requests"] })
      queryClient.invalidateQueries({ queryKey: ["purchase_requests", id] })
    },
    onError: () => toast.error("Failed to update purchase request status"),
  })
}

type UpdatePurchaseRequestInput = Partial<Pick<PurchaseRequest,
  "title" | "description" | "vendor_id" | "category_id" |
  "estimated_value" | "currency" | "start_date" | "end_date" | "notes"
>>

export function useUpdatePurchaseRequest() {
  const queryClient = useQueryClient()
  const { accessToken } = useAuth()

  return useMutation({
    mutationFn: async ({ id, ...input }: UpdatePurchaseRequestInput & { id: string }) => {
      const { data } = await api.post<{ data: PurchaseRequest }>(
        "/api/purchase-requests/update",
        { id, ...input },
        accessToken
      )
      return data
    },
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ["purchase_requests"] })
      queryClient.invalidateQueries({ queryKey: ["purchase_requests", id] })
      toast.success("Purchase request updated")
    },
    onError: () => toast.error("Failed to update purchase request"),
  })
}
