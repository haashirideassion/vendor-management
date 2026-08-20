import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { api } from "@/lib/api"
import { useAuth } from "@/contexts/AuthContext"
import type { ContractRenewalDecision, ContractRenewalDecisionType, ContractRenewalReminder } from "@/lib/types"

// ─── Queries ──────────────────────────────────────────────────────────────────

/** All renewal decision cycles + reminder history for a contract. */
export function useContractRenewals(contractId: string | undefined) {
  const { accessToken } = useAuth()

  return useQuery({
    queryKey: ["contract-renewals", contractId],
    enabled: !!contractId,
    queryFn: async () => {
      const { data } = await api.post<{ data: { decisions: ContractRenewalDecision[]; reminders: ContractRenewalReminder[] } }>(
        "/api/contract-renewals/list",
        { contractId },
        accessToken
      )
      return data as { decisions: ContractRenewalDecision[]; reminders: ContractRenewalReminder[] }
    },
  })
}

// ─── Mutations ────────────────────────────────────────────────────────────────

/** Logs a renew/amend/terminate decision for the contract's current cycle. */
export function useDecideContractRenewal() {
  const queryClient = useQueryClient()
  const { accessToken } = useAuth()

  return useMutation({
    mutationFn: async ({
      contractId,
      decision,
      amendmentScope,
      terminationNoticeDate,
      newExpiryDate,
    }: {
      contractId: string
      decision: ContractRenewalDecisionType
      amendmentScope?: string
      terminationNoticeDate?: string
      newExpiryDate?: string
    }) => {
      const { data } = await api.post<{ data: { ok: true } }>(
        "/api/contract-renewals/decide",
        { contractId, decision, amendmentScope, terminationNoticeDate, newExpiryDate },
        accessToken
      )
      return data
    },
    onSuccess: (_, { contractId }) => {
      queryClient.invalidateQueries({ queryKey: ["contract-renewals", contractId] })
      queryClient.invalidateQueries({ queryKey: ["contracts", contractId] })
      toast.success("Renewal decision recorded")
    },
    onError: (err: unknown) => toast.error((err as Error).message ?? "Failed to record renewal decision"),
  })
}
