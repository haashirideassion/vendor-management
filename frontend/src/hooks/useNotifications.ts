import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { api } from "@/lib/api"
import { useAuth } from "@/contexts/AuthContext"
import type { Notification } from "@/lib/types"

export function useAdminNotifications() {
  const { user, accessToken } = useAuth()

  return useQuery({
    queryKey: ["notifications", user?.id],
    enabled: !!user,
    queryFn: () =>
      api.post<Notification[]>("/api/notifications/list", {}, accessToken).then((d) => d ?? []),
    refetchInterval: 30_000,
  })
}

export function useMarkNotificationRead() {
  const qc = useQueryClient()
  const { user, accessToken } = useAuth()

  return useMutation({
    mutationFn: async (id: string) => {
      await api.post("/api/notifications/mark-read", { id }, accessToken)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications", user?.id] }),
  })
}

export function useMarkAllNotificationsRead() {
  const qc = useQueryClient()
  const { user, accessToken } = useAuth()

  return useMutation({
    mutationFn: async () => {
      await api.post("/api/notifications/mark-all-read", {}, accessToken)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications", user?.id] }),
  })
}
