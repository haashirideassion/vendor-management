import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { api } from "@/lib/api"
import { useAuth } from "@/contexts/AuthContext"
import { useOrg } from "@/contexts/OrgContext"
import type { OrgOnboardingDraft, OrgOnboardingLocation, OrgOnboardingDocumentType } from "@/lib/types"

// The org's own onboarding draft (profile, locations, documents, signatory).
// Autosaved per step to the backend, unlike vendor onboarding's
// sessionStorage-only draft (OnboardingWizard.tsx) -- only the initiating
// admin can resume/edit it, enforced server-side (see orgOnboarding.ts).
// Query key is scoped by active org id since the draft is per-organization.

function draftKey(orgId: string | undefined) {
  return ["org-onboarding-draft", orgId]
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.readAsDataURL(file)
    reader.onload = () => resolve((reader.result as string).split(",")[1])
    reader.onerror = reject
  })
}

export function useOrgOnboardingDraft() {
  const { accessToken } = useAuth()
  const { activeOrg } = useOrg()
  return useQuery({
    queryKey: draftKey(activeOrg?.id),
    enabled: !!activeOrg,
    queryFn: async () => {
      const { data } = await api.post<{ data: OrgOnboardingDraft | null }>("/api/org-onboarding/get", {}, accessToken)
      return data
    },
  })
}

// Read-only view of the org's onboarding draft for the org's Profile page --
// any Admin can see this (unlike useOrgOnboardingDraft/`/get`, which is
// restricted to whichever admin originally started the draft, to prevent
// concurrent-edit conflicts in the wizard itself).
export function useOrgOnboardingSummary() {
  const { accessToken } = useAuth()
  const { activeOrg } = useOrg()
  return useQuery({
    queryKey: ["org-onboarding-summary", activeOrg?.id],
    enabled: !!activeOrg,
    queryFn: async () => {
      const { data } = await api.post<{ data: OrgOnboardingDraft | null }>("/api/org-onboarding/summary", {}, accessToken)
      return data
    },
  })
}

export function useStartOrgOnboarding() {
  const qc = useQueryClient()
  const { accessToken } = useAuth()
  const { activeOrg } = useOrg()
  return useMutation({
    mutationFn: async () => {
      const { data } = await api.post<{ data: OrgOnboardingDraft }>("/api/org-onboarding/start", {}, accessToken)
      return data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: draftKey(activeOrg?.id) }),
  })
}

export function useSaveOrgOnboardingStep() {
  const qc = useQueryClient()
  const { accessToken } = useAuth()
  const { activeOrg } = useOrg()
  return useMutation({
    mutationFn: async (input: { step: number; fields: Record<string, unknown> }) => {
      const { data } = await api.post<{ data: OrgOnboardingDraft }>("/api/org-onboarding/save-step", input, accessToken)
      return data
    },
    onSuccess: (data) => {
      qc.setQueryData(draftKey(activeOrg?.id), (prev: OrgOnboardingDraft | null | undefined) =>
        prev ? { ...prev, ...data } : data
      )
    },
  })
}

export function useUpsertOrgOnboardingLocation() {
  const qc = useQueryClient()
  const { accessToken } = useAuth()
  const { activeOrg } = useOrg()
  return useMutation({
    mutationFn: async (input: { id?: string } & Partial<OrgOnboardingLocation>) => {
      const { data } = await api.post<{ data: OrgOnboardingLocation }>("/api/org-onboarding/locations/upsert", input, accessToken)
      return data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: draftKey(activeOrg?.id) }),
  })
}

export function useDeleteOrgOnboardingLocation() {
  const qc = useQueryClient()
  const { accessToken } = useAuth()
  const { activeOrg } = useOrg()
  return useMutation({
    mutationFn: async (id: string) => {
      await api.post("/api/org-onboarding/locations/delete", { id }, accessToken)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: draftKey(activeOrg?.id) }),
  })
}

export function useUploadOrgOnboardingDocument() {
  const qc = useQueryClient()
  const { accessToken } = useAuth()
  const { activeOrg } = useOrg()
  return useMutation({
    mutationFn: async (input: { document_type: OrgOnboardingDocumentType; file: File }) => {
      const base64 = await fileToBase64(input.file)
      const { data } = await api.post<{ data: unknown }>(
        "/api/org-onboarding/documents/upload",
        { document_type: input.document_type, file_name: input.file.name, file_data: base64 },
        accessToken
      )
      return data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: draftKey(activeOrg?.id) }),
  })
}

export function useDeleteOrgOnboardingDocument() {
  const qc = useQueryClient()
  const { accessToken } = useAuth()
  const { activeOrg } = useOrg()
  return useMutation({
    mutationFn: async (id: string) => {
      await api.post("/api/org-onboarding/documents/delete", { id }, accessToken)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: draftKey(activeOrg?.id) }),
  })
}

export function useSubmitOrgOnboarding() {
  const qc = useQueryClient()
  const { accessToken } = useAuth()
  const { activeOrg } = useOrg()
  return useMutation({
    mutationFn: async () => {
      const { data } = await api.post<{ data: OrgOnboardingDraft }>("/api/org-onboarding/submit", {}, accessToken)
      return data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: draftKey(activeOrg?.id) }),
  })
}
