import { useMutation } from "@tanstack/react-query"
import { api } from "@/lib/api"
import { useAuth } from "@/contexts/AuthContext"

export const BREAK_GLASS_ENTITY_TYPES = ["purchase_request", "purchase_order", "grn", "invoice", "contract", "quotation"] as const
export type BreakGlassEntityType = (typeof BREAK_GLASS_ENTITY_TYPES)[number]

export function useBreakGlassView() {
  const { accessToken } = useAuth()
  return useMutation({
    mutationFn: async (input: { entityType: BreakGlassEntityType; entityId: string; reason: string }) => {
      const { data } = await api.post<{ data: Record<string, unknown> }>("/api/superadmin/break-glass/view", input, accessToken)
      return data
    },
  })
}
