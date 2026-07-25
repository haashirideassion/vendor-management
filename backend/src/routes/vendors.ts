import { Router, Request, Response, NextFunction } from "express"
import multer from "multer"
import { getSupabaseAdmin } from "../utils/supabaseAdmin"
import { requireAuth, AuthenticatedRequest } from "../middleware/auth"
import { requireOrg, OrgScopedRequest, resolveVendorId } from "../middleware/org"
import { getDefaultOrgId } from "../utils/org"
import { writeAudit } from "../services/audit"

const router = Router()
function db(): any { return getSupabaseAdmin() }

type OnboardingTargets =
  | { targetOrgIds: string[]; onboardedViaGroupId: string | null }
  | { error: string }

// Resolves an Organisation Code or Group Code (Step1CompanyInfo's mandatory,
// mutually-exclusive fields) into the concrete org(s) a self-service vendor
// signup should land at -- an org code resolves to exactly that org; a group
// code fans out to every org CURRENTLY active in that group (mirrors
// admin-onboard's own group-based targetOrgIds expansion), and also returns
// the group id so the caller can set vendors.onboarded_via_group_id, which
// keeps this vendor's reach live as the group's membership changes later
// (035_live_group_vendor_reach.sql).
async function resolveOnboardingTargets(body: { org_code?: string; group_code?: string }): Promise<OnboardingTargets> {
  const orgCode = body.org_code?.trim()
  const groupCode = body.group_code?.trim()
  if (!orgCode && !groupCode) {
    return { error: "Either an Organisation Code or a Group Code is required" }
  }
  if (orgCode && groupCode) {
    return { error: "Provide either an Organisation Code or a Group Code, not both" }
  }

  if (orgCode) {
    const { data: org } = await db()
      .from("organizations")
      .select("id")
      .eq("status", "active")
      .eq("org_code", orgCode.toUpperCase())
      .maybeSingle()
    if (!org) return { error: "Organisation Code not found" }
    return { targetOrgIds: [org.id], onboardedViaGroupId: null }
  }

  const { data: group } = await db()
    .from("organization_groups")
    .select("id")
    .eq("status", "active")
    .eq("code", groupCode!.toUpperCase())
    .maybeSingle()
  if (!group) return { error: "Group Code not found" }

  const { data: siblings, error: siblingsError } = await db()
    .from("group_organizations")
    .select("organization_id")
    .eq("group_id", group.id)
    .is("effective_to", null)
    .eq("status", "active")
  if (siblingsError) throw siblingsError

  const targetOrgIds = [...new Set<string>((siblings ?? []).map((s: any) => s.organization_id))]
  if (targetOrgIds.length === 0) return { error: "This group has no active organisations yet" }
  return { targetOrgIds, onboardedViaGroupId: group.id }
}

// organization_vendors is the source of truth for a vendor's per-org status,
// vendor code, and contract dates (vendors.status/vendor_id_code etc. are
// legacy columns kept only for backward compat, not written going forward).
// Flatten the org-vendor row onto the same keys the frontend already expects
// on a vendor object, so VendorList/VendorDetail need no changes.
function flattenOrgVendor(v: any) {
  const ov = Array.isArray(v.organization_vendors) ? v.organization_vendors[0] : v.organization_vendors
  const { organization_vendors, ...rest } = v
  if (!ov) return rest
  return {
    ...rest,
    status: ov.status,
    vendor_id_code: ov.vendor_id_code,
    admin_notes: ov.admin_notes,
    contract_start_date: ov.contract_start_date,
    contract_anniversary: ov.contract_anniversary,
  }
}

// Configure multer for file uploads (max 50MB)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
})

