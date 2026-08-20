import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { api } from "@/lib/api"
import { useAuth } from "@/contexts/AuthContext"
import type { ServiceConfirmation, ServiceConfirmationLineItem, ServiceConfirmationStatus, TaxComponentInput } from "@/lib/types"

// ─── Filters ──────────────────────────────────────────────────────────────────

export interface ServiceConfirmationFilters {
  status?: ServiceConfirmationStatus
  vendor_id?: string
  po_id?: string
}

// ─── Queries ──────────────────────────────────────────────────────────────────

export function useServiceConfirmations(filters?: ServiceConfirmationFilters) {
  const { accessToken } = useAuth()

  return useQuery({
    queryKey: ["service-confirmations", filters],
    queryFn: () =>
      api.post<ServiceConfirmation[]>(
        "/api/service-confirmations/list",
        { status: filters?.status, vendor_id: filters?.vendor_id, po_id: filters?.po_id },
        accessToken
      ),
  })
}

export function useServiceConfirmation(id: string) {
  const { accessToken } = useAuth()

  return useQuery({
    queryKey: ["service-confirmations", id],
    queryFn: () => api.post<ServiceConfirmation>("/api/service-confirmations/get", { id }, accessToken),
    enabled: !!id,
  })
}

// ─── Mutations ────────────────────────────────────────────────────────────────

export interface CreateServiceConfirmationInput {
  po_id: string
  vendor_id: string
  confirmed_date: string
  notes?: string
  line_items: (Omit<ServiceConfirmationLineItem, "id" | "service_confirmation_id" | "created_at" | "tax_components"> & { tax_components?: TaxComponentInput[] })[]
}

export function useCreateServiceConfirmation() {
  const queryClient = useQueryClient()
  const { user, accessToken } = useAuth()

  return useMutation({
    mutationFn: async ({ line_items, ...input }: CreateServiceConfirmationInput) => {
      if (!user) throw new Error("Not authenticated")

      return api.post<ServiceConfirmation>(
        "/api/service-confirmations/create",
        { ...input, created_by: user.id, line_items },
        accessToken
      )
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["service-confirmations"] })
      toast.success("Service Confirmation recorded")
    },
    onError: (err: Error) => toast.error(err.message || "Failed to record Service Confirmation"),
  })
}

export function useUpdateServiceConfirmationStatus() {
  const queryClient = useQueryClient()
  const { user, accessToken } = useAuth()

  return useMutation({
    mutationFn: async ({
      id,
      status,
      notes,
    }: {
      id: string
      status: ServiceConfirmationStatus
      notes?: string
      // Suppresses this hook's own toast -- for callers that show their own,
      // more specific message.
      silent?: boolean
    }) => {
      return api.post<ServiceConfirmation>(
        "/api/service-confirmations/update-status",
        { id, status, notes, ...(status === "verified" ? { verified_by: user?.id } : {}) },
        accessToken
      )
    },
    onSuccess: (_, { id, silent }) => {
      queryClient.invalidateQueries({ queryKey: ["service-confirmations"] })
      queryClient.invalidateQueries({ queryKey: ["service-confirmations", id] })
      if (!silent) toast.success("Service Confirmation updated")
    },
    onError: (_err, variables) => {
      if (!variables?.silent) toast.error("Failed to update Service Confirmation")
    },
  })
}
