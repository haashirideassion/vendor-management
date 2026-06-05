import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { api } from "@/lib/api"
import { useAuth } from "@/contexts/AuthContext"
import type { Notification } from "@/lib/types"

export function useAdminNotifications() {
  const { accessToken } = useAuth()

  return useQuery({
    queryKey: ["notifications"],
    queryFn: async () => {
      const { data } = await api.post<{ data: Notification[] }>(
        "/api/notifications/list",
        {},
        accessToken
      )
      return data ?? []
    },
    refetchInterval: 30_000,
  })
}

export function useMarkNotificationRead() {
  const qc = useQueryClient()
  const { accessToken } = useAuth()

  return useMutation({
    mutationFn: async (id: string) => {
      await api.post("/api/notifications/mark-read", { id }, accessToken)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  })
}

export function useMarkAllNotificationsRead() {
  const qc = useQueryClient()
  const { accessToken } = useAuth()

  return useMutation({
    mutationFn: async () => {
      await api.post("/api/notifications/mark-all-read", {}, accessToken)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  })
}
