import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { api } from "@/lib/api"
import { useAuth } from "@/contexts/AuthContext"
import type { GRN, GRNLineItem, GRNStatus, TaxComponentInput } from "@/lib/types"

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
    queryFn: () =>
      api.post<GRN[]>("/api/grns/list", { status: filters?.status, vendor_id: filters?.vendor_id, po_id: filters?.po_id }, accessToken),
  })
}

export function useGRN(id: string) {
  const { accessToken } = useAuth()

  return useQuery({
    queryKey: ["grns", id],
    queryFn: () => api.post<GRN>("/api/grns/get", { id }, accessToken),
    enabled: !!id,
  })
}

// ─── Mutations ────────────────────────────────────────────────────────────────

export interface CreateGRNInput {
  po_id: string
  vendor_id: string
  received_date: string
  notes?: string
  line_items: (Omit<GRNLineItem, "id" | "grn_id" | "created_at" | "tax_components"> & { tax_components?: TaxComponentInput[] })[]
}

export function useCreateGRN() {
  const queryClient = useQueryClient()
  const { user, accessToken } = useAuth()

  return useMutation({
    mutationFn: async ({ line_items, ...grnInput }: CreateGRNInput) => {
      if (!user) throw new Error("Not authenticated")

      return api.post<GRN>(
        "/api/grns/create",
        { ...grnInput, created_by: user.id, line_items },
        accessToken
      )
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["grns"] })
      toast.success("GRN recorded")
    },
    onError: (err: Error) => toast.error(err.message || "Failed to create GRN"),
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
      // Suppresses this hook's own toast -- for callers (e.g. the "Submit
      // for review" action) that show their own, more specific message.
      silent?: boolean
    }) => {
      return api.post<GRN>(
        "/api/grns/update-status",
        { id, status, notes, ...(status === "verified" ? { verified_by: user?.id } : {}) },
        accessToken
      )
    },
    onSuccess: (_, { id, silent }) => {
      queryClient.invalidateQueries({ queryKey: ["grns"] })
      queryClient.invalidateQueries({ queryKey: ["grns", id] })
      if (!silent) toast.success("GRN updated")
    },
    onError: (_err, variables) => {
      if (!variables?.silent) toast.error("Failed to update GRN")
    },
  })
}
