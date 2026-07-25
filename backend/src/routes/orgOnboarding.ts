import { Router, Request, Response, NextFunction } from "express"
import multer from "multer"
import { getSupabaseAdmin } from "../utils/supabaseAdmin"
import { requireAuth, AuthenticatedRequest } from "../middleware/auth"
import { requireOrg, OrgScopedRequest } from "../middleware/org"
import { writeAudit } from "../services/audit"

const router = Router()
function db(): any { return getSupabaseAdmin() }

const ONBOARDING_PERMISSION = "organization.onboarding_manage"

// MIME type mapping for the base64 JSON upload path, mirroring vendors.ts's getMimeType.
function getMimeType(fileName: string): string {
  const ext = fileName.split(".").pop()?.toLowerCase() || ""
  const mimeMap: Record<string, string> = {
    pdf: "application/pdf",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  }
  return mimeMap[ext] || "application/octet-stream"
}

// A draft is "editable" while still being worked on (fresh, or reopened
// after a rejection) -- 'submitted'/'approved' drafts are frozen everywhere
// except the superadmin review route.
function isEditableStatus(status: string): boolean {
  return status === "draft" || status === "rejected"
}

async function hasOnboardingPermission(userId: string, orgId: string): Promise<boolean> {
  const { data } = await db().rpc("has_permission_as", { p_user_id: userId, p_org_id: orgId, p_key: ONBOARDING_PERMISSION })
  return data === true
}

// Never trust a client-supplied draft id -- resolved from (org_id, caller
// identity) only, mirroring resolveVendorId's pattern in middleware/org.ts.
// Returns null if no draft exists yet for this org; throws NotOwnerError if
// one exists but was started by a different admin (confirmed requirement:
// only the initiating admin may resume/edit).
class NotOwnerError extends Error {}

async function resolveOwnDraft(orgId: string, userId: string): Promise<any | null> {
  const { data: draft, error } = await db().from("org_onboarding_drafts").select("*").eq("org_id", orgId).maybeSingle()
  if (error) throw error
  if (!draft) return null
  if (draft.created_by !== userId) {
    throw new NotOwnerError("This organisation's onboarding was already started by another admin -- ask them to continue it")
  }
  return draft
}

function handleOwnershipError(err: unknown, res: Response): boolean {
  if (err instanceof NotOwnerError) {
    res.status(403).json({ error: err.message })
    return true
  }
  return false
}

// Configure multer for file uploads, mirroring vendors.ts's upload-document
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } })
const uploadOptional = (req: Request, res: Response, next: NextFunction) => {
  const contentType = req.headers["content-type"] || ""
  if (contentType.includes("multipart/form-data")) {
    upload.single("file")(req as any, res as any, next)
  } else {
    next()
  }
}

const ALLOWED_DOC_MIME_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
])
const MAX_DOC_SIZE_BYTES = 15 * 1024 * 1024 // 15MB, same limit as vendors.ts

const ALLOWED_ORG_DOC_TYPES = new Set([
  "certificate_of_incorporation",
  "pan_copy",
  "memorandum_of_association",
  "articles_of_association",
  "board_resolution",
  "bank_proof",
  "gst_certificate",
  "authorized_signatory_signature",
])

const REQUIRED_ORG_DOC_TYPES = [
  "certificate_of_incorporation",
  "pan_copy",
  "memorandum_of_association",
  "articles_of_association",
  "board_resolution",
  "bank_proof",
]

// Per-step whitelist of updatable draft columns -- the client never gets to
// write an arbitrary column (e.g. status, reviewed_by) through this route.
const STEP_FIELDS: Record<number, string[]> = {
  1: ["full_name", "designation", "work_email", "mobile", "accepted_terms", "is_solo_user"],
  2: ["legal_entity_type", "date_of_incorporation", "employee_count_range", "is_group_company", "group_code"],
  3: ["location_setup"],
  // Step 4 (locations) has no flat draft columns of its own -- locations
  // live in org_onboarding_locations via their own upsert/delete endpoints
  // -- but still needs an entry here so the wizard can ping save-step with
  // an empty fields object purely to advance current_step, the same way
  // every other step does, rather than only advancing client-side state.
  4: [],
  5: ["pan_number", "bank_name", "bank_account_number", "bank_ifsc"],
  6: ["signatory_name", "signatory_designation", "signatory_email", "signatory_mobile", "signatory_same_for_all_locations"],
}

