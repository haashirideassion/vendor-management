import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { api } from "@/lib/api"
import { useAuth } from "@/contexts/AuthContext"

export interface SuperadminVendorSummary { id: string; company_name: string }

export interface TenantModuleEntitlement {
  moduleCode: string
  label: string
  description: string | null
  enabled: boolean
  entitlementId: string | null
  setBy: string | null
  setAt: string | null
  notes: string | null
}

export type EntitlementScope = "org" | "vendor"

export function useSuperadminVendorsListAll() {
  const { accessToken } = useAuth()
  return useQuery({
    queryKey: ["superadmin-vendors-list-all"],
    queryFn: async () => {
      const { data } = await api.post<{ data: SuperadminVendorSummary[] }>("/api/superadmin/vendors/list-all", {}, accessToken)
      return data
    },
  })
}

export function useFeatureEntitlementTenantState(scope: EntitlementScope, tenantId: string | undefined) {
  const { accessToken } = useAuth()
  return useQuery({
    queryKey: ["feature-entitlements", scope, tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const body = scope === "org" ? { scope, orgId: tenantId } : { scope, vendorId: tenantId }
      const { data } = await api.post<{ data: TenantModuleEntitlement[] }>("/api/superadmin/feature-entitlements/tenant-state", body, accessToken)
      return data
    },
  })
}

export function useSetFeatureEntitlement() {
  const qc = useQueryClient()
  const { accessToken } = useAuth()
  return useMutation({
    mutationFn: async (input: { scope: EntitlementScope; tenantId: string; moduleCode: string; enabled: boolean; reason?: string }) => {
      const body = input.scope === "org"
        ? { scope: input.scope, orgId: input.tenantId, moduleCode: input.moduleCode, enabled: input.enabled, reason: input.reason }
        : { scope: input.scope, vendorId: input.tenantId, moduleCode: input.moduleCode, enabled: input.enabled, reason: input.reason }
      const { data } = await api.post<{ data: unknown }>("/api/superadmin/feature-entitlements/set", body, accessToken)
      return data
    },
    onSuccess: (_data, variables) => qc.invalidateQueries({ queryKey: ["feature-entitlements", variables.scope, variables.tenantId] }),
  })
}
