import { useMutation, useQuery } from "@tanstack/react-query"
import { api } from "@/lib/api"
import { useAuth } from "@/contexts/AuthContext"

// Shared sessionStorage key: App.tsx writes it (captured from a `?invite=`
// URL param on first load, so it survives the signup -> login -> onboarding
// navigation chain regardless of entry point); OnboardingWizard.tsx reads
// and clears it once successfully resolved and applied to the draft.
export const VENDOR_INVITE_TOKEN_KEY = "vms_vendor_invite_token"

export interface VendorInviteLinkResolved {
  scope: "org" | "group"
  code: string
  name: string
}

// Generates a shareable vendor signup link carrying an org's or group's code
// as an opaque, expiring token -- see backend/src/routes/vendorInviteLinks.ts.
export function useCreateVendorInviteLink() {
  const { accessToken } = useAuth()
  return useMutation({
    mutationFn: async (input: { scope: "org" } | { scope: "group"; groupId: string }) => {
      const { data } = await api.post<{ data: { token: string; expiresAt: string } }>(
        "/api/vendor-invite-links/create", input, accessToken
      )
      return data
    },
  })
}

// Resolves an invite token (captured from a `?invite=` URL param at signup
// time, see App.tsx) into the org/group name+code the onboarding wizard
// should prefill and lock. `enabled` gate lets the wizard only call this
// once, when a stored token actually exists.
export function useResolveVendorInviteLink(token: string | null) {
  const { accessToken } = useAuth()
  return useQuery({
    queryKey: ["vendor-invite-link-resolve", token],
    enabled: !!token,
    retry: false,
    queryFn: async () => {
      const { data } = await api.post<{ data: VendorInviteLinkResolved }>(
        "/api/vendor-invite-links/resolve", { token }, accessToken
      )
      return data
    },
  })
}
