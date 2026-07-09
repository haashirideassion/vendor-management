import { Router, Request, Response } from "express"
import multer from "multer"
import { getSupabaseAdmin } from "../utils/supabaseAdmin"
import { requireAuth, AuthenticatedRequest } from "../middleware/auth"

const router = Router()
function db(): any { return getSupabaseAdmin() }

// Configure multer for file uploads (max 50MB)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
})

// Middleware that allows both multipart and JSON
const uploadOptional = (req: Request, res: Response, next: any) => {
  const contentType = req.headers['content-type'] || ''
  if (contentType.includes('multipart/form-data')) {
    upload.single("file")(req, res, next)
  } else {
    next()
  }
}

// MIME type mapping for common file extensions
const getMimeType = (fileName: string): string => {
  const ext = fileName.split(".").pop()?.toLowerCase() || ""
  const mimeMap: { [key: string]: string } = {
    pdf: "application/pdf",
    doc: "application/msword",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    xls: "application/vnd.ms-excel",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ppt: "application/vnd.ms-powerpoint",
    pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    txt: "text/plain",
    csv: "text/csv",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    gif: "image/gif",
    webp: "image/webp",
    zip: "application/zip",
    rar: "application/x-rar-compressed",
    "7z": "application/x-7z-compressed",
  }
  return mimeMap[ext] || "application/octet-stream"
}

// POST /api/vendors/list
router.post("/list", requireAuth, async (req: Request, res: Response) => {
  try {
    const { status, category, search } = req.body

    let vendorIds: string[] | null = null

    if (category) {
      const { data: catRows, error: catErr } = await db()
        .from("vendor_categories")
        .select("vendor_id")
        .eq("category_id", category)

      if (catErr) throw catErr

      vendorIds = (catRows ?? []).map((r: any) => r.vendor_id)
      if (vendorIds!.length === 0) {
        return res.json({ data: [] })
      }
    }

    let query = db()
      .from("vendors")
      .select("*, vendor_categories(*, service_categories(*)), vendor_ratings(score)")
      .order("created_at", { ascending: false })

    if (vendorIds !== null) {
      query = query.in("id", vendorIds)
    }
    if (status) {
      query = query.eq("status", status)
    }
    if (search) {
      query = query.or(
        `company_name.ilike.%${search}%,contact_email.ilike.%${search}%,vendor_id_code.ilike.%${search}%`
      )
    }

    const { data, error } = await query

    if (error) throw error

    const vendors = (data ?? []).map((v: any) => {
      const ratings: any[] = v.vendor_ratings ?? []
      const avg_rating =
        ratings.length > 0
          ? ratings.reduce((sum: number, r: any) => sum + (r.score ?? 0), 0) / ratings.length
          : null
      return { ...v, avg_rating }
    })

    res.json({ data: vendors })
  } catch (err: any) {
    console.error("[vendors/list]", err.message)
    res.status(500).json({ error: "Failed to list vendors" })
  }
})

// POST /api/vendors/get
router.post("/get", requireAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.body
    if (!id) return res.status(400).json({ error: "id is required" })

    const { data, error } = await db()
      .from("vendors")
      .select(
        "*, vendor_categories(*, service_categories(*)), vendor_services(*), vendor_documents(*), vendor_ratings(*, profiles(full_name, email))"
      )
      .eq("id", id)
      .single()

    if (error) throw error

    const ratings: any[] = data?.vendor_ratings ?? []
    const avg_rating =
      ratings.length > 0
        ? ratings.reduce((sum: number, r: any) => sum + (r.score ?? 0), 0) / ratings.length
        : null

    res.json({ data: { ...data, avg_rating } })
  } catch (err: any) {
    console.error("[vendors/get]", err.message)
    res.status(500).json({ error: "Failed to get vendor" })
  }
})

// POST /api/vendors/get-my-vendor
router.post("/get-my-vendor", requireAuth, async (req: Request, res: Response) => {
  try {
    const { profileId } = req.body
    if (!profileId) return res.status(400).json({ error: "profileId is required" })

    const { data, error } = await db()
      .from("vendors")
      .select(
        "*, vendor_categories(*, service_categories(*)), vendor_services(*), vendor_documents(*), vendor_ratings(*, profiles(full_name, email))"
      )
      .eq("profile_id", profileId)
      .maybeSingle()

    if (error) throw error

    if (!data) return res.json({ data: null })

    const ratings: any[] = data.vendor_ratings ?? []
    const avg_rating =
      ratings.length > 0
        ? ratings.reduce((sum: number, r: any) => sum + (r.score ?? 0), 0) / ratings.length
        : null

    res.json({ data: { ...data, avg_rating } })
  } catch (err: any) {
    console.error("[vendors/get-my-vendor]", err.message)
    res.status(500).json({ error: "Failed to get vendor" })
  }
})

