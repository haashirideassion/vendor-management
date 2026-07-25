import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { api } from "@/lib/api"
import { useAuth } from "@/contexts/AuthContext"

export interface PlatformUser {
  id: string
  email: string
  fullName: string
  role: string
  accountType: "internal" | "vendor"
  createdAt: string
  isPlatformAdmin: boolean
  isSuspended: boolean
}

const QUERY_KEY = ["platform-users"]

export function usePlatformUsers() {
  const { accessToken } = useAuth()
  return useQuery({
    queryKey: QUERY_KEY,
    queryFn: async () => {
      const { data } = await api.post<{ data: PlatformUser[] }>("/api/superadmin/users/list", {}, accessToken)
      return data
    },
  })
}

function useUserMutation(path: string) {
  const qc = useQueryClient()
  const { accessToken } = useAuth()
  return useMutation({
    mutationFn: async (userId: string) => {
      const { data } = await api.post<{ data: unknown }>(path, { userId }, accessToken)
      return data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: QUERY_KEY }),
  })
}

export const useSuspendUser = () => useUserMutation("/api/superadmin/users/suspend")
export const useReactivateUser = () => useUserMutation("/api/superadmin/users/reactivate")
export const useForceReauth = () => useUserMutation("/api/superadmin/users/force-reauth")
export const useGrantPlatformAdmin = () => useUserMutation("/api/superadmin/users/grant-platform-admin")
export const useRevokePlatformAdmin = () => useUserMutation("/api/superadmin/users/revoke-platform-admin")

export function useUpdateUser() {
  const qc = useQueryClient()
  const { accessToken } = useAuth()
  return useMutation({
    mutationFn: async (input: { userId: string; fullName?: string; role?: string }) => {
      const { data } = await api.post<{ data: unknown }>("/api/superadmin/users/update", input, accessToken)
      return data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: QUERY_KEY }),
  })
}
