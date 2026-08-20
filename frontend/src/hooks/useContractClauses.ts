import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { api } from "@/lib/api"
import { useAuth } from "@/contexts/AuthContext"
import type { ContractClause, ContractClauseVersion, ContractClauseCategory } from "@/lib/types"

// ─── Queries ──────────────────────────────────────────────────────────────────

/** All clauses for a contract, each with its current version attached. */
export function useContractClauses(contractId: string | undefined) {
  const { accessToken } = useAuth()

  return useQuery({
    queryKey: ["contract-clauses", contractId],
    enabled: !!contractId,
    queryFn: async () => {
      const { data } = await api.post<{ data: ContractClause[] }>(
        "/api/contract-clauses/list",
        { contractId },
        accessToken
      )
      return data as ContractClause[]
    },
  })
}

/** Full version history for one clause, newest first. */
export function useContractClauseVersions(clauseId: string | undefined) {
  const { accessToken } = useAuth()

  return useQuery({
    queryKey: ["contract-clause-versions", clauseId],
    enabled: !!clauseId,
    queryFn: async () => {
      const { data } = await api.post<{ data: ContractClauseVersion[] }>(
        "/api/contract-clauses/versions",
        { clauseId },
        accessToken
      )
      return data as ContractClauseVersion[]
    },
  })
}

// ─── Mutations ────────────────────────────────────────────────────────────────

/** Internal-only: defines a new negotiable clause with its initial (v1) content. */
export function useCreateContractClause() {
  const queryClient = useQueryClient()
  const { accessToken } = useAuth()

  return useMutation({
    mutationFn: async ({
      contractId, title, category, content,
    }: {
      contractId: string
      title: string
      category: ContractClauseCategory
      content: string
    }) => {
      const { data } = await api.post<{ data: { clauseId: string } }>(
        "/api/contract-clauses/create",
        { contractId, title, category, content },
        accessToken
      )
      return data
    },
    onSuccess: (_, { contractId }) => {
      queryClient.invalidateQueries({ queryKey: ["contract-clauses", contractId] })
      toast.success("Clause added")
    },
    onError: (err: unknown) => toast.error((err as Error).message ?? "Failed to add clause"),
  })
}

/** Either side proposes a new redline on a clause, superseding its current version. */
export function useSubmitClauseVersion() {
  const queryClient = useQueryClient()
  const { accessToken } = useAuth()

  return useMutation({
    mutationFn: async ({
      clauseId, content, changeSummary,
    }: {
      clauseId: string
      contractId: string
      content: string
      changeSummary?: string
    }) => {
      const { data } = await api.post<{ data: { ok: true } }>(
        "/api/contract-clauses/submit-version",
        { clauseId, content, changeSummary },
        accessToken
      )
      return data
    },
    onSuccess: (_, { clauseId, contractId }) => {
      queryClient.invalidateQueries({ queryKey: ["contract-clauses", contractId] })
      queryClient.invalidateQueries({ queryKey: ["contract-clause-versions", clauseId] })
      toast.success("Redline submitted")
    },
    onError: (err: unknown) => toast.error((err as Error).message ?? "Failed to submit redline"),
  })
}

/** Caller marks their own side's agreement on a clause's current version. */
export function useAgreeToClause() {
  const queryClient = useQueryClient()
  const { accessToken } = useAuth()

  return useMutation({
    mutationFn: async ({ clauseId }: { clauseId: string; contractId: string }) => {
      const { data } = await api.post<{ data: { ok: true; status: string } }>(
        "/api/contract-clauses/agree",
        { clauseId },
        accessToken
      )
      return data
    },
    onSuccess: (_, { clauseId, contractId }) => {
      queryClient.invalidateQueries({ queryKey: ["contract-clauses", contractId] })
      queryClient.invalidateQueries({ queryKey: ["contract-clause-versions", clauseId] })
      toast.success("Agreement recorded")
    },
    onError: (err: unknown) => toast.error((err as Error).message ?? "Failed to record agreement"),
  })
}

/** Legal-only: reopens an agreed clause for further negotiation. */
export function useReopenClause() {
  const queryClient = useQueryClient()
  const { accessToken } = useAuth()

  return useMutation({
    mutationFn: async ({ clauseId }: { clauseId: string; contractId: string }) => {
      const { data } = await api.post<{ data: { ok: true } }>(
        "/api/contract-clauses/reopen",
        { clauseId },
        accessToken
      )
      return data
    },
    onSuccess: (_, { clauseId, contractId }) => {
      queryClient.invalidateQueries({ queryKey: ["contract-clauses", contractId] })
      queryClient.invalidateQueries({ queryKey: ["contract-clause-versions", clauseId] })
      toast.success("Clause reopened")
    },
    onError: (err: unknown) => toast.error((err as Error).message ?? "Failed to reopen clause"),
  })
}
