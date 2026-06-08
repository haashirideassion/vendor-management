import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { api } from "@/lib/api"
import { useAuth } from "@/contexts/AuthContext"
import type { RFQ, RFQStatus } from "@/lib/types"

export function useVendorRFQs() {
  const { accessToken } = useAuth()

  return useQuery({
    queryKey: ["rfqs", "vendor"],
    queryFn: () =>
      api.post<RFQ[]>("/api/rfqs/vendor-list", {}, accessToken),
  })
}

export function useRFQ(id: string | undefined) {
  const { accessToken } = useAuth()

  return useQuery({
    queryKey: ["rfqs", id],
    enabled: !!id,
    queryFn: () =>
      api.post<RFQ>("/api/rfqs/get", { id }, accessToken),
  })
}

export function useEngagementRFQs(engagementId: string | undefined) {
  const { accessToken } = useAuth()

  return useQuery({
    queryKey: ["rfqs", "engagement", engagementId],
    enabled: !!engagementId,
    queryFn: () =>
      api.post<RFQ[]>("/api/rfqs/by-engagement", { engagementId }, accessToken),
  })
}

export function useUpdateRFQStatus() {
  const queryClient = useQueryClient()
  const { accessToken } = useAuth()

  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: RFQStatus }) =>
      api.post<RFQ>("/api/rfqs/update-status", { id, status }, accessToken),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["rfqs"] })
      queryClient.invalidateQueries({ queryKey: ["rfqs", data.id] })
    },
    onError: () => toast.error("Failed to update RFQ status"),
  })
}
