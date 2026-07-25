import { useMutation, useQueryClient } from "@tanstack/react-query"
import { api } from "@/lib/api"
import { useAuth } from "@/contexts/AuthContext"
import type { OrgOnboardingDraft } from "@/lib/types"

// Superadmin-side review action for organisation onboarding submissions --
// distinct from useVendorVerificationQueue.ts (vendors' own, separate,
// verification_status/organization_vendors machinery). The queue/detail
// fetches this used to back a standalone "Org Onboarding" tab, now folded
// into OrgDetailDialog.tsx (which gets the draft embedded in
// usePlatformOrganizationDetail's response instead of fetching separately).

export function useReviewOrgOnboarding() {
  const qc = useQueryClient()
  const { accessToken } = useAuth()
  return useMutation({
    mutationFn: async (input: { draft_id: string; decision: "approved" | "rejected"; reason?: string }) => {
      const { data } = await api.post<{ data: OrgOnboardingDraft }>(
        "/api/superadmin/organizations/onboarding-review", input, accessToken
      )
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["platform-organizations"] })
      qc.invalidateQueries({ queryKey: ["platform-organization-detail"] })
    },
  })
}
