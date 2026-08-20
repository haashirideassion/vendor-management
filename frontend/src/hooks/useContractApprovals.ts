import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { api } from "@/lib/api"
import { useAuth } from "@/contexts/AuthContext"
import type { ContractApproval, ContractApprovalRole } from "@/lib/types"

// ─── Queries ──────────────────────────────────────────────────────────────────

/** All approval rows for a contract, across every round (newest round first). */
export function useContractApprovals(contractId: string | undefined) {
  const { accessToken } = useAuth()

  return useQuery({
    queryKey: ["contract-approvals", contractId],
    enabled: !!contractId,
    queryFn: async () => {
      const { data } = await api.post<{ data: ContractApproval[] }>(
        "/api/contract-approvals/list",
        { contractId },
        accessToken
      )
      return data as ContractApproval[]
    },
  })
}

// ─── Mutations ────────────────────────────────────────────────────────────────

/** Opens a new Final Approval round, sized to the contract's value tier. */
export function useRequestContractApproval() {
  const queryClient = useQueryClient()
  const { accessToken } = useAuth()

  return useMutation({
    mutationFn: async ({ contractId }: { contractId: string }) => {
      const { data } = await api.post<{ data: { round: number; tier: string; requiredRoles: ContractApprovalRole[] } }>(
        "/api/contract-approvals/request",
        { contractId },
        accessToken
      )
      return data
    },
    onSuccess: (_, { contractId }) => {
      queryClient.invalidateQueries({ queryKey: ["contract-approvals", contractId] })
      queryClient.invalidateQueries({ queryKey: ["contracts", contractId] })
      toast.success("Final Approval requested")
    },
    onError: (err: unknown) => toast.error((err as Error).message ?? "Failed to request final approval"),
  })
}

/** A single approver's decision (approve or reject) on the current round. */
export function useSubmitContractApproval() {
  const queryClient = useQueryClient()
  const { accessToken } = useAuth()

  return useMutation({
    mutationFn: async ({
      contractId,
      approverRole,
      status,
      notes,
    }: {
      contractId: string
      approverRole: ContractApprovalRole
      status: "approved" | "rejected"
      notes?: string
    }) => {
      const { data } = await api.post<{ data: { ok: true } }>(
        "/api/contract-approvals/submit",
        { contractId, approverRole, status, notes },
        accessToken
      )
      return data
    },
    onSuccess: (_, { contractId, status }) => {
      queryClient.invalidateQueries({ queryKey: ["contract-approvals", contractId] })
      queryClient.invalidateQueries({ queryKey: ["contracts", contractId] })
      toast.success(status === "approved" ? "Approval recorded" : "Rejected")
    },
    onError: (err: unknown) => toast.error((err as Error).message ?? "Failed to submit approval decision"),
  })
}
