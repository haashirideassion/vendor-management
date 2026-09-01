import { Router, Request, Response } from "express"
import { getSupabaseAdmin } from "../utils/supabaseAdmin"
import { requireAuth, AuthenticatedRequest } from "../middleware/auth"
import { resolveVendorId, isOrgMember } from "../middleware/org"

const router = Router()
function db(): any { return getSupabaseAdmin() }

// Shared ownership gate for this file's three routes: a caller may act on a
// vendor's compliance documents if they ARE that vendor (any vendor_users
// staff, via resolveVendorId -- never a client-supplied vendor id "as"
// someone else), or if they're an internal user whose org has an active
// organization_vendors relationship with that vendor. Mirrors the pattern
// vendors.ts/ratings.ts already use correctly elsewhere in this codebase.
async function canAccessVendorDocuments(req: Request, vendorId: string): Promise<boolean> {
  const { id: userId, role } = (req as AuthenticatedRequest).user
  if (role === "vendor") {
    const ownVendorId = await resolveVendorId(userId)
    return !!ownVendorId && ownVendorId === vendorId
  }
  const orgId = req.headers["x-org-id"]
  if (!orgId || typeof orgId !== "string") return false
  if (!(await isOrgMember(userId, orgId))) return false
  const { data: link } = await db()
    .from("organization_vendors")
    .select("id")
    .eq("org_id", orgId)
    .eq("vendor_id", vendorId)
    .maybeSingle()
  return !!link
}

async function hasOrgPermission(userId: string, orgId: string, key: string): Promise<boolean> {
  const { data } = await db().rpc("resolve_permission_as", { p_user_id: userId, p_scope: "org", p_org_id: orgId, p_vendor_id: null, p_key: key })
  return data === true
}

// POST /api/documents/by-vendor — { vendorId }
router.post("/by-vendor", requireAuth, async (req: Request, res: Response) => {
  try {
    const { vendorId } = req.body
    if (!vendorId) return res.status(400).json({ error: "vendorId is required" })
    if (!(await canAccessVendorDocuments(req, vendorId))) {
      return res.status(403).json({ error: "You do not have access to this vendor's documents" })
    }
    const { data, error } = await db()
      .from("vendor_documents")
      .select("*")
      .eq("vendor_id", vendorId)
      .order("uploaded_at", { ascending: false })
    if (error) throw error
    res.json(data)
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Unexpected error" })
  }
})

// POST /api/documents/create — { vendor_id, document_type, file_name, storage_path, expires_at? }
router.post("/create", requireAuth, async (req: Request, res: Response) => {
  try {
    const { vendor_id, document_type, file_name, storage_path, expires_at } = req.body
    if (!vendor_id) return res.status(400).json({ error: "vendor_id is required" })
    if (!document_type) return res.status(400).json({ error: "document_type is required" })
    if (!file_name) return res.status(400).json({ error: "file_name is required" })
    if (!storage_path) return res.status(400).json({ error: "storage_path is required" })
    if (!(await canAccessVendorDocuments(req, vendor_id))) {
      return res.status(403).json({ error: "You do not have access to this vendor's documents" })
    }
    const payload: any = { vendor_id, document_type, file_name, storage_path }
    if (expires_at !== undefined) payload.expires_at = expires_at
    const { data, error } = await db()
      .from("vendor_documents")
      .insert(payload)
      .select()
      .single()
    if (error) throw error
    res.json(data)
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Unexpected error" })
  }
})

// POST /api/documents/verify — { id, verified, verified_at, notes? } -- an
// internal reviewer action only (a vendor can't "verify" its own document),
// gated on the documents.verify permission for the org that actually has a
// relationship with this document's vendor.
router.post("/verify", requireAuth, async (req: Request, res: Response) => {
  try {
    const { id, verified, verified_at, notes } = req.body
    if (!id) return res.status(400).json({ error: "id is required" })
    if (verified === undefined || verified === null) return res.status(400).json({ error: "verified is required" })
    if (!verified_at) return res.status(400).json({ error: "verified_at is required" })

    const { id: userId, role } = (req as AuthenticatedRequest).user
    if (role === "vendor") {
      return res.status(403).json({ error: "Only an organization reviewer can verify a document" })
    }
    const orgId = req.headers["x-org-id"]
    if (!orgId || typeof orgId !== "string") {
      return res.status(400).json({ error: "X-Org-Id header is required" })
    }

    const { data: doc, error: docError } = await db().from("vendor_documents").select("vendor_id").eq("id", id).maybeSingle()
    if (docError) throw docError
    if (!doc) return res.status(404).json({ error: "Document not found" })

    if (!(await canAccessVendorDocuments(req, doc.vendor_id)) || !(await hasOrgPermission(userId, orgId, "documents.verify"))) {
      return res.status(403).json({ error: "You are not authorized to verify this document" })
    }

    const payload: any = { verified, verified_at, verified_by: userId }
    if (notes !== undefined) payload.notes = notes
    const { data, error } = await db()
      .from("vendor_documents")
      .update(payload)
      .eq("id", id)
      .select()
      .single()
    if (error) throw error
    res.json(data)
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Unexpected error" })
  }
})

export default router
