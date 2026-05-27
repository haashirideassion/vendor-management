import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { supabase } from "@/lib/supabase"
import type { Engagement, EngagementLineItem, EngagementStatus } from "@/lib/types"

const SELECT_FIELDS = `
  *,
  vendor:vendor_id ( company_name, contact_name ),
  category:category_id ( name ),
  creator:created_by ( full_name, email ),
  line_items:engagement_line_items (*),
  engagement_vendors ( vendor:vendor_id ( id, company_name ) )
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

export interface CreateEngagementInput {
  title: string
  description?: string | null
  vendor_ids: string[]
  category_ids: string[]
  estimated_value?: number | null
  currency: string
  start_date?: string | null
  end_date?: string | null
  notes?: string | null
  line_items?: Omit<EngagementLineItem, "id" | "engagement_id" | "created_at">[]
}

export function useCreateEngagement() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: CreateEngagementInput) => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error("Not authenticated")

      const { data: eng, error: engError } = await supabase
        .from("engagements")
        .insert({
          title:           input.title,
          description:     input.description ?? null,
          vendor_id:       null,
          category_id:     input.category_ids[0] ?? null,
          estimated_value: input.estimated_value ?? null,
          currency:        input.currency,
          start_date:      input.start_date ?? null,
          end_date:        input.end_date ?? null,
          notes:           input.notes ?? null,
          created_by:      user.id,
        })
        .select()
        .single()
      if (engError) throw engError

      if (input.line_items && input.line_items.length > 0) {
        const { error: liError } = await supabase
          .from("engagement_line_items")
          .insert(input.line_items.map((li) => ({ ...li, engagement_id: eng.id })))
        if (liError) throw liError
      }

      if (input.vendor_ids.length > 0) {
        const { error: evError } = await supabase
          .from("engagement_vendors")
          .insert(input.vendor_ids.map((vid) => ({ engagement_id: eng.id, vendor_id: vid })))
        if (evError) throw evError

        const { error: rfqError } = await supabase
          .from("rfqs")
          .upsert(
            input.vendor_ids.map((vid) => ({ engagement_id: eng.id, vendor_id: vid, status: "pending" as const })),
            { onConflict: "engagement_id,vendor_id", ignoreDuplicates: true }
          )
        if (rfqError) throw rfqError
      }

      const { error: approvalError } = await supabase.from("approval_requests").insert({
        entity_type:  "engagement",
        entity_id:    eng.id,
        requested_by: user.id,
        amount:       input.estimated_value ?? null,
        notes:        null,
      })
      if (approvalError) throw approvalError

      const { error: statusError } = await supabase
        .from("engagements")
        .update({ status: "pending_approval" })
        .eq("id", eng.id)
      if (statusError) throw statusError

      return eng as Engagement
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["engagements"] })
      queryClient.invalidateQueries({ queryKey: ["rfqs"] })
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
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ["engagements"] })
      queryClient.invalidateQueries({ queryKey: ["engagements", id] })
    },
    onError: () => toast.error("Failed to update engagement status"),
  })
}

type UpdateEngagementInput = Partial<Pick<Engagement,
  "title" | "description" | "vendor_id" | "category_id" |
  "estimated_value" | "currency" | "start_date" | "end_date" | "notes"
>>

export function useUpdateEngagement() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, ...input }: UpdateEngagementInput & { id: string }) => {
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
