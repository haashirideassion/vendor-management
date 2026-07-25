import { useMutation } from "@tanstack/react-query"
import { api } from "@/lib/api"
import { useAuth } from "@/contexts/AuthContext"
import type { Profile } from "@/lib/types"

export function useUpdateMyProfile() {
  const { accessToken, refreshProfile } = useAuth()

  return useMutation({
    mutationFn: async (input: { fullName: string; mobile: string }) => {
      const { data } = await api.post<{ data: Profile }>(
        "/api/auth/update-my-profile", { fullName: input.fullName, mobile: input.mobile }, accessToken
      )
      return data
    },
    onSuccess: () => refreshProfile(),
  })
}
