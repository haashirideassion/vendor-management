import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { supabase } from "@/lib/supabase"
import { api } from "@/lib/api"
import { useAuth } from "@/contexts/AuthContext"
import type { Attachment, AttachmentEntityType } from "@/lib/types"

// ─── Validation constants ─────────────────────────────────────────────────────

export const ALLOWED_EXTENSIONS = [".doc", ".docx", ".jpg", ".jpeg", ".pdf"] as const
export const ALLOWED_EXT_LABEL  = ".doc, .docx, .jpg, .jpeg, .pdf"
export const MAX_ATTACHMENT_SIZE = 20 * 1024 * 1024  // 20 MB

const ALLOWED_MIME_TYPES = new Set([
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "image/jpeg",
  "application/pdf",
])

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Returns an error message string, or null if the file is valid. */
export function validateFile(file: File): string | null {
  const ext = "." + (file.name.split(".").pop()?.toLowerCase() ?? "")
  if (!(ALLOWED_EXTENSIONS as readonly string[]).includes(ext))
    return `"${file.name}" — unsupported type (${ext || "no extension"})`
  if (!ALLOWED_MIME_TYPES.has(file.type))
    return `"${file.name}" — invalid MIME type`
  if (file.size > MAX_ATTACHMENT_SIZE)
    return `"${file.name}" — exceeds 20 MB limit`
  if (file.size === 0)
    return `"${file.name}" — file is empty`
  return null
}

/** Sanitise an original filename for safe storage and display. */
export function sanitizeFileName(name: string): string {
  return name
    .replace(/[^\w.\-]/g, "_")   // keep word chars, dots, dashes
    .replace(/_{2,}/g, "_")      // collapse consecutive underscores
    .slice(0, 200)
}

/** Build a collision-proof storage path inside the vendor-documents bucket. */
function buildStoragePath(entityType: AttachmentEntityType, entityId: string, file: File): string {
  const ext  = file.name.split(".").pop()?.toLowerCase() ?? "bin"
  const uid  = crypto.randomUUID()
  return `attachments/${entityType}/${entityId}/${uid}.${ext}`
}

// ─── Queries ──────────────────────────────────────────────────────────────────

export function useAttachments(
  entityType: AttachmentEntityType | undefined,
  entityId:   string | undefined
) {
  const { accessToken } = useAuth()

  return useQuery({
    queryKey: ["attachments", entityType, entityId],
    enabled:  !!entityType && !!entityId,
    retry:    false,
    queryFn:  async () => {
      try {
        return await api.post<Attachment[]>("/api/attachments/list", { entityType, entityId }, accessToken)
      } catch {
        return []
      }
    },
  })
}

// ─── Signed URL helper ────────────────────────────────────────────────────────

/** Generate a 5-minute signed URL for a storage path. Returns null on failure. */
export async function getAttachmentUrl(
  storagePath: string,
  forDownload = false
): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from("vendor-documents")
    .createSignedUrl(storagePath, 300, { download: forDownload })
  if (error || !data?.signedUrl) return null
  return data.signedUrl
}

// ─── Mutations ────────────────────────────────────────────────────────────────

export interface UploadAttachmentsInput {
  entityType: AttachmentEntityType
  entityId:   string
  files:      File[]
}

export interface UploadResult {
  uploaded: string[]
  failed:   string[]
}

export function useUploadAttachments() {
  const queryClient = useQueryClient()
  const { user, accessToken } = useAuth()

  return useMutation({
    mutationFn: async ({ entityType, entityId, files }: UploadAttachmentsInput): Promise<UploadResult> => {
      if (files.length === 0) return { uploaded: [], failed: [] }

      if (!user) throw new Error("Not authenticated")

      const result: UploadResult = { uploaded: [], failed: [] }

      for (const file of files) {
        // Client-side validation (double-check; FileUploadZone already validates)
        const validationError = validateFile(file)
        if (validationError) {
          result.failed.push(validationError)
          continue
        }

        const storagePath   = buildStoragePath(entityType, entityId, file)
        const sanitizedName = sanitizeFileName(file.name)
        const ext           = file.name.split(".").pop()?.toLowerCase() ?? ""

        // Upload to storage
        const { error: uploadErr } = await supabase.storage
          .from("vendor-documents")
          .upload(storagePath, file, { upsert: false, cacheControl: "3600" })

        if (uploadErr) {
          result.failed.push(`"${file.name}" — storage upload failed`)
          continue
        }

        // Insert metadata record via API
        try {
          await api.post(
            "/api/attachments/create",
            {
              entity_type:    entityType,
              entity_id:      entityId,
              file_name:      sanitizedName,
              original_name:  file.name,
              file_extension: ext,
              mime_type:      file.type,
              file_size:      file.size,
              storage_path:   storagePath,
              uploaded_by:    user.id,
            },
            accessToken
          )
        } catch {
          // Clean up orphaned storage file
          await supabase.storage.from("vendor-documents").remove([storagePath])
          result.failed.push(`"${file.name}" — failed to save record`)
          continue
        }

        result.uploaded.push(file.name)
      }

      return result
    },

    onSuccess: (result, { entityType, entityId }) => {
      queryClient.invalidateQueries({ queryKey: ["attachments", entityType, entityId] })

      if (result.failed.length > 0) {
        const n = result.failed.length
        toast.error(`${n} file${n !== 1 ? "s" : ""} failed to upload — check format and size`)
      }
    },

    onError: () => toast.error("Attachment upload failed"),
  })
}

export function useDeleteAttachment() {
  const queryClient = useQueryClient()
  const { accessToken } = useAuth()

  return useMutation({
    mutationFn: async ({
      id,
      storagePath,
      entityType,
      entityId,
    }: {
      id:          string
      storagePath: string
      entityType:  AttachmentEntityType
      entityId:    string
    }) => {
      // Soft-delete in DB via API
      await api.post("/api/attachments/delete", { id }, accessToken)

      // Remove from storage (best-effort — ignore failures)
      await supabase.storage.from("vendor-documents").remove([storagePath])

      return { entityType, entityId }
    },

    onSuccess: ({ entityType, entityId }) => {
      queryClient.invalidateQueries({ queryKey: ["attachments", entityType, entityId] })
    },

    onError: () => toast.error("Failed to remove attachment"),
  })
}
