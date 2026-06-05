import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { supabase } from "@/lib/supabase"
import { useAuth } from "@/contexts/AuthContext"
import type { ApprovalEntityType, ApprovalRequest } from "@/lib/types"

// ─── Queries ──────────────────────────────────────────────────────────────────

/** Fetch all approval requests for a specific entity (e.g. a single PO or engagement) */
export function useApprovalRequests(entityType: ApprovalEntityType, entityId: string) {
  return useQuery({
    queryKey: ["approval-requests", entityType, entityId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("approval_requests")
        .select(`
          *,
          requester:requested_by ( full_name, email ),
          reviewer:reviewed_by  ( full_name, email )
        `)
        .eq("entity_type", entityType)
        .eq("entity_id", entityId)
        .order("created_at", { ascending: false })
      if (error) throw error
      return data as ApprovalRequest[]
    },
    enabled: !!entityId,
  })
}

/** Fetch all pending approval requests — used on admin dashboards */
export function usePendingApprovals(entityType?: ApprovalEntityType) {
  return useQuery({
    queryKey: ["approval-requests", "pending", entityType],
    queryFn: async () => {
      let query = supabase
        .from("approval_requests")
        .select(`
          *,
          requester:requested_by ( full_name, email )
        `)
        .eq("status", "pending")
        .order("created_at", { ascending: true })

      if (entityType) query = query.eq("entity_type", entityType)

      const { data, error } = await query
      if (error) throw error
      return data as ApprovalRequest[]
    },
  })
}

// ─── Mutations ────────────────────────────────────────────────────────────────

/** Submit a new approval request for any entity */
export function useRequestApproval() {
  const queryClient = useQueryClient()
  const { user } = useAuth()

  return useMutation({
    mutationFn: async ({
      entityType,
      entityId,
      amount,
      notes,
    }: {
      entityType: ApprovalEntityType
      entityId: string
      amount?: number
      notes?: string
    }) => {
      if (!user) throw new Error("Not authenticated")

      const { data, error } = await supabase
        .from("approval_requests")
        .insert({
          entity_type: entityType,
          entity_id: entityId,
          requested_by: user.id,
          amount: amount ?? null,
          notes: notes ?? null,
        })
        .select()
        .single()

      if (error) throw error
      return data as ApprovalRequest
    },
    onSuccess: (_, { entityType, entityId }) => {
      queryClient.invalidateQueries({ queryKey: ["approval-requests", entityType, entityId] })
      queryClient.invalidateQueries({ queryKey: ["approval-requests", "pending"] })
      toast.success("Approval request submitted")
    },
    onError: () => toast.error("Failed to submit approval request"),
  })
}

/** Approve or reject an existing approval request */
export function useReviewApproval() {
  const queryClient = useQueryClient()
  const { user } = useAuth()

  return useMutation({
    mutationFn: async ({
      id,
      status,
      notes,
    }: {
      id: string
      status: "approved" | "rejected"
      notes?: string
      entityType: ApprovalEntityType
      entityId: string
    }) => {
      if (!user) throw new Error("Not authenticated")

      const { data, error } = await supabase
        .from("approval_requests")
        .update({
          status,
          notes: notes ?? null,
          reviewed_by: user.id,
          reviewed_at: new Date().toISOString(),
        })
        .eq("id", id)
        .select()
        .single()

      if (error) throw error
      return data as ApprovalRequest
    },
    onSuccess: (_, { status, entityType, entityId }) => {
      queryClient.invalidateQueries({ queryKey: ["approval-requests", entityType, entityId] })
      queryClient.invalidateQueries({ queryKey: ["approval-requests", "pending"] })
      toast.success(`Request ${status}`)
    },
    onError: () => toast.error("Failed to update approval request"),
  })
}

/** Cancel a pending approval request (only the requester should do this) */
export function useCancelApproval() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      id,
    }: {
      id: string
      entityType: ApprovalEntityType
      entityId: string
    }) => {
      const { data, error } = await supabase
        .from("approval_requests")
        .update({ status: "cancelled" })
        .eq("id", id)
        .select()
        .single()

      if (error) throw error
      return data as ApprovalRequest
    },
    onSuccess: (_, { entityType, entityId }) => {
      queryClient.invalidateQueries({ queryKey: ["approval-requests", entityType, entityId] })
      queryClient.invalidateQueries({ queryKey: ["approval-requests", "pending"] })
      toast.success("Request cancelled")
    },
    onError: () => toast.error("Failed to cancel request"),
  })
}
