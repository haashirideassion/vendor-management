import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { api } from "@/lib/api"
import { useAuth } from "@/contexts/AuthContext"
import type { ApprovalEntityType, ApprovalRequest } from "@/lib/types"

// ─── Queries ──────────────────────────────────────────────────────────────────

/** Fetch all approval requests for a specific entity (e.g. a single PO or engagement) */
export function useApprovalRequests(entityType: ApprovalEntityType, entityId: string) {
  const { accessToken } = useAuth()

  return useQuery({
    queryKey: ["approval-requests", entityType, entityId],
    queryFn: async () => {
      const { data } = await api.post<{ data: ApprovalRequest[] }>(
        "/api/approvals/by-entity",
        { entityType, entityId },
        accessToken
      )
      return data as ApprovalRequest[]
    },
    enabled: !!entityId,
  })
}

/** Fetch all pending approval requests — used on admin dashboards */
export function usePendingApprovals(entityType?: ApprovalEntityType) {
  const { accessToken } = useAuth()

  return useQuery({
    queryKey: ["approval-requests", "pending", entityType],
    queryFn: async () => {
      const { data } = await api.post<{ data: ApprovalRequest[] }>(
        "/api/approvals/pending",
        { entityType },
        accessToken
      )
      return data as ApprovalRequest[]
    },
  })
}

// ─── Mutations ────────────────────────────────────────────────────────────────

/** Submit a new approval request for any entity */
export function useRequestApproval() {
  const queryClient = useQueryClient()
  const { user, accessToken } = useAuth()

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

      const { data } = await api.post<{ data: ApprovalRequest }>(
        "/api/approvals/request",
        {
          entity_type: entityType,
          entity_id: entityId,
          requested_by: user.id,
          amount,
          notes,
        },
        accessToken
      )
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
      entityType: ApprovalEntityType
      entityId: string
    }) => {
      if (!user) throw new Error("Not authenticated")

      const { data } = await api.post<{ data: ApprovalRequest }>(
        "/api/approvals/review",
        { id, status, notes, reviewed_by: user.id },
        accessToken
      )
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
  const { accessToken } = useAuth()

  return useMutation({
    mutationFn: async ({
      id,
    }: {
      id: string
      entityType: ApprovalEntityType
      entityId: string
    }) => {
      const { data } = await api.post<{ data: ApprovalRequest }>(
        "/api/approvals/cancel",
        { id },
        accessToken
      )
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
