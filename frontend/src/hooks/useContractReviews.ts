import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { api } from "@/lib/api"
import { useAuth } from "@/contexts/AuthContext"
import type { ContractReviewer, ContractReviewerRole, ContractReviewStatus } from "@/lib/types"

// ─── Queries ──────────────────────────────────────────────────────────────────

/** All reviewer rows for a contract, across every review round (newest round first). */
export function useContractReviewers(contractId: string | undefined) {
  const { accessToken } = useAuth()

  return useQuery({
    queryKey: ["contract-reviewers", contractId],
    enabled: !!contractId,
    queryFn: async () => {
      const { data } = await api.post<{ data: ContractReviewer[] }>(
        "/api/contract-reviews/list",
        { contractId },
        accessToken
      )
      return data as ContractReviewer[]
    },
  })
}

// ─── Mutations ────────────────────────────────────────────────────────────────

/** Opens a new Internal Review round for a contract (requires risk_tier set, status draft). */
export function useRequestContractReview() {
  const queryClient = useQueryClient()
  const { accessToken } = useAuth()

  return useMutation({
    mutationFn: async ({ contractId }: { contractId: string }) => {
      const { data } = await api.post<{ data: { round: number; requiredRoles: ContractReviewerRole[] } }>(
        "/api/contract-reviews/request",
        { contractId },
        accessToken
      )
      return data
    },
    onSuccess: (_, { contractId }) => {
      queryClient.invalidateQueries({ queryKey: ["contract-reviewers", contractId] })
      queryClient.invalidateQueries({ queryKey: ["contracts", contractId] })
      toast.success("Internal Review requested")
    },
    onError: (err: unknown) => toast.error((err as Error).message ?? "Failed to request Internal Review"),
  })
}

/** A single reviewer's sign-off (approve or request changes) on the current round. */
export function useSubmitContractReview() {
  const queryClient = useQueryClient()
  const { accessToken } = useAuth()

  return useMutation({
    mutationFn: async ({
      contractId,
      reviewerRole,
      status,
      notes,
    }: {
      contractId: string
      reviewerRole: ContractReviewerRole
      status: ContractReviewStatus
      notes?: string
    }) => {
      const { data } = await api.post<{ data: { ok: true } }>(
        "/api/contract-reviews/submit",
        { contractId, reviewerRole, status, notes },
        accessToken
      )
      return data
    },
    onSuccess: (_, { contractId, status }) => {
      queryClient.invalidateQueries({ queryKey: ["contract-reviewers", contractId] })
      queryClient.invalidateQueries({ queryKey: ["contracts", contractId] })
      toast.success(status === "approved" ? "Review approved" : "Changes requested")
    },
    onError: (err: unknown) => toast.error((err as Error).message ?? "Failed to submit review"),
  })
}
