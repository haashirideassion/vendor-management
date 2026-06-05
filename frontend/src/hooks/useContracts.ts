import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { api } from "@/lib/api"
import { useAuth } from "@/contexts/AuthContext"
import type { Contract, ContractAmendment, ContractStatus, ContractType } from "@/lib/types"

// ─── Filters ──────────────────────────────────────────────────────────────────

export interface ContractFilters {
  vendor_id?:     string
  contract_type?: ContractType
  status?:        ContractStatus
}

// ─── Queries ──────────────────────────────────────────────────────────────────

export function useContracts(filters?: ContractFilters) {
  const { accessToken } = useAuth()

  return useQuery({
    queryKey: ["contracts", filters],
    queryFn: async () => {
      const { data } = await api.post<{ data: Contract[] }>(
        "/api/contracts/list",
        filters,
        accessToken
      )
      return data as Contract[]
    },
  })
}

export function useContract(id: string) {
  const { accessToken } = useAuth()

  return useQuery({
    queryKey: ["contracts", id],
    queryFn: async () => {
      const { data } = await api.post<{ data: Contract }>(
        "/api/contracts/get",
        { id },
        accessToken
      )
      return data as Contract
    },
    enabled: !!id,
  })
}

// ─── Mutations ────────────────────────────────────────────────────────────────

export type CreateContractInput = Pick<
  Contract,
  | "vendor_id" | "contract_type" | "title" | "parent_id"
  | "effective_date" | "expiry_date" | "total_value" | "currency"
  | "auto_renew" | "renewal_notice_days" | "notes"
>

export function useCreateContract() {
  const queryClient = useQueryClient()
  const { user, accessToken } = useAuth()

  return useMutation({
    mutationFn: async (input: CreateContractInput) => {
      if (!user) throw new Error("Not authenticated")

      const { data } = await api.post<{ data: Contract }>(
        "/api/contracts/create",
        { ...input, created_by: user.id },
        accessToken
      )
      return data as Contract
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contracts"] })
      toast.success("Contract created")
    },
    onError: () => toast.error("Failed to create contract"),
  })
}

export function useUpdateContractStatus() {
  const queryClient = useQueryClient()
  const { accessToken } = useAuth()

  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: ContractStatus }) => {
      const { data } = await api.post<{ data: Contract }>(
        "/api/contracts/update-status",
        { id, status },
        accessToken
      )
      return data as Contract
    },
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ["contracts"] })
      queryClient.invalidateQueries({ queryKey: ["contracts", id] })
      toast.success("Contract status updated")
    },
    onError: () => toast.error("Failed to update contract"),
  })
}

export function useUpdateContract() {
  const queryClient = useQueryClient()
  const { accessToken } = useAuth()

  return useMutation({
    mutationFn: async ({ id, ...input }: Partial<CreateContractInput> & { id: string }) => {
      const { data } = await api.post<{ data: Contract }>(
        "/api/contracts/update",
        { id, ...input },
        accessToken
      )
      return data as Contract
    },
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ["contracts"] })
      queryClient.invalidateQueries({ queryKey: ["contracts", id] })
      toast.success("Contract updated")
    },
    onError: () => toast.error("Failed to update contract"),
  })
}

export function useMarkContractSigned() {
  const queryClient = useQueryClient()
  const { accessToken } = useAuth()

  return useMutation({
    mutationFn: async ({
      id,
      signedBy,
    }: {
      id: string
      signedBy: "vendor" | "internal" | "both"
    }) => {
      const payload: { id: string; signed_by_vendor?: boolean; signed_by_internal?: boolean } = { id }
      if (signedBy === "vendor" || signedBy === "both") payload.signed_by_vendor = true
      if (signedBy === "internal" || signedBy === "both") payload.signed_by_internal = true

      const { data } = await api.post<{ data: Contract }>(
        "/api/contracts/mark-signed",
        payload,
        accessToken
      )
      return data as Contract
    },
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ["contracts", id] })
      toast.success("Signature status updated")
    },
    onError: () => toast.error("Failed to update signature"),
  })
}

// ─── Amendment mutations ──────────────────────────────────────────────────────

export function useAddAmendment() {
  const queryClient = useQueryClient()
  const { user, accessToken } = useAuth()

  return useMutation({
    mutationFn: async ({
      contractId,
      title,
      description,
      effective_date,
    }: {
      contractId: string
      title: string
      description?: string
      effective_date?: string
    }) => {
      if (!user) throw new Error("Not authenticated")

      const { data } = await api.post<{ data: ContractAmendment }>(
        "/api/contracts/add-amendment",
        {
          contract_id:    contractId,
          title,
          description,
          effective_date,
          created_by:     user.id,
        },
        accessToken
      )
      return data as ContractAmendment
    },
    onSuccess: (_, { contractId }) => {
      queryClient.invalidateQueries({ queryKey: ["contracts", contractId] })
      queryClient.invalidateQueries({ queryKey: ["contracts"] })
      toast.success("Amendment added")
    },
    onError: () => toast.error("Failed to add amendment"),
  })
}
