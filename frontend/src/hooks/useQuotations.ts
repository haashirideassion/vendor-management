import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { api } from "@/lib/api"
import { useAuth } from "@/contexts/AuthContext"
import type { Quotation, QuotationLineItem, TaxComponentInput } from "@/lib/types"

export function useQuotationByRFQ(rfqId: string | undefined) {
  const { accessToken } = useAuth()

  return useQuery({
    queryKey: ["quotations", "rfq", rfqId],
    enabled: !!rfqId,
    queryFn: () =>
      api.post<Quotation | null>("/api/quotations/by-rfq", { rfqId }, accessToken),
  })
}

export function usePurchaseRequestQuotations(purchaseRequestId: string | undefined) {
  const { accessToken } = useAuth()

  return useQuery({
    queryKey: ["quotations", "purchase_request", purchaseRequestId],
    enabled: !!purchaseRequestId,
    queryFn: () =>
      api.post<Quotation[]>("/api/quotations/by-purchase-request", { purchaseRequestId }, accessToken),
  })
}

export interface CreateQuotationInput {
  rfq_id: string
  purchase_request_id: string
  vendor_id: string
  notes?: string
  line_items: (Omit<QuotationLineItem, "id" | "quotation_id" | "total" | "created_at" | "tax_components"> & { tax_components?: TaxComponentInput[] })[]
}

// Full version history for an RFQ's quotation, newest first.
export function useQuotationVersionHistory(rfqId: string | undefined) {
  const { accessToken } = useAuth()

  return useQuery({
    queryKey: ["quotations", "rfq", rfqId, "versions"],
    enabled: !!rfqId,
    queryFn: () =>
      api.post<Quotation[]>("/api/quotations/by-rfq/versions", { rfqId }, accessToken),
  })
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

// Associate (or Manager/Admin covering for one) sends a finished draft up
// for Manager approval. Does not reach the org yet.
export function useSubmitQuotationForReview() {
  const queryClient = useQueryClient()
  const { accessToken } = useAuth()

  return useMutation({
    mutationFn: ({ id, total_amount }: { id: string; total_amount: number }) =>
      api.post<Quotation>("/api/quotations/submit-for-review", { id, total_amount }, accessToken),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["quotations"] })
      toast.success("Sent to Manager for approval")
    },
    onError: () => toast.error("Failed to submit quotation"),
  })
}

// Vendor Manager/Admin approves a quotation pending their review -- this is
// the moment it actually reaches the organisation.
export function useApproveQuotation() {
  const queryClient = useQueryClient()
  const { accessToken } = useAuth()

  return useMutation({
    mutationFn: ({ id }: { id: string }) =>
      api.post<Quotation>("/api/quotations/approve", { id }, accessToken),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["quotations"] })
      toast.success("Quotation approved and submitted to the organisation")
    },
    onError: () => toast.error("Failed to approve quotation"),
  })
}

// Vendor Manager/Admin sends a quotation back to the Associate with remarks,
// instead of approving it.
export function useReturnQuotationToAssociate() {
  const queryClient = useQueryClient()
  const { accessToken } = useAuth()

  return useMutation({
    mutationFn: ({ id, notes }: { id: string; notes: string }) =>
      api.post<Quotation>("/api/quotations/return-to-associate", { id, notes }, accessToken),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["quotations"] })
      toast.success("Sent back to the Associate for changes")
    },
    onError: () => toast.error("Failed to return quotation"),
  })
}

// Org's final decision on a quotation that has already reached "submitted"
// (i.e. Manager-approved). Only accepted/rejected are valid here now --
// draft/pending_manager_review/submitted transitions go through the
// dedicated vendor-side mutations above instead.
export function useUpdateQuotationStatus() {
  const queryClient = useQueryClient()
  const { accessToken } = useAuth()

  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: "accepted" | "rejected" }) =>
      api.post<Quotation>("/api/quotations/update-status", { id, status }, accessToken),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["quotations"] })
    },
    onError: () => toast.error("Failed to update quotation"),
  })
}
