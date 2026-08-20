import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { api } from "@/lib/api"
import { useAuth } from "@/contexts/AuthContext"
import type { Invoice, InvoiceStatus, InvoiceException, InvoiceExceptionStatus, InvoicePayment, PaymentMethod } from "@/lib/types"

// ─── Filters ──────────────────────────────────────────────────────────────────

export interface InvoiceFilters {
  status?: InvoiceStatus
  vendor_id?: string
  po_id?: string
  match_status?: string
  // Not a real invoice status -- filters onto the invoice_exceptions queue
  // (migration 073) instead, surfaced as one more option in the status
  // dropdown rather than a separate page.
  has_open_exception?: boolean
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
  purchase_request_id?: string
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

// ─── 3-way match exceptions ─────────────────────────────────────────────────

export function useInvoiceExceptions(filters?: { status?: InvoiceExceptionStatus; invoiceId?: string }) {
  const { accessToken } = useAuth()

  return useQuery({
    queryKey: ["invoice-exceptions", filters],
    enabled: filters?.invoiceId === undefined || !!filters.invoiceId,
    queryFn: async () => {
      const { data } = await api.post<{ data: InvoiceException[] }>(
        "/api/invoices/exceptions/list",
        { status: filters?.status, invoiceId: filters?.invoiceId },
        accessToken
      )
      return data as InvoiceException[]
    },
  })
}

export function useResolveInvoiceException() {
  const queryClient = useQueryClient()
  const { accessToken } = useAuth()

  return useMutation({
    mutationFn: async ({ id, status, notes }: { id: string; status: "resolved" | "waived"; notes?: string }) => {
      const { data } = await api.post<{ data: InvoiceException }>(
        "/api/invoices/exceptions/resolve",
        { id, status, notes },
        accessToken
      )
      return data as InvoiceException
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["invoice-exceptions"] })
      toast.success("Exception updated")
    },
    onError: () => toast.error("Failed to update exception"),
  })
}

// ─── Payments ────────────────────────────────────────────────────────────────

export function useInvoicePayments(invoiceId: string | undefined) {
  const { accessToken } = useAuth()

  return useQuery({
    queryKey: ["invoice-payments", invoiceId],
    enabled: !!invoiceId,
    queryFn: async () => {
      const { data } = await api.post<{ data: InvoicePayment[] }>(
        "/api/invoices/payments/list",
        { invoiceId },
        accessToken
      )
      return data as InvoicePayment[]
    },
  })
}

export interface RecordPaymentInput {
  invoiceId: string
  amount: number
  paymentMethod: PaymentMethod
  referenceNumber?: string
  paidDate?: string
  notes?: string
}

export function useRecordInvoicePayment() {
  const queryClient = useQueryClient()
  const { accessToken } = useAuth()

  return useMutation({
    mutationFn: async (input: RecordPaymentInput) => {
      const { data } = await api.post<{ data: { invoice: Invoice; payment: InvoicePayment } }>(
        "/api/invoices/payments/create",
        input,
        accessToken
      )
      return data
    },
    onSuccess: (_, { invoiceId }) => {
      queryClient.invalidateQueries({ queryKey: ["invoices"] })
      queryClient.invalidateQueries({ queryKey: ["invoices", invoiceId] })
      queryClient.invalidateQueries({ queryKey: ["invoice-payments", invoiceId] })
      toast.success("Payment recorded")
    },
    onError: (err: Error) => toast.error(err.message || "Failed to record payment"),
  })
}