const LOCATION_FIELDS = [
  "location_name", "address", "state", "city", "pincode", "employee_count",
  "nature_of_operations", "is_registered_office", "has_women_employees",
  "has_contract_labour", "has_shift_operations",
]

// POST /api/org-onboarding/get — fetch the caller's own draft (if any),
// with its locations and documents. Returns { data: null } if the caller
// hasn't started onboarding yet for the active org.
router.post("/get", requireAuth, requireOrg, async (req: Request, res: Response) => {
  try {
    const actorId = (req as AuthenticatedRequest).user.id
    const { orgId } = req as OrgScopedRequest
    if (!(await hasOnboardingPermission(actorId, orgId))) {
      return res.status(403).json({ error: "You are not authorized to manage this organisation's onboarding" })
    }

    let draft: any
    try { draft = await resolveOwnDraft(orgId, actorId) } catch (err) {
      if (handleOwnershipError(err, res)) return
      throw err
    }
    if (!draft) return res.json({ data: null })

    const [{ data: org }, { data: locations, error: locError }, { data: documents, error: docError }] = await Promise.all([
      db().from("organizations").select("name").eq("id", orgId).maybeSingle(),
      db().from("org_onboarding_locations").select("*").eq("draft_id", draft.id).order("created_at", { ascending: true }),
      db().from("organization_onboarding_documents").select("*").eq("draft_id", draft.id).order("uploaded_at", { ascending: true }),
    ])
    if (locError) throw locError
    if (docError) throw docError

    res.json({ data: { ...draft, company_name: org?.name ?? null, locations: locations ?? [], documents: documents ?? [] } })
  } catch (err: any) {
    console.error("[org-onboarding/get]", err.message)
    res.status(500).json({ error: "Failed to load onboarding draft" })
  }
})

// POST /api/org-onboarding/summary — read-only view of the org's onboarding
// draft (locations, documents, signatory) for the org's Profile page.
// Deliberately skips resolveOwnDraft's created_by ownership check: unlike
// /get (the editable wizard, restricted to whichever admin started it, to
// avoid concurrent-edit conflicts), this is a pure read any Admin of the org
// should be able to see -- there's exactly one draft per org (org_id is
// UNIQUE) so "the draft" is unambiguous regardless of who created it.
router.post("/summary", requireAuth, requireOrg, async (req: Request, res: Response) => {
  try {
    const actorId = (req as AuthenticatedRequest).user.id
    const { orgId } = req as OrgScopedRequest
    if (!(await hasOnboardingPermission(actorId, orgId))) {
      return res.status(403).json({ error: "You are not authorized to view this organisation's onboarding" })
    }

    const { data: draft, error: draftError } = await db().from("org_onboarding_drafts").select("*").eq("org_id", orgId).maybeSingle()
    if (draftError) throw draftError
    if (!draft) return res.json({ data: null })

    const [{ data: locations, error: locError }, { data: documents, error: docError }] = await Promise.all([
      db().from("org_onboarding_locations").select("*").eq("draft_id", draft.id).order("created_at", { ascending: true }),
      db().from("organization_onboarding_documents").select("*").eq("draft_id", draft.id).order("uploaded_at", { ascending: true }),
    ])
    if (locError) throw locError
    if (docError) throw docError

    res.json({ data: { ...draft, locations: locations ?? [], documents: documents ?? [] } })
  } catch (err: any) {
    console.error("[org-onboarding/summary]", err.message)
    res.status(500).json({ error: "Failed to load onboarding summary" })
  }
})

// POST /api/org-onboarding/start — creates the draft on first call
// (prefilled from the caller's own profile), or just returns the existing
// one (idempotent) if already started by this same admin.
router.post("/start", requireAuth, requireOrg, async (req: Request, res: Response) => {
  try {
    const actorId = (req as AuthenticatedRequest).user.id
    const { orgId } = req as OrgScopedRequest
    if (!(await hasOnboardingPermission(actorId, orgId))) {
      return res.status(403).json({ error: "You are not authorized to manage this organisation's onboarding" })
    }

    let draft: any
    try { draft = await resolveOwnDraft(orgId, actorId) } catch (err) {
      if (handleOwnershipError(err, res)) return
      throw err
    }
    if (draft) return res.json({ data: draft })

    const { data: profile } = await db().from("profiles").select("full_name, email").eq("id", actorId).maybeSingle()

    const { data: created, error } = await db()
      .from("org_onboarding_drafts")
      .insert({
        org_id: orgId,
        created_by: actorId,
        full_name: profile?.full_name ?? null,
        work_email: profile?.email ?? null,
      })
      .select()
      .single()
    if (error) throw error

    res.status(201).json({ data: created })
  } catch (err: any) {
    console.error("[org-onboarding/start]", err.message)
    res.status(500).json({ error: err.message || "Failed to start onboarding" })
  }
})