// Middleware that allows both multipart and JSON
const uploadOptional = (req: Request, res: Response, next: NextFunction) => {
  const contentType = req.headers['content-type'] || ''
  if (contentType.includes('multipart/form-data')) {
    upload.single("file")(req as any, res as any, next)
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
router.post("/list", requireAuth, requireOrg, async (req: Request, res: Response) => {
  try {
    const { status, category, search } = req.body
    const { orgId } = req as OrgScopedRequest

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
      .select(
        "*, organization_vendors!inner(status, vendor_id_code, admin_notes, contract_start_date, contract_anniversary), vendor_categories(*, service_categories(*)), vendor_ratings(score)"
      )
      .eq("organization_vendors.org_id", orgId)
      .order("created_at", { ascending: false })

    if (vendorIds !== null) {
      query = query.in("id", vendorIds)
    }
    if (status) {
      query = query.eq("organization_vendors.status", status)
    }
    if (search) {
      query = query.or(
        `company_name.ilike.%${search}%,contact_email.ilike.%${search}%`
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
      return { ...flattenOrgVendor(v), avg_rating }
    })

    res.json({ data: vendors })
  } catch (err: any) {
    console.error("[vendors/list]", err.message)
    res.status(500).json({ error: "Failed to list vendors" })
  }
})

// POST /api/vendors/get
router.post("/get", requireAuth, requireOrg, async (req: Request, res: Response) => {
  try {
    const { id } = req.body
    const { orgId } = req as OrgScopedRequest
    if (!id) return res.status(400).json({ error: "id is required" })

    const { data, error } = await db()
      .from("vendors")
      .select(
        "*, organization_vendors!inner(status, vendor_id_code, admin_notes, contract_start_date, contract_anniversary), vendor_categories(*, service_categories(*)), vendor_services(*), vendor_documents(*), vendor_ratings(*, profiles(full_name, email)), vendor_users(id)"
      )
      .eq("id", id)
      .eq("organization_vendors.org_id", orgId)
      .single()

    if (error) throw error

    const ratings: any[] = data?.vendor_ratings ?? []
    const avg_rating =
      ratings.length > 0
        ? ratings.reduce((sum: number, r: any) => sum + (r.score ?? 0), 0) / ratings.length
        : null

    const hasPortalUsers = (data?.vendor_users ?? []).length > 0
    const { vendor_users, ...vendorData } = data
    res.json({ data: { ...flattenOrgVendor(vendorData), avg_rating, hasPortalUsers } })
  } catch (err: any) {
    console.error("[vendors/get]", err.message)
    res.status(500).json({ error: "Failed to get vendor" })
  }
})

// A vendor can hold one organization_vendors row per client org (pending_
// review/active/action_required/suspended/rejected independently at each).
// The vendor's own dashboard has no single org in view, so this collapses
// them to one overall stage for VendorStatusGuard: approved anywhere beats
// everything else (that's what actually unlocks RFQs/quotations to view),
// otherwise the "most active" remaining status, so a vendor with only a
// pending_review relationship still reads as onboarding-in-progress rather
// than silently falling back to whatever vendors.status happened to be.
function deriveOverallVendorStatus(orgVendorRows: { status: string }[]): string {
  const statuses = new Set(orgVendorRows.map((r) => r.status))
  if (statuses.has("active")) return "active"
  if (statuses.has("action_required")) return "action_required"
  if (statuses.has("pending_review")) return "pending_review"
  if (orgVendorRows.length > 0) return orgVendorRows[0].status
  return "pending_review"
}

// POST /api/vendors/get-my-vendor — resolves the CALLER's own vendor via
// vendor_users (works for any active staff member, not just whichever
// profile happens to be vendors.profile_id), never a client-supplied id --
// this previously trusted a profileId from the request body with no check
// it belonged to the caller, letting any authenticated user read another
// vendor's full record (bank details, documents, etc.) by passing their id.
router.post("/get-my-vendor", requireAuth, async (req: Request, res: Response) => {
  try {
    const actorId = (req as AuthenticatedRequest).user.id
    const vendorId = await resolveVendorId(actorId)
    if (!vendorId) return res.json({ data: null })

    const { data, error } = await db()
      .from("vendors")
      .select(
        "*, organization_vendors(status), vendor_categories(*, service_categories(*)), vendor_services(*), vendor_documents(*), vendor_ratings(*, profiles(full_name, email))"
      )
      .eq("id", vendorId)
      .maybeSingle()

    if (error) throw error

    if (!data) return res.json({ data: null })

    const ratings: any[] = data.vendor_ratings ?? []
    const avg_rating =
      ratings.length > 0
        ? ratings.reduce((sum: number, r: any) => sum + (r.score ?? 0), 0) / ratings.length
        : null

    // organization_vendors is the source of truth for status going forward
    // (vendors.status is a legacy column, kept only for backward compat,
    // never written to after creation) -- overwrite it here so this route
    // matches the same convention flattenOrgVendor already applies to the
    // admin-facing /list and /get routes, instead of leaking the stale
    // legacy value straight to VendorStatusGuard.
    const { organization_vendors, ...vendorData } = data
    const status = deriveOverallVendorStatus(organization_vendors ?? [])

    res.json({ data: { ...vendorData, status, avg_rating } })
  } catch (err: any) {
    console.error("[vendors/get-my-vendor]", err.message)
    res.status(500).json({ error: "Failed to get vendor" })
  }
})

// POST /api/vendors/my-organizations — the CALLER's own vendor's full list
// of client-org relationships (every organization_vendors row, any status),
// for the "My Organisations" section of VendorProfile.tsx. Unlike vendor-
// users.ts's /client-orgs (which is deliberately narrowed to active-only,
// for the Associate client-assignment picker), this one is unfiltered so
// the vendor can see pending_review/suspended/rejected relationships too.
router.post("/my-organizations", requireAuth, async (req: Request, res: Response) => {
  try {
    const actorId = (req as AuthenticatedRequest).user.id
    const vendorId = await resolveVendorId(actorId)
    if (!vendorId) return res.status(403).json({ error: "No vendor profile found for this user" })

    const { data, error } = await db()
      .from("organization_vendors")
      .select("status, vendor_id_code, organization:org_id(id, name, slug)")
      .eq("vendor_id", vendorId)
    if (error) throw error

    res.json({ data: (data ?? []).filter((row: any) => row.organization) })
  } catch (err: any) {
    console.error("[vendors/my-organizations]", err.message)
    res.status(500).json({ error: "Failed to list organizations" })
  }
})

// POST /api/vendors/request-organization — the CALLER's own vendor requests
// a new client-org relationship (organization_vendors, pending_review),
// picking up "the vendor already exists globally, request a relationship
// with a new org" branch /create already has, but as its own standalone
// action for an already-onboarded vendor (no company-detail fields needed,
// since those already exist) -- reached from VendorProfile.tsx's "Add
// Organisation" flow after searching via /api/organizations/search.
router.post("/request-organization", requireAuth, async (req: Request, res: Response) => {
  try {
    const actorId = (req as AuthenticatedRequest).user.id
    const vendorId = await resolveVendorId(actorId)
    if (!vendorId) return res.status(403).json({ error: "No vendor profile found for this user" })

    const { org_id } = req.body
    if (!org_id) return res.status(400).json({ error: "org_id is required" })

    const { data: org, error: orgError } = await db()
      .from("organizations")
      .select("id, status")
      .eq("id", org_id)
      .maybeSingle()
    if (orgError) throw orgError
    if (!org || org.status !== "active") {
      return res.status(400).json({ error: "This organisation is not available" })
    }

    const { data: existingLink } = await db()
      .from("organization_vendors")
      .select("id")
      .eq("org_id", org_id)
      .eq("vendor_id", vendorId)
      .maybeSingle()
    if (existingLink) {
      return res.status(409).json({ error: "A relationship with this organization already exists" })
    }

    const { data: created, error } = await db()
      .from("organization_vendors")
      .insert({ org_id, vendor_id: vendorId, status: "pending_review" })
      .select("status, vendor_id_code, organization:org_id(id, name, slug)")
      .single()
    if (error) throw error

    res.status(201).json({ data: created })
  } catch (err: any) {
    console.error("[vendors/request-organization]", err.message)
    res.status(500).json({ error: "Failed to request organization" })
  }
})

// POST /api/vendors/revoke-group-access — a Local Admin revokes just THIS
// org's access to a vendor that was reached via a group (onboarded_via_
// group_id), without removing the vendor from the group relationship
// overall or touching its organization_vendors rows at any other org in
// that group (035_live_group_vendor_reach.sql). Distinct from the
// automatic revoke that fires when the org itself leaves the group -- this
// is a deliberate, standalone action a Local Admin can take at any time.
router.post("/revoke-group-access", requireAuth, requireOrg, async (req: Request, res: Response) => {
  try {
    const { id } = req.body
    const { orgId } = req as OrgScopedRequest
    const userId = (req as AuthenticatedRequest).user.id
    if (!id) return res.status(400).json({ error: "id is required" })

    const { data: canManage } = await db().rpc("has_permission_as", {
      p_user_id: userId,
      p_org_id: orgId,
      p_key: "vendors.manage_status",
    })
    if (canManage !== true) {
      return res.status(403).json({ error: "You are not authorized to revoke this vendor's access" })
    }

    const { data: vendor, error: vendorError } = await db()
      .from("vendors")
      .select("onboarded_via_group_id")
      .eq("id", id)
      .single()
    if (vendorError) throw vendorError
    if (!vendor.onboarded_via_group_id) {
      return res.status(400).json({ error: "This vendor was not reached via a group -- nothing to revoke" })
    }

    const { data: ov, error } = await db()
      .from("organization_vendors")
      .update({ status: "suspended", group_reach_revoked_at: new Date().toISOString() })
      .eq("org_id", orgId)
      .eq("vendor_id", id)
      .select()
      .single()
    if (error) throw error

    res.json({ data: ov })
  } catch (err: any) {
    console.error("[vendors/revoke-group-access]", err.message)
    res.status(500).json({ error: "Failed to revoke vendor access" })
  }
})

// POST /api/vendors/update-status — updates the org's relationship with this
// vendor (organization_vendors), not the vendor's global record.
router.post("/update-status", requireAuth, requireOrg, async (req: Request, res: Response) => {
  try {
    const { id, status, admin_notes } = req.body
    const { orgId } = req as OrgScopedRequest
    const userId = (req as AuthenticatedRequest).user.id
    if (!id || !status) return res.status(400).json({ error: "id and status are required" })

    // Look up the organization_vendors row first: we need its id both to
    // check the one-off reviewer-delegation permission and to clear that
    // delegation once the review resolves (see 030_vendor_onboarding_review_delegation.sql).
    const { data: existingOv, error: existingOvError } = await db()
      .from("organization_vendors")
      .select("id")
      .eq("org_id", orgId)
      .eq("vendor_id", id)
      .single()
    if (existingOvError) throw existingOvError

    const { data: canReview } = await db().rpc("can_review_vendor_onboarding_as", {
      p_user_id: userId,
      p_organization_vendor_id: existingOv.id,
    })
    if (canReview !== true) {
      return res.status(403).json({ error: "You are not authorized to review this vendor" })
    }

    const updates: any = { status }
    if (admin_notes !== undefined) updates.admin_notes = admin_notes

    const { data: ov, error } = await db()
      .from("organization_vendors")
      .update(updates)
      .eq("id", existingOv.id)
      .select()
      .single()

    if (error) throw error

    // One-off delegation only covers the single pending review it was made
    // for -- clear it once the status actually changes so it doesn't
    // silently carry over to this vendor's next lifecycle event at this org.
    if (status !== "pending_review") {
      await db().rpc("clear_vendor_onboarding_assignment", { p_organization_vendor_id: existingOv.id })
    }

    const { data: vendor, error: vendorError } = await db()
      .from("vendors")
      .select("*")
      .eq("id", id)
      .single()
    if (vendorError) throw vendorError

    res.json({
      data: {
        ...vendor,
        status: ov.status,
        vendor_id_code: ov.vendor_id_code,
        admin_notes: ov.admin_notes,
        contract_start_date: ov.contract_start_date,
        contract_anniversary: ov.contract_anniversary,
      },
    })
  } catch (err: any) {
    console.error("[vendors/update-status]", err.message)
    res.status(500).json({ error: "Failed to update vendor status" })
  }
})

// POST /api/vendors/reassign-review — one-off delegation of a single
// pending vendor-onboarding review to another org admin/manager (e.g. the
// Local Admin is out and hands this one review to a colleague). Does not
// remove the org's regular admins' ability to act -- it adds an additional
// permitted reviewer for this one organization_vendors row only. Only
// existing org admins (vendors.manage_status) may delegate.
router.post("/reassign-review", requireAuth, requireOrg, async (req: Request, res: Response) => {
  try {
    const { id, reviewer_profile_id } = req.body
    const { orgId } = req as OrgScopedRequest
    const userId = (req as AuthenticatedRequest).user.id
    if (!id || !reviewer_profile_id) {
      return res.status(400).json({ error: "id and reviewer_profile_id are required" })
    }

    const { data: existingOv, error: existingOvError } = await db()
      .from("organization_vendors")
      .select("id, status")
      .eq("org_id", orgId)
      .eq("vendor_id", id)
      .single()
    if (existingOvError) throw existingOvError

    if (existingOv.status !== "pending_review") {
      return res.status(400).json({ error: "Only a pending review can be reassigned" })
    }

    const { data: canDelegate } = await db().rpc("has_permission_as", {
      p_user_id: userId,
      p_org_id: orgId,
      p_key: "vendors.manage_status",
    })
    if (canDelegate !== true) {
      return res.status(403).json({ error: "You are not authorized to reassign this review" })
    }

    // Confirm the target reviewer is actually a member of this org (any
    // role -- Manager included, per "assign any admin or manager present").
    const { data: targetMember } = await db()
      .from("organization_members")
      .select("profile_id")
      .eq("org_id", orgId)
      .eq("profile_id", reviewer_profile_id)
      .eq("status", "active")
      .maybeSingle()
    if (!targetMember) {
      return res.status(400).json({ error: "Target reviewer is not an active member of this organization" })
    }

    const { data: updated, error } = await db()
      .from("organization_vendors")
      .update({ assigned_reviewer_id: reviewer_profile_id, assigned_by: userId, assigned_at: new Date().toISOString() })
      .eq("id", existingOv.id)
      .select()
      .single()
    if (error) throw error

    res.json({ data: updated })
  } catch (err: any) {
    console.error("[vendors/reassign-review]", err.message)
    res.status(500).json({ error: "Failed to reassign review" })
  }
})

// POST /api/vendors/update — same fix as get-my-vendor: resolve the vendor
// from the caller's own vendor_users membership, not a client-supplied
// profileId (previously anyone authenticated could overwrite any vendor's
// company/bank details by passing a different profileId).
router.post("/update", requireAuth, async (req: Request, res: Response) => {
  try {
    const actorId = (req as AuthenticatedRequest).user.id
    const vendorId = await resolveVendorId(actorId)
    if (!vendorId) return res.status(403).json({ error: "No vendor profile found for this user" })

    // Only ever the vendor's own editable fields -- ignore anything else the
    // client sends (e.g. a stray profileId, or id/verification_status/status,
    // which stay platform/org-controlled).
    const {
      company_name, legal_name, contact_name, contact_email, contact_phone,
      tax_gst_number, pan_number, registration_number,
      bank_name, bank_account_number, bank_routing_number,
    } = req.body

    const { data, error } = await db()
      .from("vendors")
      .update({
        company_name, legal_name, contact_name, contact_email, contact_phone,
        tax_gst_number, pan_number, registration_number,
        bank_name, bank_account_number, bank_routing_number,
      })
      .eq("id", vendorId)
      .select()
      .single()

    if (error) throw error

    res.json({ data })
  } catch (err: any) {
    console.error("[vendors/update]", err.message)
    res.status(500).json({ error: "Failed to update vendor" })
  }
})

// POST /api/vendors/update-categories — same fix: resolve the vendor from
// the caller's own vendor_users membership rather than trusting a
// client-supplied vendorId (previously anyone authenticated could edit any
// vendor's categories by passing a different id).
router.post("/update-categories", requireAuth, async (req: Request, res: Response) => {
  try {
    const { categoryIds } = req.body
    if (!Array.isArray(categoryIds)) {
      return res.status(400).json({ error: "categoryIds is required" })
    }
    const actorId = (req as AuthenticatedRequest).user.id
    const vendorId = await resolveVendorId(actorId)
    if (!vendorId) return res.status(403).json({ error: "No vendor profile found for this user" })

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
// A vendor identity is 1:1 with a profile (login). If this profile already
// has a vendor record (e.g. they onboarded with a different org before),
// don't create a duplicate global vendor -- just request a relationship
// with the new org via organization_vendors.
router.post("/create", requireAuth, async (req: Request, res: Response) => {
  const profileId = (req as AuthenticatedRequest).user.id
  try {
    const {
      company_name, contact_name, contact_email, contact_phone,
      tax_gst_number, pan_number, bank_name, bank_account_number, bank_routing_number,
      category_ids, is_solo_user, org_code, group_code,
    } = req.body

    if (!company_name || !contact_name || !contact_email || !tax_gst_number || !pan_number) {
      return res.status(400).json({ error: "company_name, contact_name, contact_email, tax_gst_number, and pan_number are required" })
    }

    const resolved = await resolveOnboardingTargets({ org_code, group_code })
    if ("error" in resolved) return res.status(400).json({ error: resolved.error })
    const { targetOrgIds, onboardedViaGroupId } = resolved
    // org_group_code stays as a plain freeform record of whatever the vendor
    // typed (backward-compat display column, 032_vendor_solo_and_group_code.sql)
    // -- it no longer decides the actual org/group relationship.
    const rawCodeEntered = (org_code || group_code || "").trim()

    // Check for existing vendor record for this profile
    const { data: existing } = await db()
      .from("vendors")
      .select("id")
      .eq("profile_id", profileId)
      .maybeSingle()

    if (existing) {
      const { data: existingLinks } = await db()
        .from("organization_vendors")
        .select("org_id")
        .eq("vendor_id", existing.id)
        .in("org_id", targetOrgIds)
      const alreadyLinkedOrgIds = new Set((existingLinks ?? []).map((r: any) => r.org_id))
      const newOrgIds = targetOrgIds.filter((id) => !alreadyLinkedOrgIds.has(id))

      if (newOrgIds.length === 0) {
        // Idempotent: every target org already has a relationship -- treat
        // as a successful retry rather than erroring.
        return res.status(200).json({ data: { id: existing.id } })
      }

      // Vendor already exists globally (this profile onboarded elsewhere
      // before) -- request a relationship with the new org(s) instead of
      // duplicating the vendor.
      const { error: linkError } = await db()
        .from("organization_vendors")
        .insert(newOrgIds.map((orgId) => ({ org_id: orgId, vendor_id: existing.id, status: "pending_review" })))
      if (linkError) throw linkError

      return res.status(201).json({ data: { id: existing.id } })
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

    // create_vendor_with_categories' signature predates these fields -- set
    // them with a follow-up update rather than touching that RPC, mirroring
    // how /admin-onboard layers its own post-create fields (legal_name,
    // pan_number, etc.) on top of the same RPC.
    const { error: soloGroupError } = await db()
      .from("vendors")
      .update({
        is_solo_user: !!is_solo_user,
        org_group_code: rawCodeEntered || null,
        onboarded_via_group_id: onboardedViaGroupId,
        pan_number: pan_number || null,
      })
      .eq("id", vendorId)
    if (soloGroupError) throw soloGroupError

    const { error: linkError } = await db()
      .from("organization_vendors")
      .insert(targetOrgIds.map((orgId) => ({ org_id: orgId, vendor_id: vendorId, status: "pending_review" })))
    if (linkError) throw linkError

    return res.status(201).json({ data: { id: vendorId } })
  } catch (err: any) {
    console.error("[vendors/create] full error:", err)
    res.status(500).json({ error: "Failed to submit onboarding" })
  }
})

// POST /api/vendors/admin-onboard — an org/group admin registers a new
// vendor on the org's/group's behalf (distinct from /create, which is the
// vendor's own self-service submission). Reach is a SNAPSHOT taken at
// onboarding time (confirmed decision): a group-context submission grants
// access to every org that's an ACTIVE member of that group RIGHT NOW, and
// never changes automatically afterward -- an org later leaving the group
// keeps its existing organization_vendors row untouched, and an org later
// joining does NOT retroactively gain this vendor (extending reach to a
// newly-joined org is a separate, deliberate action, not built here).
//
// groupId is supplied by the caller's UI entry point (Group Overview vs a
// standalone org's own vendor list), not inferred here -- an org can be an
// active member of more than one group at once (the JV case), so only the
// screen the admin actually launched this from knows which group (if any)
// this onboarding is for.
router.post("/admin-onboard", requireAuth, requireOrg, async (req: Request, res: Response) => {
  const actorId = (req as AuthenticatedRequest).user.id
  const { orgId, orgAccess } = req as OrgScopedRequest
  try {
    const {
      company_name, legal_name, contact_name, contact_email, contact_phone,
      tax_gst_number, pan_number, registration_number,
      bank_name, bank_account_number, bank_routing_number,
      category_ids, groupId,
    } = req.body

    if (!company_name || !contact_name || !contact_email) {
      return res.status(400).json({ error: "company_name, contact_name, and contact_email are required" })
    }

    let targetOrgIds: string[] = [orgId]
    let onboardedViaGroupId: string | null = null

    if (groupId) {
      const { data: membership, error: memError } = await db()
        .from("group_organizations")
        .select("id")
        .eq("group_id", groupId)
        .eq("organization_id", orgId)
        .is("effective_to", null)
        .eq("status", "active")
        .maybeSingle()
      if (memError) throw memError
      if (!membership) {
        return res.status(400).json({ error: "The active organization is not a current member of the specified group" })
      }

      const { data: siblings, error: siblingsError } = await db()
        .from("group_organizations")
        .select("organization_id")
        .eq("group_id", groupId)
        .is("effective_to", null)
        .eq("status", "active")
      if (siblingsError) throw siblingsError
      targetOrgIds = [...new Set<string>((siblings ?? []).map((s: any) => s.organization_id))]
      onboardedViaGroupId = groupId
    }

    // profile_id is NULL -- this vendor has no login yet (admin-initiated,
    // not a self-service signup). create_vendor_with_categories accepts a
    // null profile_id; the constraint that prevented duplicate vendors per
    // profile in /create doesn't apply here since there's no profile yet.
    const { data: vendorId, error: vendorErr } = await db().rpc("create_vendor_with_categories", {
      p_profile_id: null,
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

    const { error: updateError } = await db()
      .from("vendors")
      .update({
        legal_name: legal_name || null,
        pan_number: pan_number || null,
        registration_number: registration_number || null,
        onboarded_via_group_id: onboardedViaGroupId,
      })
      .eq("id", vendorId)
    if (updateError) throw updateError

    const { error: linkError } = await db()
      .from("organization_vendors")
      .insert(targetOrgIds.map((oid) => ({ org_id: oid, vendor_id: vendorId, status: "pending_review" })))
    if (linkError) throw linkError

    await writeAudit({
      entityType: "vendor",
      entityId: vendorId,
      action: "vendor_admin_onboarded",
      newValue: { company_name, org_ids: targetOrgIds, group_id: onboardedViaGroupId },
      performedBy: actorId,
      orgId,
      actingAs: orgAccess === "group_admin" ? "group_admin" : null,
    })

    res.status(201).json({ data: { id: vendorId, orgIds: targetOrgIds } })
  } catch (err: any) {
    console.error("[vendors/admin-onboard]", err.message)
    res.status(500).json({ error: err.message || "Failed to onboard vendor" })
  }
})

// POST /api/vendors/invite-portal-user — bootstraps portal access for a
// vendor that has zero vendor_users rows (the admin-onboard path creates the
// vendor record with profile_id: null and no login at all). Once this first
// user exists, that vendor's own staff manage further invites themselves via
// /api/vendor-users/invite -- this route exists only to break the chicken-
// and-egg problem of the very first one, so it's deliberately a one-time
// action (409 if the vendor already has any portal users) rather than a
// general-purpose invite endpoint duplicating vendor-users.ts.
router.post("/invite-portal-user", requireAuth, requireOrg, async (req: Request, res: Response) => {
  const actorId = (req as AuthenticatedRequest).user.id
  const { orgId, orgAccess } = req as OrgScopedRequest
  try {
    const { vendor_id } = req.body
    if (!vendor_id) return res.status(400).json({ error: "vendor_id is required" })

    const { data: link, error: linkError } = await db()
      .from("organization_vendors")
      .select("id")
      .eq("org_id", orgId)
      .eq("vendor_id", vendor_id)
      .maybeSingle()
    if (linkError) throw linkError
    if (!link) return res.status(404).json({ error: "This vendor is not linked to the active organization" })

    const { data: existingUsers, error: existingError } = await db()
      .from("vendor_users")
      .select("id")
      .eq("vendor_id", vendor_id)
      .limit(1)
    if (existingError) throw existingError
    if (existingUsers && existingUsers.length > 0) {
      return res.status(409).json({ error: "This vendor already has portal users — ask an existing vendor admin to invite more staff" })
    }

    const { data: vendor, error: vendorError } = await db()
      .from("vendors")
      .select("contact_name, contact_email")
      .eq("id", vendor_id)
      .single()
    if (vendorError) throw vendorError
    const normalizedEmail = vendor.contact_email.trim().toLowerCase()

    let profileId: string | null = null
    let createdNewAuthUser = false
    let vendorUserId: string | null = null

    try {
      const { data: existingProfile } = await db().from("profiles").select("id").eq("email", normalizedEmail).maybeSingle()

      let inviteSent = false
      if (existingProfile) {
        profileId = existingProfile.id
      } else {
        const { data: invited, error: inviteError } = await db().auth.admin.inviteUserByEmail(normalizedEmail, {
          redirectTo: `${process.env.FRONTEND_URL}/accept-invite`,
          data: { full_name: vendor.contact_name, role: "vendor" },
        })
        if (inviteError) throw inviteError
        createdNewAuthUser = true
        profileId = invited.user.id
        inviteSent = true
      }

      const { data: newVendorUser, error: vuError } = await db()
        .from("vendor_users")
        .insert({ vendor_id, profile_id: profileId, status: "invited", is_primary: true })
        .select("id")
        .single()
      if (vuError) throw vuError
      vendorUserId = newVendorUser.id

      const { data: adminRole } = await db().from("roles").select("id").eq("scope", "vendor").eq("name", "Admin").maybeSingle()
      if (adminRole) {
        const { error: rolesError } = await db()
          .from("vendor_user_roles")
          .insert({ vendor_user_id: vendorUserId, role_id: adminRole.id })
        if (rolesError) throw rolesError
      }

      await writeAudit({
        entityType: "vendor_user",
        entityId: vendorUserId!,
        action: "vendor_portal_user_invited",
        newValue: { email: normalizedEmail, vendor_id, invite_sent: inviteSent },
        performedBy: actorId,
        orgId,
        actingAs: orgAccess === "group_admin" ? "group_admin" : null,
      })

      res.status(201).json({ data: { vendorUserId, email: normalizedEmail, inviteSent } })
    } catch (err: any) {
      try {
        if (vendorUserId) await db().from("vendor_users").delete().eq("id", vendorUserId)
        if (profileId && createdNewAuthUser) {
          await db().from("profiles").delete().eq("id", profileId)
          await db().auth.admin.deleteUser(profileId)
        }
      } catch (cleanupErr: any) {
        console.error("[vendors/invite-portal-user] cleanup failed", cleanupErr.message)
      }
      throw err
    }
  } catch (err: any) {
    console.error("[vendors/invite-portal-user]", err.message)
    res.status(500).json({ error: err.message || "Failed to invite vendor to the portal" })
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

    const ALLOWED_DOC_MIME_TYPES = new Set([
      "application/pdf",
      "image/jpeg",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ])
    const MAX_DOC_SIZE_BYTES = 15 * 1024 * 1024 // 15MB

    if (buffer.length > MAX_DOC_SIZE_BYTES) {
      return res.status(400).json({ error: "File exceeds the 15MB size limit" })
    }
    if (!ALLOWED_DOC_MIME_TYPES.has(mimeType)) {
      return res.status(400).json({ error: "Only PDF, JPEG, and DOCX files are allowed" })
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
// Rolls back a pending_review organization_vendors relationship owned by the
// authenticated user. Only deletes the underlying vendor record too if this
// was its only org relationship (i.e. a brand-new vendor, not a re-onboard).
router.post("/cancel-onboarding", requireAuth, async (req: Request, res: Response) => {
  const profileId = (req as AuthenticatedRequest).user.id
  try {
    const { vendor_id } = req.body
    if (!vendor_id) return res.status(400).json({ error: "vendor_id is required" })

    const { data: vendor } = await db()
      .from("vendors")
      .select("id")
      .eq("id", vendor_id)
      .eq("profile_id", profileId)
      .maybeSingle()
    if (!vendor) return res.status(404).json({ error: "Vendor not found" })

    const headerOrgId = req.headers["x-org-id"]
    const orgId = typeof headerOrgId === "string" && headerOrgId ? headerOrgId : await getDefaultOrgId()

    const { error: unlinkError } = await db()
      .from("organization_vendors")
      .delete()
      .eq("org_id", orgId)
      .eq("vendor_id", vendor_id)
      .eq("status", "pending_review")
    if (unlinkError) throw unlinkError

    const { count } = await db()
      .from("organization_vendors")
      .select("*", { count: "exact", head: true })
      .eq("vendor_id", vendor_id)

    if ((count ?? 0) === 0) {
      const { error: deleteError } = await db().from("vendors").delete().eq("id", vendor_id)
      if (deleteError) throw deleteError
    }

    res.json({ ok: true })
  } catch (err: any) {
    console.error("[vendors/cancel-onboarding]", err.message)
    res.status(500).json({ error: "Failed to cancel onboarding" })
  }
})

// POST /api/vendors/by-categories
router.post("/by-categories", requireAuth, requireOrg, async (req: Request, res: Response) => {
  try {
    const { categoryIds } = req.body
    const { orgId } = req as OrgScopedRequest
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
      .select("id, company_name, contact_name, organization_vendors!inner(status)")
      .in("id", vendorIds)
      .eq("organization_vendors.org_id", orgId)
      .eq("organization_vendors.status", "active")
      .eq("verification_status", "verified")
      .order("company_name", { ascending: true })

    if (error) throw error

    res.json({ data: (data ?? []).map(({ organization_vendors, ...v }: any) => v) })
  } catch (err: any) {
    console.error("[vendors/by-categories]", err.message)
    res.status(500).json({ error: "Failed to get vendors by categories" })
  }
})

export default router
