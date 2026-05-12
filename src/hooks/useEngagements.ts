import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { supabase } from "@/lib/supabase"
import type { Engagement, EngagementStatus } from "@/lib/types"

const SELECT_FIELDS = `
  *,
  vendor:vendor_id ( company_name, contact_name ),
  category:category_id ( name ),
  creator:created_by ( full_name, email )
`

// ─── Filters ──────────────────────────────────────────────────────────────────

export interface EngagementFilters {
  status?: EngagementStatus
  vendor_id?: string
  search?: string
}

// ─── Queries ──────────────────────────────────────────────────────────────────

export function useEngagements(filters?: EngagementFilters) {
  return useQuery({
    queryKey: ["engagements", filters],
    queryFn: async () => {
      let query = supabase
        .from("engagements")
        .select(SELECT_FIELDS)
        .order("created_at", { ascending: false })

      if (filters?.status)    query = query.eq("status", filters.status)
      if (filters?.vendor_id) query = query.eq("vendor_id", filters.vendor_id)
      if (filters?.search)    query = query.ilike("title", `%${filters.search}%`)

      const { data, error } = await query
      if (error) throw error
      return data as Engagement[]
    },
  })
}

export function useEngagement(id: string) {
  return useQuery({
    queryKey: ["engagements", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("engagements")
        .select(SELECT_FIELDS)
        .eq("id", id)
        .single()
      if (error) throw error
      return data as Engagement
    },
    enabled: !!id,
  })
}

// ─── Mutations ────────────────────────────────────────────────────────────────

type CreateEngagementInput = Pick<
  Engagement,
  "title" | "description" | "vendor_id" | "category_id" |
  "estimated_value" | "currency" | "start_date" | "end_date" | "notes"
>

export function useCreateEngagement() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: CreateEngagementInput) => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error("Not authenticated")

      const { data, error } = await supabase
        .from("engagements")
        .insert({ ...input, created_by: user.id })
        .select()
        .single()
      if (error) throw error
      return data as Engagement
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["engagements"] })
      toast.success("Engagement created")
    },
    onError: () => toast.error("Failed to create engagement"),
  })
}

export function useUpdateEngagementStatus() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      id,
      status,
      notes,
    }: {
      id: string
      status: EngagementStatus
      notes?: string
    }) => {
      const { data: { user } } = await supabase.auth.getUser()
      const update: Partial<Engagement> = { status, notes: notes ?? null }

      if (status === "approved") {
        update.approved_by  = user?.id ?? null
        update.approved_at = new Date().toISOString()
      }

      const { data, error } = await supabase
        .from("engagements")
        .update(update)
        .eq("id", id)
        .select()
        .single()
      if (error) throw error
      return data as Engagement
    },
    onSuccess: (_, { id, status }) => {
      queryClient.invalidateQueries({ queryKey: ["engagements"] })
      queryClient.invalidateQueries({ queryKey: ["engagements", id] })
      toast.success(`Engagement ${status}`)
    },
    onError: () => toast.error("Failed to update engagement"),
  })
}

export function useUpdateEngagement() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, ...input }: Partial<CreateEngagementInput> & { id: string }) => {
      const { data, error } = await supabase
        .from("engagements")
        .update(input)
        .eq("id", id)
        .select()
        .single()
      if (error) throw error
      return data as Engagement
    },
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ["engagements"] })
      queryClient.invalidateQueries({ queryKey: ["engagements", id] })
      toast.success("Engagement updated")
    },
    onError: () => toast.error("Failed to update engagement"),
  })
}
