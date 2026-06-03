import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { supabase } from "@/lib/supabase"
import type { Contract, ContractAmendment, ContractStatus, ContractType } from "@/lib/types"

const SELECT_FIELDS = `
  *,
  vendor:vendor_id ( company_name, contact_name ),
  parent:parent_id ( contract_ref, title ),
  amendments:contract_amendments ( * )
`

// ─── Filters ──────────────────────────────────────────────────────────────────

export interface ContractFilters {
  vendor_id?:     string
  contract_type?: ContractType
  status?:        ContractStatus
}

// ─── Queries ──────────────────────────────────────────────────────────────────

export function useContracts(filters?: ContractFilters) {
  return useQuery({
    queryKey: ["contracts", filters],
    queryFn: async () => {
      let query = supabase
        .from("contracts")
        .select(SELECT_FIELDS)
        .order("created_at", { ascending: false })

      if (filters?.vendor_id)     query = query.eq("vendor_id", filters.vendor_id)
      if (filters?.contract_type) query = query.eq("contract_type", filters.contract_type)
      if (filters?.status)        query = query.eq("status", filters.status)

      const { data, error } = await query
      if (error) throw error
      return data as Contract[]
    },
  })
}

export function useContract(id: string) {
  return useQuery({
    queryKey: ["contracts", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contracts")
        .select(SELECT_FIELDS)
        .eq("id", id)
        .single()
      if (error) throw error
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

  return useMutation({
    mutationFn: async (input: CreateContractInput) => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error("Not authenticated")

      const { data, error } = await supabase
        .from("contracts")
        .insert({ ...input, created_by: user.id, status: "draft" })
        .select()
        .single()
      if (error) throw error
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

  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: ContractStatus }) => {
      const { data, error } = await supabase
        .from("contracts")
        .update({ status })
        .eq("id", id)
        .select()
        .single()
      if (error) throw error
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

  return useMutation({
    mutationFn: async ({ id, ...input }: Partial<CreateContractInput> & { id: string }) => {
      const { data, error } = await supabase
        .from("contracts")
        .update(input)
        .eq("id", id)
        .select()
        .single()
      if (error) throw error
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

  return useMutation({
    mutationFn: async ({
      id,
      signedBy,
    }: {
      id: string
      signedBy: "vendor" | "internal" | "both"
    }) => {
      const update: Partial<Contract> = {}
      if (signedBy === "vendor" || signedBy === "both") update.signed_by_vendor = true
      if (signedBy === "internal" || signedBy === "both") update.signed_by_internal = true

      // Mark signed_at when both parties have signed
      const { data: current } = await supabase
        .from("contracts")
        .select("signed_by_vendor, signed_by_internal")
        .eq("id", id)
        .single()

      const bothSigned =
        (update.signed_by_vendor || current?.signed_by_vendor) &&
        (update.signed_by_internal || current?.signed_by_internal)

      if (bothSigned) update.signed_at = new Date().toISOString()

      const { data, error } = await supabase
        .from("contracts")
        .update(update)
        .eq("id", id)
        .select()
        .single()
      if (error) throw error
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
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error("Not authenticated")

      // Get next amendment number
      const { count } = await supabase
        .from("contract_amendments")
        .select("*", { count: "exact", head: true })
        .eq("contract_id", contractId)

      const { data, error } = await supabase
        .from("contract_amendments")
        .insert({
          contract_id:      contractId,
          amendment_number: (count ?? 0) + 1,
          title,
          description:      description ?? null,
          effective_date:   effective_date ?? null,
          created_by:       user.id,
        })
        .select()
        .single()
      if (error) throw error
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
