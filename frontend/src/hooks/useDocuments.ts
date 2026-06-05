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

export function useUploadDocument() {
  const qc = useQueryClient()
  const { accessToken } = useAuth()

  return useMutation({
    mutationFn: async ({
      vendorId,
      file,
      documentType,
      expiresAt,
    }: {
      vendorId: string
      file: File
      documentType: DocumentType
      expiresAt?: string
    }) => {
      const ext = file.name.split(".").pop()
      const storagePath = `${vendorId}/${documentType}_${Date.now()}.${ext}`

      const { error: uploadError } = await supabase.storage
        .from("vendor-documents")
        .upload(storagePath, file, { upsert: false })
      if (uploadError) throw uploadError

      const { data } = await api.post<{ data: VendorDocument }>(
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
      return data as VendorDocument
    },
    onSuccess: (_data, vars) => {
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

export function useDocumentSignedUrl() {
  return async (storagePath: string): Promise<string> => {
    const { data, error } = await supabase.storage
      .from("vendor-documents")
      .createSignedUrl(storagePath, 300) // 5 min expiry
    if (error) throw error
    return data.signedUrl
  }
}
