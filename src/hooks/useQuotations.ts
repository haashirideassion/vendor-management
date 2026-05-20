import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { supabase } from "@/lib/supabase"
import type { Quotation, QuotationLineItem, QuotationStatus } from "@/lib/types"

const SELECT_FIELDS = `
  *,
  vendor:vendor_id ( company_name ),
  line_items:quotation_line_items (*)
`

export function useQuotationByRFQ(rfqId: string | undefined) {
  return useQuery({
    queryKey: ["quotations", "rfq", rfqId],
    enabled: !!rfqId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("quotations")
        .select(SELECT_FIELDS)
        .eq("rfq_id", rfqId!)
        .maybeSingle()
      if (error) throw error
      return data as Quotation | null
    },
  })
}

export function useEngagementQuotations(engagementId: string | undefined) {
  return useQuery({
    queryKey: ["quotations", "engagement", engagementId],
    enabled: !!engagementId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("quotations")
        .select(SELECT_FIELDS)
        .eq("engagement_id", engagementId!)
        .eq("status", "submitted")
        .order("created_at", { ascending: false })
      if (error) throw error
      return data as Quotation[]
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

  return useMutation({
    mutationFn: async ({ line_items, ...input }: CreateQuotationInput) => {
      const { data: quot, error: quotError } = await supabase
        .from("quotations")
        .insert({ ...input, status: "draft" })
        .select()
        .single()
      if (quotError) throw quotError

      if (line_items.length > 0) {
        const { error: lineError } = await supabase
          .from("quotation_line_items")
          .insert(line_items.map((li) => ({ ...li, quotation_id: quot.id })))
        if (lineError) throw lineError
      }

      return quot as Quotation
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["quotations"] })
      toast.success("Quotation saved")
    },
    onError: () => toast.error("Failed to save quotation"),
  })
}

export function useSubmitQuotation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, total_amount }: { id: string; total_amount: number }) => {
      const { data, error } = await supabase
        .from("quotations")
        .update({ status: "submitted", total_amount, submitted_at: new Date().toISOString() })
        .eq("id", id)
        .select()
        .single()
      if (error) throw error
      return data as Quotation
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

  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: QuotationStatus }) => {
      const { data, error } = await supabase
        .from("quotations")
        .update({ status })
        .eq("id", id)
        .select()
        .single()
      if (error) throw error
      return data as Quotation
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["quotations"] })
    },
    onError: () => toast.error("Failed to update quotation"),
  })
}
