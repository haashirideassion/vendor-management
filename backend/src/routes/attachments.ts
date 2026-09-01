import { Router, Request, Response } from "express"
import { getSupabaseAdmin } from "../utils/supabaseAdmin"
import { requireAuth, AuthenticatedRequest } from "../middleware/auth"
import { resolveVendorId, resolveVendorAllowedOrgIds, isOrgMember } from "../middleware/org"

const router = Router()
function db(): any { return getSupabaseAdmin() }

const ENTITY_TABLE: Record<string, string> = {
  purchase_request: "purchase_requests",
  purchase_order: "purchase_orders",
  grn: "grns",
  contract: "contracts",
  invoice: "invoices",
  service_confirmation: "service_confirmations",
}

// Every entity type an attachment can point at is org-scoped and (except a
// purchase_request, which can invite several vendors via the
// purchase_request_vendors junction) has a single definite vendor_id. Loads
// the parent row and checks the caller genuinely belongs to it -- internal
// callers via org membership, vendor callers via vendor_id ownership (a
// purchase_request additionally checks the invited-vendors junction, same
// as purchase-requests.ts's own /get does). Returns null if the entity
// doesn't exist or the caller has no relationship to it.
async function checkAttachmentAccess(req: Request, entityType: string, entityId: string): Promise<boolean> {
  const table = ENTITY_TABLE[entityType]
  if (!table) return false

  const { data: entity, error } = await db().from(table).select("org_id, vendor_id").eq("id", entityId).maybeSingle()
  if (error || !entity) return false

  const { id: userId, role } = (req as AuthenticatedRequest).user
  if (role === "vendor") {
    const vendorId = await resolveVendorId(userId)
    if (!vendorId) return false
    let isParty = entity.vendor_id === vendorId
    if (!isParty && entityType === "purchase_request") {
      const { data: invited } = await db()
        .from("purchase_request_vendors")
        .select("vendor_id")
        .eq("purchase_request_id", entityId)
        .eq("vendor_id", vendorId)
        .maybeSingle()
      isParty = !!invited
    }
    if (!isParty) return false
    const allowedOrgIds = await resolveVendorAllowedOrgIds(userId, vendorId)
    return allowedOrgIds === null || allowedOrgIds.includes(entity.org_id)
  }

  if (!entity.org_id) return false
  return isOrgMember(userId, entity.org_id)
}

// POST /api/attachments/resolve-org — used by the frontend to construct the
// org-scoped storage path (org/{orgId}/{entityType}/{entityId}/...) *before*
// uploading, since uploads go straight to Supabase Storage from the client.
router.post("/resolve-org", requireAuth, async (req: Request, res: Response) => {
  try {
    const { entityType, entityId } = req.body
    const table = ENTITY_TABLE[entityType]
    if (!table || !entityId) return res.status(400).json({ error: "Invalid entityType or missing entityId" })
    if (!(await checkAttachmentAccess(req, entityType, entityId))) {
      return res.status(403).json({ error: "You do not have access to this record" })
    }

    const { data, error } = await db().from(table).select("org_id").eq("id", entityId).single()
    if (error) throw error

    res.json({ data: { orgId: data.org_id } })
  } catch (err: any) {
    console.error("[attachments/resolve-org]", err.message)
    res.status(500).json({ error: "Failed to resolve organization for entity" })
  }
})

// POST /api/attachments/list
router.post("/list", requireAuth, async (req: Request, res: Response) => {
  try {
    const { entityType, entityId } = req.body
    if (!entityType || !entityId) return res.status(400).json({ error: "Missing entityType or entityId" })
    if (!(await checkAttachmentAccess(req, entityType, entityId))) {
      return res.status(403).json({ error: "You do not have access to this record" })
    }

    const { data, error } = await db()
      .from("attachments")
      .select("*")
      .eq("entity_type", entityType)
      .eq("entity_id", entityId)
      .eq("is_deleted", false)
      .order("created_at", { ascending: true })

    if (error) {
      if (error.code === "42P01") return res.json([])
      throw error
    }
    return res.json(data)
  } catch (err: any) {
    return res.status(500).json({ error: err.message || "Unexpected error" })
  }
})

// POST /api/attachments/create
router.post("/create", requireAuth, async (req: Request, res: Response) => {
  try {
    const {
      entity_type,
      entity_id,
      file_name,
      original_name,
      file_extension,
      mime_type,
      file_size,
      storage_path,
    } = req.body

    if (!entity_type || !entity_id || !file_name || !original_name || !storage_path) {
      return res.status(400).json({ error: "Missing required fields" })
    }
    if (!(await checkAttachmentAccess(req, entity_type, entity_id))) {
      return res.status(403).json({ error: "You do not have access to this record" })
    }

    // uploaded_by is always the authenticated caller -- never trust a
    // client-supplied id here, which would let a caller forge who uploaded
    // a file onto someone else's identity.
    const uploadedBy = (req as AuthenticatedRequest).user.id

    const { data, error } = await db()
      .from("attachments")
      .insert({
        entity_type,
        entity_id,
        file_name,
        original_name,
        file_extension: file_extension ?? null,
        mime_type: mime_type ?? null,
        file_size: file_size ?? null,
        storage_path,
        uploaded_by: uploadedBy,
        is_deleted: false,
      })
      .select()
      .single()

    if (error) throw error
    return res.json(data)
  } catch (err: any) {
    return res.status(500).json({ error: err.message || "Unexpected error" })
  }
})

// POST /api/attachments/delete
router.post("/delete", requireAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.body
    if (!id) return res.status(400).json({ error: "Missing id" })

    const { data: attachment, error: getError } = await db()
      .from("attachments")
      .select("entity_type, entity_id, uploaded_by")
      .eq("id", id)
      .maybeSingle()
    if (getError) throw getError
    if (!attachment) return res.status(404).json({ error: "Attachment not found" })
    if (!(await checkAttachmentAccess(req, attachment.entity_type, attachment.entity_id))) {
      return res.status(403).json({ error: "You do not have access to this record" })
    }

    const { error } = await db()
      .from("attachments")
      .update({ is_deleted: true })
      .eq("id", id)

    if (error) throw error
    return res.json({ ok: true })
  } catch (err: any) {
    return res.status(500).json({ error: err.message || "Unexpected error" })
  }
})

export default router
