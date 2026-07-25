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
