import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { api } from "@/lib/api"
import { useAuth } from "@/contexts/AuthContext"
import type { Invoice, InvoiceStatus } from "@/lib/types"

// ─── Filters ──────────────────────────────────────────────────────────────────

export interface InvoiceFilters {
  status?: InvoiceStatus
  vendor_id?: string
  po_id?: string
  match_status?: string
}

// ─── Queries ──────────────────────────────────────────────────────────────────

export function useInvoices(filters?: InvoiceFilters) {
  const { accessToken } = useAuth()

  return useQuery({
    queryKey: ["invoices", filters],
    queryFn: async () => {
      const { data } = await api.post<{ data: Invoice[] }>(
        "/api/invoices/list",
        filters,
        accessToken
      )
      return data as Invoice[]
    },
  })
}

export function useInvoice(id: string) {
  const { accessToken } = useAuth()

  return useQuery({
    queryKey: ["invoices", id],
    queryFn: async () => {
      const { data } = await api.post<{ data: Invoice }>(
        "/api/invoices/get",
        { id },
        accessToken
      )
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
  const { user, accessToken } = useAuth()

  return useMutation({
    mutationFn: async (input: SubmitInvoiceInput) => {
      if (!user) throw new Error("Not authenticated")

      const { data } = await api.post<{ data: Invoice }>(
        "/api/invoices/submit",
        { ...input, submitted_by: user.id },
        accessToken
      )
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
  const { accessToken } = useAuth()

  return useMutation({
    mutationFn: async ({ invoiceId }: { invoiceId: string }) => {
      await api.post("/api/invoices/run-match", { invoiceId }, accessToken)
    },
    onSuccess: (_, { invoiceId }) => {
      queryClient.invalidateQueries({ queryKey: ["invoices"] })
      queryClient.invalidateQueries({ queryKey: ["invoices", invoiceId] })
    },
    onError: () => toast.error("Three-way match failed"),
  })
}

export function useReviewInvoice() {
  const queryClient = useQueryClient()
  const { user, accessToken } = useAuth()

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
      const { data } = await api.post<{ data: Invoice }>(
        "/api/invoices/review",
        { id, status, notes, reviewed_by: user?.id },
        accessToken
      )
      return data as Invoice
    },
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ["invoices"] })
      queryClient.invalidateQueries({ queryKey: ["invoices", id] })
    },
    onError: () => toast.error("Failed to review invoice"),
  })
}

export function useMarkInvoicePaid() {
  const queryClient = useQueryClient()
  const { accessToken } = useAuth()

  return useMutation({
    mutationFn: async ({ id }: { id: string }) => {
      const { data } = await api.post<{ data: Invoice }>(
        "/api/invoices/mark-paid",
        { id },
        accessToken
      )
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
