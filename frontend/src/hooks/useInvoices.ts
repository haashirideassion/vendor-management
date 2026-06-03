import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { supabase } from "@/lib/supabase"
import type { Invoice, InvoiceStatus } from "@/lib/types"

const SELECT_FIELDS = `
  *,
  vendor:vendor_id ( company_name ),
  purchase_order:po_id ( po_number ),
  grn:grn_id ( grn_number ),
  contract:contract_id ( contract_ref, title ),
  engagement:engagement_id ( title )
`

// ─── Filters ──────────────────────────────────────────────────────────────────

export interface InvoiceFilters {
  status?: InvoiceStatus
  vendor_id?: string
  po_id?: string
  match_status?: string
}

// ─── Queries ──────────────────────────────────────────────────────────────────

export function useInvoices(filters?: InvoiceFilters) {
  return useQuery({
    queryKey: ["invoices", filters],
    queryFn: async () => {
      let query = supabase
        .from("invoices")
        .select(SELECT_FIELDS)
        .order("created_at", { ascending: false })

      if (filters?.status)       query = query.eq("status", filters.status)
      if (filters?.vendor_id)    query = query.eq("vendor_id", filters.vendor_id)
      if (filters?.po_id)        query = query.eq("po_id", filters.po_id)
      if (filters?.match_status) query = query.eq("match_status", filters.match_status)

      const { data, error } = await query
      if (error) throw error
      return data as Invoice[]
    },
  })
}

export function useInvoice(id: string) {
  return useQuery({
    queryKey: ["invoices", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invoices")
        .select(SELECT_FIELDS)
        .eq("id", id)
        .single()
      if (error) throw error
      return data as Invoice
    },
    enabled: !!id,
  })
}

// ─── Mutations ────────────────────────────────────────────────────────────────

export interface SubmitInvoiceInput {
  vendor_invoice_number: string
  vendor_id: string
  po_id?: string
  grn_id?: string
  contract_id?: string
  engagement_id?: string
  total_amount: number
  currency?: string
  invoice_date: string
  due_date?: string
  notes?: string
  storage_path?: string
}

export function useSubmitInvoice() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: SubmitInvoiceInput) => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error("Not authenticated")

      let resolvedPoId = input.po_id ?? undefined
      if (!resolvedPoId && input.engagement_id && input.vendor_id) {
        const { data: po } = await supabase
          .from("purchase_orders")
          .select("id")
          .eq("engagement_id", input.engagement_id)
          .eq("vendor_id", input.vendor_id)
          .limit(1)
          .maybeSingle()
        if (po) resolvedPoId = po.id
      }

      const { data, error } = await supabase
        .from("invoices")
        .insert({
          ...input,
          po_id:        resolvedPoId ?? input.po_id ?? null,
          submitted_by: user.id,
          status: "submitted",
          match_status: "pending",
        })
        .select()
        .single()
      if (error) throw error
      return data as Invoice
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["invoices"] })
      toast.success("Invoice submitted")
    },
    onError: () => toast.error("Failed to submit invoice"),
  })
}

export function useRunThreeWayMatch() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ invoiceId }: { invoiceId: string }) => {
      // Calls the DB function created in migration 007
      const { error } = await supabase.rpc("perform_three_way_match", {
        p_invoice_id: invoiceId,
      })
      if (error) throw error
    },
    onSuccess: (_, { invoiceId }) => {
      queryClient.invalidateQueries({ queryKey: ["invoices"] })
      queryClient.invalidateQueries({ queryKey: ["invoices", invoiceId] })
      toast.success("Three-way match complete")
    },
    onError: () => toast.error("Three-way match failed"),
  })
}

export function useReviewInvoice() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      id,
      status,
      notes,
    }: {
      id: string
      status: "approved" | "rejected"
      notes?: string
    }) => {
      const { data: { user } } = await supabase.auth.getUser()

      const { data, error } = await supabase
        .from("invoices")
        .update({
          status,
          notes: notes ?? null,
          reviewed_by: user?.id ?? null,
          reviewed_at: new Date().toISOString(),
        })
        .eq("id", id)
        .select()
        .single()
      if (error) throw error
      return data as Invoice
    },
    onSuccess: (_, { id, status }) => {
      queryClient.invalidateQueries({ queryKey: ["invoices"] })
      queryClient.invalidateQueries({ queryKey: ["invoices", id] })
      toast.success(`Invoice ${status}`)
    },
    onError: () => toast.error("Failed to review invoice"),
  })
}

export function useMarkInvoicePaid() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id }: { id: string }) => {
      const { data, error } = await supabase
        .from("invoices")
        .update({ status: "paid", paid_at: new Date().toISOString() })
        .eq("id", id)
        .select()
        .single()
      if (error) throw error
      return data as Invoice
    },
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ["invoices"] })
      queryClient.invalidateQueries({ queryKey: ["invoices", id] })
      toast.success("Invoice marked as paid")
    },
    onError: () => toast.error("Failed to mark invoice as paid"),
  })
}
