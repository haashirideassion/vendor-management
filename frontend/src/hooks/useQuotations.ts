import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { api } from "@/lib/api"
import { useAuth } from "@/contexts/AuthContext"
import type { Quotation, QuotationLineItem, QuotationStatus } from "@/lib/types"

export function useQuotationByRFQ(rfqId: string | undefined) {
  const { accessToken } = useAuth()

  return useQuery({
    queryKey: ["quotations", "rfq", rfqId],
    enabled: !!rfqId,
    queryFn: async () => {
      const { data } = await api.post<{ data: Quotation | null }>(
        "/api/quotations/by-rfq",
        { rfqId },
        accessToken
      )
      return data
    },
  })
}

export function useEngagementQuotations(engagementId: string | undefined) {
  const { accessToken } = useAuth()

  return useQuery({
    queryKey: ["quotations", "engagement", engagementId],
    enabled: !!engagementId,
    queryFn: async () => {
      const { data } = await api.post<{ data: Quotation[] }>(
        "/api/quotations/by-engagement",
        { engagementId },
        accessToken
      )
      return data
    },
  })
}

export interface CreateQuotationInput {
  rfq_id: string
  engagement_id: string
  vendor_id: string
  notes?: string
  line_items: Omit<QuotationLineItem, "id" | "quotation_id" | "total" | "created_at">[]
}

export function useCreateQuotation() {
  const queryClient = useQueryClient()
  const { accessToken } = useAuth()

  return useMutation({
    mutationFn: async ({ rfq_id, engagement_id, vendor_id, notes, line_items }: CreateQuotationInput) => {
      const { data } = await api.post<{ data: Quotation }>(
        "/api/quotations/create",
        { rfq_id, engagement_id, vendor_id, notes, line_items },
        accessToken
      )
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["quotations"] })
    },
    onError: () => toast.error("Failed to save quotation"),
  })
}

export function useSubmitQuotation() {
  const queryClient = useQueryClient()
  const { accessToken } = useAuth()

  return useMutation({
    mutationFn: async ({ id, total_amount }: { id: string; total_amount: number }) => {
      const { data } = await api.post<{ data: Quotation }>(
        "/api/quotations/submit",
        { id, total_amount },
        accessToken
      )
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["quotations"] })
      toast.success("Quotation submitted")
    },
    onError: () => toast.error("Failed to submit quotation"),
  })
}

export function useUpdateQuotationStatus() {
  const queryClient = useQueryClient()
  const { accessToken } = useAuth()

  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: QuotationStatus }) => {
      const { data } = await api.post<{ data: Quotation }>(
        "/api/quotations/update-status",
        { id, status },
        accessToken
      )
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["quotations"] })
    },
    onError: () => toast.error("Failed to update quotation"),
  })
}
