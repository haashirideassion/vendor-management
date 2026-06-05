import { useQuery } from "@tanstack/react-query"
import { api } from "@/lib/api"
import { useAuth } from "@/contexts/AuthContext"
import type { AuditLog } from "@/lib/types"

export function useAuditLog(vendorId?: string) {
  const { accessToken } = useAuth()

  return useQuery({
    queryKey: ["audit_log", vendorId],
    queryFn: async () => {
      const { data } = await api.post<{ data: AuditLog[] }>(
        "/api/audit-log/list",
        { entityId: vendorId },
        accessToken
      )
      return data as AuditLog[]
    },
  })
}
