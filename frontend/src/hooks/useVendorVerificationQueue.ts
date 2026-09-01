import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { api } from "@/lib/api"
import { useAuth } from "@/contexts/AuthContext"

export interface VerificationQueueDocument {
  id: string
  document_type: string
  file_name: string
  storage_path: string
  uploaded_at: string
}

export interface VerificationQueueVendor {
  id: string
  companyLegalName: string
  gstNumber: string | null
  panNumber: string | null
  registrationNumber: string | null
  submittedAt: string
  verificationStatus: "pending" | "verified" | "rejected"
  registrationDocuments: VerificationQueueDocument[]
  categories: string[]
}

const QUERY_KEY = ["vendor-verification-queue"]

export function useVendorVerificationQueue() {
  const { accessToken } = useAuth()
  return useQuery({
    queryKey: QUERY_KEY,
    queryFn: async () => {
      const { data } = await api.post<{ data: VerificationQueueVendor[] }>(
        "/api/superadmin/vendors/verification-queue", {}, accessToken
      )
      return data
    },
  })
}

export interface VendorOrganizationMapping {
  orgId: string
  orgName: string
  orgCode: string | null
  orgStatus: string
  mappingStatus: string
  contractStartDate: string | null
  contractAnniversary: string | null
}

// Deliberately a separate query/endpoint from the verification queue above --
// only fetched once the "Organizations" tab is opened, so the blind-review
// queue payload never carries org/reach data by default.
export function useVendorOrganizations(vendorId: string | undefined, enabled: boolean) {
  const { accessToken } = useAuth()
  return useQuery({
    queryKey: ["vendor-organizations", vendorId],
    queryFn: async () => {
      const { data } = await api.post<{ data: VendorOrganizationMapping[] }>(
        "/api/superadmin/vendors/organizations", { vendor_id: vendorId }, accessToken
      )
      return data
    },
    enabled: enabled && !!vendorId,
  })
}

export function useSetVendorVerificationStatus() {
  const qc = useQueryClient()
  const { accessToken } = useAuth()
  return useMutation({
    mutationFn: async (input: { vendor_id: string; verification_status: "verified" | "rejected"; reason?: string }) => {
      const { data } = await api.post<{ data: unknown }>("/api/superadmin/vendors/verification-status", input, accessToken)
      return data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: QUERY_KEY }),
  })
}
