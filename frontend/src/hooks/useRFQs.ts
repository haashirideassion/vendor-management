import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { api } from "@/lib/api"
import { useAuth } from "@/contexts/AuthContext"
import type { RFQ, RFQStatus } from "@/lib/types"

export function useVendorRFQs() {
  const { accessToken } = useAuth()

  return useQuery({
    queryKey: ["rfqs", "vendor"],
    queryFn: async () => {
      const { data } = await api.post<{ data: RFQ[] }>(
        "/api/rfqs/vendor-list",
        {},
        accessToken
      )
      return data
    },
  })
}

export function useRFQ(id: string | undefined) {
  const { accessToken } = useAuth()

  return useQuery({
    queryKey: ["rfqs", id],
    enabled: !!id,
    queryFn: async () => {
      const { data } = await api.post<{ data: RFQ }>(
        "/api/rfqs/get",
        { id },
        accessToken
      )
      return data
    },
  })
}

export function useEngagementRFQs(engagementId: string | undefined) {
  const { accessToken } = useAuth()

  return useQuery({
    queryKey: ["rfqs", "engagement", engagementId],
    enabled: !!engagementId,
    queryFn: async () => {
      const { data } = await api.post<{ data: RFQ[] }>(
        "/api/rfqs/by-engagement",
        { engagementId },
        accessToken
      )
      return data
    },
  })
}

export function useUpdateRFQStatus() {
  const queryClient = useQueryClient()
  const { accessToken } = useAuth()

  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: RFQStatus }) => {
      const { data } = await api.post<{ data: RFQ }>(
        "/api/rfqs/update-status",
        { id, status },
        accessToken
      )
      return data
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["rfqs"] })
      queryClient.invalidateQueries({ queryKey: ["rfqs", data.id] })
    },
    onError: () => toast.error("Failed to update RFQ status"),
  })
}
