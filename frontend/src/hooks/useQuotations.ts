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
    queryFn: () =>
      api.post<Quotation | null>("/api/quotations/by-rfq", { rfqId }, accessToken),
  })
}

export function useEngagementQuotations(engagementId: string | undefined) {
  const { accessToken } = useAuth()

  return useQuery({
    queryKey: ["quotations", "engagement", engagementId],
    enabled: !!engagementId,
    queryFn: () =>
      api.post<Quotation[]>("/api/quotations/by-engagement", { engagementId }, accessToken),
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
    mutationFn: (input: CreateQuotationInput) =>
      api.post<Quotation>("/api/quotations/create", input, accessToken),
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
    mutationFn: ({ id, total_amount }: { id: string; total_amount: number }) =>
      api.post<Quotation>("/api/quotations/submit", { id, total_amount }, accessToken),
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
    mutationFn: ({ id, status }: { id: string; status: QuotationStatus }) =>
      api.post<Quotation>("/api/quotations/update-status", { id, status }, accessToken),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["quotations"] })
    },
    onError: () => toast.error("Failed to update quotation"),
  })
}
