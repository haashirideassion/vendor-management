import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { supabase } from "@/lib/supabase"
import { api } from "@/lib/api"
import { useAuth } from "@/contexts/AuthContext"
import type { VendorDocument, DocumentType } from "@/lib/types"

export function useDocuments(vendorId: string | undefined) {
  const { accessToken } = useAuth()

  return useQuery({
    queryKey: ["documents", vendorId],
    enabled: !!vendorId,
    queryFn: async () => {
      const { data } = await api.post<{ data: VendorDocument[] }>(
        "/api/documents/by-vendor",
        { vendorId },
        accessToken
      )
      return data as VendorDocument[]
    },
  })
}

export interface UploadDocumentResult {
  uploaded: string[]
  failed:   string[]
}

export function useUploadDocument() {
  const qc = useQueryClient()
  const { accessToken } = useAuth()

  return useMutation({
    mutationFn: async ({
      vendorId,
      files,
      documentType,
      expiresAt,
    }: {
      vendorId: string
      files: File[]
      documentType: DocumentType
      expiresAt?: string
    }): Promise<UploadDocumentResult> => {
      const result: UploadDocumentResult = { uploaded: [], failed: [] }

      for (const file of files) {
        const ext = file.name.split(".").pop()
        // crypto.randomUUID() (not just Date.now()) keeps this collision-proof
        // when several files of the same document_type are uploaded together.
        const storagePath = `${vendorId}/${documentType}_${Date.now()}_${crypto.randomUUID().slice(0, 8)}.${ext}`

        const { error: uploadError } = await supabase.storage
          .from("vendor-documents")
          .upload(storagePath, file, { upsert: false })
        if (uploadError) {
          result.failed.push(file.name)
          continue
        }

        try {
          await api.post<{ data: VendorDocument }>(
            "/api/documents/create",
            {
              vendor_id: vendorId,
              document_type: documentType,
              file_name: file.name,
              storage_path: storagePath,
              expires_at: expiresAt ?? null,
            },
            accessToken
          )
          result.uploaded.push(file.name)
        } catch {
          await supabase.storage.from("vendor-documents").remove([storagePath])
          result.failed.push(file.name)
        }
      }

      return result
    },
    onSuccess: (_result, vars) => {
      qc.invalidateQueries({ queryKey: ["documents", vars.vendorId] })
      qc.invalidateQueries({ queryKey: ["vendor"] })
      qc.invalidateQueries({ queryKey: ["vendors"] })
    },
  })
}

export function useVerifyDocument() {
  const qc = useQueryClient()
  const { accessToken } = useAuth()

  return useMutation({
    mutationFn: async ({
      docId,
      verified,
      notes,
    }: {
      docId: string
      verified: boolean
      notes?: string
    }) => {
      const { data } = await api.post<{ data: VendorDocument }>(
        "/api/documents/verify",
        {
          id: docId,
          verified,
          verified_at: verified ? new Date().toISOString() : null,
          notes: notes ?? null,
        },
        accessToken
      )
      return data as VendorDocument
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["documents"] })
      qc.invalidateQueries({ queryKey: ["vendor"] })
      qc.invalidateQueries({ queryKey: ["vendors"] })
    },
  })
}

export function useOrgOnboardingDocumentSignedUrl() {
  return async (storagePath: string): Promise<string> => {
    const { data, error } = await supabase.storage
      .from("org-onboarding-documents")
      .createSignedUrl(storagePath, 300) // 5 min expiry
    if (error) throw error
    return data.signedUrl
  }
}

export function useDocumentSignedUrl() {
  return async (storagePath: string): Promise<string> => {
    const { data, error } = await supabase.storage
      .from("vendor-documents")
      .createSignedUrl(storagePath, 300) // 5 min expiry
    if (error) throw error
    return data.signedUrl
  }
}