// POST /api/vendors/update-status
router.post("/update-status", requireAuth, async (req: Request, res: Response) => {
  try {
    const { id, status, admin_notes } = req.body
    if (!id || !status) return res.status(400).json({ error: "id and status are required" })

    const updates: any = { status }
    if (admin_notes !== undefined) updates.admin_notes = admin_notes

    const { data, error } = await db()
      .from("vendors")
      .update(updates)
      .eq("id", id)
      .select()
      .single()

    if (error) throw error

    res.json({ data })
  } catch (err: any) {
    console.error("[vendors/update-status]", err.message)
    res.status(500).json({ error: "Failed to update vendor status" })
  }
})

// POST /api/vendors/update
router.post("/update", requireAuth, async (req: Request, res: Response) => {
  try {
    const { profileId, ...fields } = req.body
    if (!profileId) return res.status(400).json({ error: "profileId is required" })

    const { data, error } = await db()
      .from("vendors")
      .update(fields)
      .eq("profile_id", profileId)
      .select()
      .single()

    if (error) throw error

    res.json({ data })
  } catch (err: any) {
    console.error("[vendors/update]", err.message)
    res.status(500).json({ error: "Failed to update vendor" })
  }
})

// POST /api/vendors/update-categories
router.post("/update-categories", requireAuth, async (req: Request, res: Response) => {
  try {
    const { vendorId, categoryIds } = req.body
    if (!vendorId || !Array.isArray(categoryIds)) {
      return res.status(400).json({ error: "vendorId and categoryIds are required" })
    }

    const { error } = await db().rpc("update_vendor_categories", {
      p_vendor_id: vendorId,
      p_category_ids: categoryIds.length > 0 ? categoryIds : null,
    })

    if (error) throw error

    res.json({ ok: true })
  } catch (err: any) {
    console.error("[vendors/update-categories]", err.message)
    res.status(500).json({ error: "Failed to update vendor categories" })
  }
})

// POST /api/vendors/create
router.post("/create", requireAuth, async (req: Request, res: Response) => {
  const profileId = (req as AuthenticatedRequest).user.id
  try {
    const {
      company_name, contact_name, contact_email, contact_phone,
      tax_gst_number, bank_name, bank_account_number, bank_routing_number,
      category_ids,
    } = req.body

    if (!company_name || !contact_name || !contact_email) {
      return res.status(400).json({ error: "company_name, contact_name, and contact_email are required" })
    }

    // Check for existing vendor record for this profile
    const { data: existing } = await db()
      .from("vendors")
      .select("id, status")
      .eq("profile_id", profileId)
      .maybeSingle()

    if (existing) {
      // Idempotent: allow retrying onboarding if still pending_review
      if (existing.status === "pending_review") {
        return res.status(200).json({ data: { id: existing.id } })
      }
      return res.status(409).json({ error: "A vendor record already exists for this account" })
    }

    const { data: vendorId, error: vendorErr } = await db().rpc("create_vendor_with_categories", {
      p_profile_id: profileId,
      p_company_name: company_name,
      p_contact_name: contact_name,
      p_contact_email: contact_email,
      p_contact_phone: contact_phone || null,
      p_tax_gst_number: tax_gst_number || null,
      p_bank_name: bank_name || null,
      p_bank_account_number: bank_account_number || null,
      p_bank_routing_number: bank_routing_number || null,
      p_category_ids: Array.isArray(category_ids) && category_ids.length > 0 ? category_ids : null,
    })

    if (vendorErr) throw vendorErr

    return res.status(201).json({ data: { id: vendorId } })
  } catch (err: any) {
    console.error("[vendors/create] full error:", err)
    res.status(500).json({ error: "Failed to submit onboarding" })
  }
})