// POST /api/org-onboarding/save-step — autosave for steps 1, 2, 3, 5, 6
// (step 4's locations and the document uploads have their own endpoints,
// since they aren't flat draft columns).
router.post("/save-step", requireAuth, requireOrg, async (req: Request, res: Response) => {
  try {
    const actorId = (req as AuthenticatedRequest).user.id
    const { orgId } = req as OrgScopedRequest
    if (!(await hasOnboardingPermission(actorId, orgId))) {
      return res.status(403).json({ error: "You are not authorized to manage this organisation's onboarding" })
    }

    const { step, fields } = req.body as { step?: number; fields?: Record<string, unknown> }
    const allowed = step !== undefined ? STEP_FIELDS[step] : undefined
    if (!allowed) return res.status(400).json({ error: "Invalid step" })
    if (!fields || typeof fields !== "object") return res.status(400).json({ error: "fields is required" })

    let draft: any
    try { draft = await resolveOwnDraft(orgId, actorId) } catch (err) {
      if (handleOwnershipError(err, res)) return
      throw err
    }
    if (!draft) return res.status(404).json({ error: "Start onboarding before saving a step" })
    if (!isEditableStatus(draft.status)) {
      return res.status(400).json({ error: "This onboarding submission is no longer editable" })
    }

    const updates: Record<string, unknown> = { current_step: Math.max(draft.current_step, step! + 1) }
    for (const key of allowed) {
      if (key in fields) updates[key] = fields[key]
    }

    const { data, error } = await db().from("org_onboarding_drafts").update(updates).eq("id", draft.id).select().single()
    if (error) throw error

    res.json({ data })
  } catch (err: any) {
    console.error("[org-onboarding/save-step]", err.message)
    res.status(500).json({ error: err.message || "Failed to save step" })
  }
})

// POST /api/org-onboarding/locations/upsert
router.post("/locations/upsert", requireAuth, requireOrg, async (req: Request, res: Response) => {
  try {
    const actorId = (req as AuthenticatedRequest).user.id
    const { orgId } = req as OrgScopedRequest
    if (!(await hasOnboardingPermission(actorId, orgId))) {
      return res.status(403).json({ error: "You are not authorized to manage this organisation's onboarding" })
    }

    let draft: any
    try { draft = await resolveOwnDraft(orgId, actorId) } catch (err) {
      if (handleOwnershipError(err, res)) return
      throw err
    }
    if (!draft) return res.status(404).json({ error: "Start onboarding before adding a location" })
    if (!isEditableStatus(draft.status)) {
      return res.status(400).json({ error: "This onboarding submission is no longer editable" })
    }

    const { id, ...rest } = req.body as { id?: string } & Record<string, unknown>
    const payload: Record<string, unknown> = {}
    for (const key of LOCATION_FIELDS) if (key in rest) payload[key] = rest[key]
    if (!id && !payload.location_name) return res.status(400).json({ error: "location_name is required" })

    if (id) {
      const { data, error } = await db()
        .from("org_onboarding_locations")
        .update(payload)
        .eq("id", id)
        .eq("draft_id", draft.id)
        .select()
        .single()
      if (error) throw error
      return res.json({ data })
    }

    const { data, error } = await db()
      .from("org_onboarding_locations")
      .insert({ ...payload, draft_id: draft.id, org_id: orgId })
      .select()
      .single()
    if (error) throw error
    res.status(201).json({ data })
  } catch (err: any) {
    console.error("[org-onboarding/locations/upsert]", err.message)
    res.status(500).json({ error: err.message || "Failed to save location" })
  }
})

