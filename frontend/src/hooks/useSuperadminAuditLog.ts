import { useQuery } from "@tanstack/react-query"
import { api } from "@/lib/api"
import { useAuth } from "@/contexts/AuthContext"

export interface AuditLogFilters {
  orgId?: string
  entityType?: string
  entityId?: string
  action?: string
  performedBy?: string
  actingAs?: "group_admin" | "superadmin" | "none"
  dateFrom?: string
  dateTo?: string
}

export interface AuditLogRow {
  id: string
  entity_type: string
  entity_id: string
  action: string
  old_value: unknown
  new_value: unknown
  performed_by: string | null
  org_id: string | null
  acting_as: "group_admin" | "superadmin" | null
  created_at: string
  profiles: { full_name: string; email: string } | null
  organizations: { name: string } | null
}

export function useSuperadminAuditLog(filters: AuditLogFilters) {
  const { accessToken } = useAuth()
  return useQuery({
    queryKey: ["superadmin-audit-log", filters],
    queryFn: async () => {
      const { data } = await api.post<{ data: AuditLogRow[] }>("/api/superadmin/audit-log", filters, accessToken)
      return data
    },
  })
}
