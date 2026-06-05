import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { api } from "@/lib/api"
import { useAuth } from "@/contexts/AuthContext"
import type { Engagement, EngagementLineItem, EngagementStatus } from "@/lib/types"

// ─── Filters ──────────────────────────────────────────────────────────────────

export interface EngagementFilters {
  status?: EngagementStatus
  vendor_id?: string
  search?: string
}

// ─── Queries ──────────────────────────────────────────────────────────────────

export function useEngagements(filters?: EngagementFilters) {
  const { accessToken } = useAuth()

  return useQuery({
    queryKey: ["engagements", filters],
    queryFn: async () => {
      const { data } = await api.post<{ data: Engagement[] }>(
        "/api/engagements/list",
        {
          status:    filters?.status,
          vendor_id: filters?.vendor_id,
          search:    filters?.search,
        },
        accessToken
      )
      return data
    },
  })
}

export function useEngagement(id: string) {
  const { accessToken } = useAuth()

  return useQuery({
    queryKey: ["engagements", id],
    queryFn: async () => {
      const { data } = await api.post<{ data: Engagement }>(
        "/api/engagements/get",
        { id },
        accessToken
      )
      return data
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
  const { user, accessToken } = useAuth()

  return useMutation({
    mutationFn: async (input: CreateEngagementInput) => {
      if (!user) throw new Error("Not authenticated")

      const { data } = await api.post<{ data: Engagement }>(
        "/api/engagements/create",
        { ...input, created_by: user.id },
        accessToken
      )
      return data
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
  const { user, accessToken } = useAuth()

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
      const { data } = await api.post<{ data: Engagement }>(
        "/api/engagements/update-status",
        {
          id,
          status,
          notes,
          ...(status === "approved" ? { approved_by: user?.id } : {}),
        },
        accessToken
      )
      return data
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
  const { accessToken } = useAuth()

  return useMutation({
    mutationFn: async ({ id, ...input }: UpdateEngagementInput & { id: string }) => {
      const { data } = await api.post<{ data: Engagement }>(
        "/api/engagements/update",
        { id, ...input },
        accessToken
      )
      return data
    },
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ["engagements"] })
      queryClient.invalidateQueries({ queryKey: ["engagements", id] })
      toast.success("Engagement updated")
    },
    onError: () => toast.error("Failed to update engagement"),
  })
}
