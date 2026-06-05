import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { api } from "@/lib/api"
import { useAuth } from "@/contexts/AuthContext"
import type { GRN, GRNLineItem, GRNStatus } from "@/lib/types"

// ─── Filters ──────────────────────────────────────────────────────────────────

export interface GRNFilters {
  status?: GRNStatus
  vendor_id?: string
  po_id?: string
}

// ─── Queries ──────────────────────────────────────────────────────────────────

export function useGRNs(filters?: GRNFilters) {
  const { accessToken } = useAuth()

  return useQuery({
    queryKey: ["grns", filters],
    queryFn: async () => {
      const { data } = await api.post<{ data: GRN[] }>(
        "/api/grns/list",
        {
          status:    filters?.status,
          vendor_id: filters?.vendor_id,
          po_id:     filters?.po_id,
        },
        accessToken
      )
      return data
    },
  })
}

export function useGRN(id: string) {
  const { accessToken } = useAuth()

  return useQuery({
    queryKey: ["grns", id],
    queryFn: async () => {
      const { data } = await api.post<{ data: GRN }>(
        "/api/grns/get",
        { id },
        accessToken
      )
      return data
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
  const { user, accessToken } = useAuth()

  return useMutation({
    mutationFn: async ({ line_items, ...grnInput }: CreateGRNInput) => {
      if (!user) throw new Error("Not authenticated")

      const { data } = await api.post<{ data: GRN }>(
        "/api/grns/create",
        {
          ...grnInput,
          created_by:  user.id,
          verified_by: user.id,
          line_items,
        },
        accessToken
      )
      return data
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
  const { user, accessToken } = useAuth()

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
      const { data } = await api.post<{ data: GRN }>(
        "/api/grns/update-status",
        {
          id,
          status,
          notes,
          ...(status === "verified" ? { verified_by: user?.id } : {}),
        },
        accessToken
      )
      return data
    },
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ["grns"] })
      queryClient.invalidateQueries({ queryKey: ["grns", id] })
      toast.success("GRN updated")
    },
    onError: () => toast.error("Failed to update GRN"),
  })
}