// POST /api/vendors/upload-document
// Supports both multipart/form-data and JSON with base64 file_data
router.post("/upload-document", requireAuth, uploadOptional, async (req: Request, res: Response) => {
  try {
    const { vendor_id, document_type, file_name, file_data } = req.body
    const file = (req as any).file

    console.log("[vendors/upload-document] Request body:", { vendor_id, document_type, file_name: file_name ? "present" : "missing", file_data: file_data ? "present" : "missing", file: file ? "present" : "missing" })

    // Validate inputs
    if (!vendor_id || !document_type) {
      return res.status(400).json({ error: "vendor_id and document_type are required" })
    }

    let buffer: Buffer
    let originalFileName: string
    let mimeType: string

    // Handle multipart file upload
    if (file) {
      console.log("[vendors/upload-document] Using multipart file upload")
      buffer = file.buffer
      originalFileName = file.originalname
      mimeType = file.mimetype
    }
    // Handle base64 JSON format (legacy)
    else if (file_data && file_name) {
      console.log("[vendors/upload-document] Using base64 JSON format")
      buffer = Buffer.from(file_data, "base64")
      originalFileName = file_name
      mimeType = getMimeType(file_name)
    }
    // Missing both formats
    else {
      return res.status(400).json({ error: "Either file (multipart) or file_data (base64) is required" })
    }

    const ext = (originalFileName.split(".").pop() ?? "bin").toLowerCase()
    const storagePath = `vendor-documents/${vendor_id}/${document_type}_${Date.now()}.${ext}`

    console.log("[vendors/upload-document] Uploading to storage path:", storagePath, "with mime type:", mimeType)

    const { error: uploadError } = await db()
      .storage
      .from("vendor-documents")
      .upload(storagePath, buffer, {
        contentType: mimeType,
      })

    if (uploadError) {
      console.error("[vendors/upload-document] Storage upload error:", uploadError)
      throw uploadError
    }

    console.log("[vendors/upload-document] Storage upload successful, inserting record")

    const { error: insertError } = await db()
      .from("vendor_documents")
      .insert({ vendor_id, document_type, file_name: originalFileName, storage_path: storagePath })

    if (insertError) {
      console.error("[vendors/upload-document] Database insert error:", insertError)
      throw insertError
    }

    console.log("[vendors/upload-document] Success")
    res.json({ ok: true, storage_path: storagePath })
  } catch (err: any) {
    console.error("[vendors/upload-document] Full error:", err)
    res.status(500).json({ error: "Failed to upload document: " + err.message })
  }
})

// POST /api/vendors/cancel-onboarding
// Deletes a pending_review vendor record owned by the authenticated user (used for rollback).
router.post("/cancel-onboarding", requireAuth, async (req: Request, res: Response) => {
  const profileId = (req as AuthenticatedRequest).user.id
  try {
    const { vendor_id } = req.body
    if (!vendor_id) return res.status(400).json({ error: "vendor_id is required" })

    const { error } = await db()
      .from("vendors")
      .delete()
      .eq("id", vendor_id)
      .eq("profile_id", profileId)
      .eq("status", "pending_review")

    if (error) throw error

    res.json({ ok: true })
  } catch (err: any) {
    console.error("[vendors/cancel-onboarding]", err.message)
    res.status(500).json({ error: "Failed to cancel onboarding" })
  }
})

// POST /api/vendors/by-categories
router.post("/by-categories", requireAuth, async (req: Request, res: Response) => {
  try {
    const { categoryIds } = req.body
    if (!Array.isArray(categoryIds) || categoryIds.length === 0) {
      return res.status(400).json({ error: "categoryIds is required and must be a non-empty array" })
    }

    const { data: catRows, error: catErr } = await db()
      .from("vendor_categories")
      .select("vendor_id")
      .in("category_id", categoryIds)

    if (catErr) throw catErr

    const vendorIds = [...new Set((catRows ?? []).map((r: any) => r.vendor_id))]

    if (vendorIds.length === 0) return res.json({ data: [] })

    const { data, error } = await db()
      .from("vendors")
      .select("id, company_name, contact_name")
      .in("id", vendorIds)
      .eq("status", "active")
      .order("company_name", { ascending: true })

    if (error) throw error

    res.json({ data })
  } catch (err: any) {
    console.error("[vendors/by-categories]", err.message)
    res.status(500).json({ error: "Failed to get vendors by categories" })
  }
})

export default router