// POST /api/org-onboarding/locations/delete
router.post("/locations/delete", requireAuth, requireOrg, async (req: Request, res: Response) => {
  try {
    const actorId = (req as AuthenticatedRequest).user.id
    const { orgId } = req as OrgScopedRequest
    const { id } = req.body
    if (!id) return res.status(400).json({ error: "id is required" })
    if (!(await hasOnboardingPermission(actorId, orgId))) {
      return res.status(403).json({ error: "You are not authorized to manage this organisation's onboarding" })
    }

    let draft: any
    try { draft = await resolveOwnDraft(orgId, actorId) } catch (err) {
      if (handleOwnershipError(err, res)) return
      throw err
    }
    if (!draft) return res.status(404).json({ error: "No onboarding draft found" })
    if (!isEditableStatus(draft.status)) {
      return res.status(400).json({ error: "This onboarding submission is no longer editable" })
    }

    const { error } = await db().from("org_onboarding_locations").delete().eq("id", id).eq("draft_id", draft.id)
    if (error) throw error
    res.json({ ok: true })
  } catch (err: any) {
    console.error("[org-onboarding/locations/delete]", err.message)
    res.status(500).json({ error: "Failed to delete location" })
  }
})

// POST /api/org-onboarding/documents/upload — same validation (15MB,
// PDF/JPEG/DOCX only) as vendors.ts's /upload-document. Supports both
// multipart/form-data and JSON with base64 file_data. Uploading a document
// of a type that's already present replaces it (one current file per type).
router.post("/documents/upload", requireAuth, requireOrg, uploadOptional, async (req: Request, res: Response) => {
  try {
    const actorId = (req as AuthenticatedRequest).user.id
    const { orgId } = req as OrgScopedRequest
    if (!(await hasOnboardingPermission(actorId, orgId))) {
      return res.status(403).json({ error: "You are not authorized to manage this organisation's onboarding" })
    }

    let draft: any
    try { draft = await resolveOwnDraft(orgId, actorId) } catch (err) {
      if (handleOwnershipError(err, res)) return
      throw err
    }
    if (!draft) return res.status(404).json({ error: "Start onboarding before uploading documents" })
    if (!isEditableStatus(draft.status)) {
      return res.status(400).json({ error: "This onboarding submission is no longer editable" })
    }

    const { document_type, file_name, file_data } = req.body
    const file = (req as any).file

    if (!document_type || !ALLOWED_ORG_DOC_TYPES.has(document_type)) {
      return res.status(400).json({ error: "A valid document_type is required" })
    }

    let buffer: Buffer
    let originalFileName: string
    let mimeType: string

    if (file) {
      buffer = file.buffer
      originalFileName = file.originalname
      mimeType = file.mimetype
    } else if (file_data && file_name) {
      buffer = Buffer.from(file_data, "base64")
      originalFileName = file_name
      mimeType = getMimeType(file_name)
    } else {
      return res.status(400).json({ error: "Either file (multipart) or file_data (base64) is required" })
    }

    if (buffer.length > MAX_DOC_SIZE_BYTES) {
      return res.status(400).json({ error: "File exceeds the 15MB size limit" })
    }
    if (!ALLOWED_DOC_MIME_TYPES.has(mimeType)) {
      return res.status(400).json({ error: "Only PDF, JPEG, and DOCX files are allowed" })
    }

    const ext = (originalFileName.split(".").pop() ?? "bin").toLowerCase()
    const storagePath = `${orgId}/${document_type}_${Date.now()}.${ext}`

    const { error: uploadError } = await db()
      .storage
      .from("org-onboarding-documents")
      .upload(storagePath, buffer, { contentType: mimeType })
    if (uploadError) throw uploadError

    // One current file per document type -- replace whatever was there before.
    await db().from("organization_onboarding_documents").delete().eq("draft_id", draft.id).eq("document_type", document_type)

    const { data, error } = await db()
      .from("organization_onboarding_documents")
      .insert({
        draft_id: draft.id, org_id: orgId, document_type,
        file_name: originalFileName, storage_path: storagePath, uploaded_by: actorId,
      })
      .select()
      .single()
    if (error) throw error

    res.json({ data })
  } catch (err: any) {
    console.error("[org-onboarding/documents/upload]", err.message)
    res.status(500).json({ error: "Failed to upload document: " + err.message })
  }
})

