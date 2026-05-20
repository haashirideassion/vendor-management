import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { supabase } from "@/lib/supabase"
import type { RFQ, RFQStatus } from "@/lib/types"

const SELECT_FIELDS = `
  *,
  engagement:engagement_id ( title, description, start_date, end_date, estimated_value, currency ),
  vendor:vendor_id ( company_name )
`

export function useVendorRFQs() {
  return useQuery({
    queryKey: ["rfqs", "vendor"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("rfqs")
        .select(SELECT_FIELDS)
        .order("created_at", { ascending: false })
      if (error) throw error
      return data as RFQ[]
    },
  })
}

export function useRFQ(id: string | undefined) {
  return useQuery({
    queryKey: ["rfqs", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("rfqs")
        .select(SELECT_FIELDS)
        .eq("id", id!)
        .single()
      if (error) throw error
      return data as RFQ
    },
  })
}

export function useEngagementRFQs(engagementId: string | undefined) {
  return useQuery({
    queryKey: ["rfqs", "engagement", engagementId],
    enabled: !!engagementId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("rfqs")
        .select(SELECT_FIELDS)
        .eq("engagement_id", engagementId!)
        .order("created_at", { ascending: false })
      if (error) throw error
      return data as RFQ[]
    },
  })
}

export function useUpdateRFQStatus() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: RFQStatus }) => {
      const { data, error } = await supabase
        .from("rfqs")
        .update({ status })
        .eq("id", id)
        .select()
        .single()
      if (error) throw error
      return data as RFQ
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["rfqs"] })
      queryClient.invalidateQueries({ queryKey: ["rfqs", data.id] })
    },
    onError: () => toast.error("Failed to update RFQ status"),
  })
}