// POST /api/org-onboarding/documents/delete
router.post("/documents/delete", requireAuth, requireOrg, async (req: Request, res: Response) => {
  try {
    const actorId = (req as AuthenticatedRequest).user.id
    const { orgId } = req as OrgScopedRequest
    const { id } = req.body
    if (!id) return res.status(400).json({ error: "id is required" })
    if (!(await hasOnboardingPermission(actorId, orgId))) {
      return res.status(403).json({ error: "You are not authorized to manage this organisation's onboarding" })
    }

    let draft: any
    try { draft = await resolveOwnDraft(orgId, actorId) } catch (err) {
      if (handleOwnershipError(err, res)) return
      throw err
    }
    if (!draft) return res.status(404).json({ error: "No onboarding draft found" })
    if (!isEditableStatus(draft.status)) {
      return res.status(400).json({ error: "This onboarding submission is no longer editable" })
    }

    const { data: doc, error: fetchError } = await db()
      .from("organization_onboarding_documents")
      .select("storage_path")
      .eq("id", id)
      .eq("draft_id", draft.id)
      .maybeSingle()
    if (fetchError) throw fetchError
    if (!doc) return res.status(404).json({ error: "Document not found" })

    await db().storage.from("org-onboarding-documents").remove([doc.storage_path]).catch(() => {})

    const { error } = await db().from("organization_onboarding_documents").delete().eq("id", id).eq("draft_id", draft.id)
    if (error) throw error
    res.json({ ok: true })
  } catch (err: any) {
    console.error("[org-onboarding/documents/delete]", err.message)
    res.status(500).json({ error: "Failed to delete document" })
  }
})

// POST /api/org-onboarding/submit — validates every required field and
// document is present, flips status to 'submitted', and writes an audit
// entry. Superadmin then picks it up via the onboarding review queue
// (POST /api/superadmin/organizations/onboarding-queue).
router.post("/submit", requireAuth, requireOrg, async (req: Request, res: Response) => {
  try {
    const actorId = (req as AuthenticatedRequest).user.id
    const { orgId, orgAccess } = req as OrgScopedRequest
    if (!(await hasOnboardingPermission(actorId, orgId))) {
      return res.status(403).json({ error: "You are not authorized to manage this organisation's onboarding" })
    }

    let draft: any
    try { draft = await resolveOwnDraft(orgId, actorId) } catch (err) {
      if (handleOwnershipError(err, res)) return
      throw err
    }
    if (!draft) return res.status(404).json({ error: "Start onboarding before submitting" })
    if (!isEditableStatus(draft.status)) {
      return res.status(400).json({ error: "This onboarding submission has already been submitted" })
    }

    const [{ data: locations, error: locError }, { data: documents, error: docError }] = await Promise.all([
      db().from("org_onboarding_locations").select("id").eq("draft_id", draft.id),
      db().from("organization_onboarding_documents").select("document_type").eq("draft_id", draft.id),
    ])
    if (locError) throw locError
    if (docError) throw docError

    const uploadedTypes = new Set((documents ?? []).map((d: any) => d.document_type))
    const missingDocs = REQUIRED_ORG_DOC_TYPES.filter((t) => !uploadedTypes.has(t))

    const missing: string[] = []
    if (!draft.accepted_terms) missing.push("Terms & Conditions must be accepted")
    if (!draft.full_name || !draft.work_email || !draft.mobile) missing.push("Welcome step is incomplete")
    if (!draft.legal_entity_type || !draft.date_of_incorporation || !draft.employee_count_range) missing.push("Establishment step is incomplete")
    if (!draft.location_setup) missing.push("Location setup choice is required")
    if (!locations || locations.length === 0) missing.push("At least one location is required")
    if (!draft.pan_number || !draft.bank_name || !draft.bank_account_number || !draft.bank_ifsc) missing.push("PAN and bank details are incomplete")
    if (!draft.signatory_name || !draft.signatory_email || !draft.signatory_mobile) missing.push("Authorized signatory details are incomplete")
    if (missingDocs.length > 0) missing.push(`Missing required documents: ${missingDocs.join(", ")}`)

    if (missing.length > 0) return res.status(400).json({ error: missing.join("; ") })

    const { data: updated, error } = await db()
      .from("org_onboarding_drafts")
      .update({ status: "submitted", submitted_at: new Date().toISOString(), rejection_reason: null })
      .eq("id", draft.id)
      .select()
      .single()
    if (error) throw error

    await writeAudit({
      entityType: "org_onboarding_draft",
      entityId: draft.id,
      action: "org_onboarding_submitted",
      newValue: { org_id: orgId },
      performedBy: actorId,
      orgId,
      actingAs: orgAccess === "group_admin" ? "group_admin" : null,
    })

    res.json({ data: updated })
  } catch (err: any) {
    console.error("[org-onboarding/submit]", err.message)
    res.status(500).json({ error: err.message || "Failed to submit onboarding" })
  }
})

export default router
