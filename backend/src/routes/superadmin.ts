import { Router, Request, Response } from "express"
import { getSupabaseAdmin, getSupabaseAsUser } from "../utils/supabaseAdmin"
import { requireAuth, AuthenticatedRequest } from "../middleware/auth"
import { requireSuperAdmin } from "../middleware/superadmin"
import { ServiceError, mergeGroups, removeOrgFromGroup, dissolveGroup } from "../services/groups"
import { writeAudit } from "../services/audit"
import { generateUniqueOrgCode, generateUniqueGroupCode } from "../utils/codeGenerator"
import { sendEmail, inviteHtml } from "../services/email.service"
import { ensureDefaultLegalEntity } from "../services/legalEntity.service"
import { resolveOnboardingTargets } from "./vendors"
import { findOrgRoleHolderIds, notifyUsers } from "../services/approvalGate"

const router = Router()
function db(): any { return getSupabaseAdmin() }

// POST /api/superadmin/whoami — lets the frontend check platform-admin
// status without hard-failing (used to decide whether to show the
// superadmin nav entry at all).
router.post("/whoami", requireAuth, async (req: Request, res: Response) => {
  const userId = (req as AuthenticatedRequest).user?.id
  const { data } = await db().from("platform_admins").select("profile_id").eq("profile_id", userId).maybeSingle()
  const { count } = await db()
    .from("organization_members")
    .select("id", { count: "exact", head: true })
    .eq("profile_id", userId)
    .eq("status", "active")
  res.json({ data: { isPlatformAdmin: !!data, hasOrgMembership: (count ?? 0) > 0 } })
})

// The single displayed "status" for an org, folding its lifecycle status
// (organizations.status) together with its onboarding draft's state --
// confirmed mapping:
//   no draft, or draft never submitted (and never rejected)  -> onboarding_pending
//   draft submitted, awaiting superadmin decision             -> pending_verification
//   draft approved (org.status is 'active' by this point)     -> active
//   draft rejected (reopened as 'draft' + rejection_reason),
//     or org.status is 'suspended'                             -> suspended
//   org.status is 'archived'                                   -> archived
// org.status 'archived'/'suspended' always wins over the draft's own state
// since those are explicit superadmin actions on the org itself.
export type EffectiveOrgStatus = "onboarding_pending" | "pending_verification" | "active" | "suspended" | "archived"

function computeEffectiveOrgStatus(
  orgStatus: string,
  draft: { status: string; rejection_reason: string | null } | null
): EffectiveOrgStatus {
  if (orgStatus === "archived") return "archived"
  if (orgStatus === "suspended") return "suspended"
  if (!draft) return "active"
  if (draft.status === "submitted") return "pending_verification"
  if (draft.status === "rejected" || (draft.status === "draft" && draft.rejection_reason)) return "suspended"
  if (draft.status === "approved") return "active"
  return "onboarding_pending"
}

// POST /api/superadmin/organizations/list — every org, platform-wide, each
// with its computed effectiveStatus (see computeEffectiveOrgStatus above).
// There's no separate "Org Onboarding" queue tab any more; review happens
// from within that org's own detail view.
router.post("/organizations/list", requireAuth, requireSuperAdmin, async (_req: Request, res: Response) => {
  try {
    const { data, error } = await db()
      .from("organizations")
      .select("*, organization_members(count), organization_vendors(count)")
      .order("created_at", { ascending: false })
    if (error) throw error

    const { data: drafts, error: draftError } = await db()
      .from("org_onboarding_drafts")
      .select("org_id, status, rejection_reason, created_at")
      .order("created_at", { ascending: false })
    if (draftError) throw draftError
    // Most recent draft per org (there can only realistically be one live
    // draft per org, but be defensive about ordering).
    const latestDraftByOrg = new Map<string, any>()
    for (const d of drafts ?? []) {
      if (!latestDraftByOrg.has(d.org_id)) latestDraftByOrg.set(d.org_id, d)
    }

    const result = (data ?? []).map((org: any) => ({
      ...org,
      effectiveStatus: computeEffectiveOrgStatus(org.status, latestDraftByOrg.get(org.id) ?? null),
    }))
    res.json({ data: result })
  } catch (err: any) {
    console.error("[superadmin/organizations/list]", err.message)
    res.status(500).json({ error: "Failed to list organizations" })
  }
})

// POST /api/superadmin/organizations/detail — full detail view for one org:
// the org row itself, its members (flat, with resolved role names), its
// vendors (flat, with per-org status), and its onboarding draft (if any --
// regardless of status, so a past approve/reject decision is still visible;
// the frontend only shows Approve/Reject actions when status is 'submitted').
router.post("/organizations/detail", requireAuth, requireSuperAdmin, async (req: Request, res: Response) => {
  try {
    const { org_id } = req.body as { org_id?: string }
    if (!org_id) return res.status(400).json({ error: "org_id is required" })

    const { data: organization, error: orgError } = await db()
      .from("organizations")
      .select("*")
      .eq("id", org_id)
      .single()
    if (orgError) throw orgError

    const { data: memberRows, error: memberError } = await db()
      .from("organization_members")
      .select("id, status, is_primary, profile:profile_id(id, full_name, email)")
      .eq("org_id", org_id)
    if (memberError) throw memberError

    const memberIds = (memberRows ?? []).map((m: any) => m.id)
    const roleNamesByMember = new Map<string, string[]>()
    if (memberIds.length > 0) {
      const { data: memberRoles, error: mrError } = await db()
        .from("org_member_roles")
        .select("org_member_id, role:role_id(name)")
        .in("org_member_id", memberIds)
      if (mrError) throw mrError
      for (const row of memberRoles ?? []) {
        const names = roleNamesByMember.get(row.org_member_id) ?? []
        names.push(row.role.name)
        roleNamesByMember.set(row.org_member_id, names)
      }
    }
    const members = (memberRows ?? []).map((m: any) => ({
      id: m.id,
      status: m.status,
      isPrimary: m.is_primary,
      profile: m.profile,
      roleNames: roleNamesByMember.get(m.id) ?? [],
    }))

    const { data: vendorRows, error: vendorError } = await db()
      .from("vendors")
      .select("id, company_name, contact_name, contact_email, organization_vendors!inner(status)")
      .eq("organization_vendors.org_id", org_id)
    if (vendorError) throw vendorError
    const vendors = (vendorRows ?? []).map((v: any) => ({
      id: v.id,
      companyName: v.company_name,
      contactName: v.contact_name,
      contactEmail: v.contact_email,
      status: Array.isArray(v.organization_vendors) ? v.organization_vendors[0]?.status : v.organization_vendors?.status,
    }))

    const { data: draft } = await db()
      .from("org_onboarding_drafts")
      .select("*")
      .eq("org_id", org_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()

    let onboardingDraft = null
    if (draft) {
      const [{ data: locations }, { data: documents }] = await Promise.all([
        db().from("org_onboarding_locations").select("*").eq("draft_id", draft.id).order("created_at", { ascending: true }),
        db().from("organization_onboarding_documents").select("*").eq("draft_id", draft.id).order("uploaded_at", { ascending: true }),
      ])
      onboardingDraft = { ...draft, locations: locations ?? [], documents: documents ?? [] }
    }

    res.json({ data: { organization, members, vendors, onboardingDraft } })
  } catch (err: any) {
    console.error("[superadmin/organizations/detail]", err.message)
    res.status(500).json({ error: "Failed to load organization detail" })
  }
})

// POST /api/superadmin/organizations/create
router.post("/organizations/create", requireAuth, requireSuperAdmin, async (req: Request, res: Response) => {
  try {
    const { name, slug } = req.body
    if (!name || !slug) return res.status(400).json({ error: "name and slug are required" })

    const orgCode = await generateUniqueOrgCode(name)
    const { data, error } = await db()
      .from("organizations")
      .insert({ name, slug, status: "active", org_code: orgCode })
      .select()
      .single()
    if (error) throw error

    res.status(201).json({ data })
  } catch (err: any) {
    console.error("[superadmin/organizations/create]", err.message)
    res.status(500).json({ error: err.message || "Failed to create organization" })
  }
})

// POST /api/superadmin/organizations/update-status — suspend/archive/
// reactivate. A reason is required to suspend or archive (not to
// reactivate) and is written to the audit log -- this route previously
// wrote no audit trail at all.
router.post("/organizations/update-status", requireAuth, requireSuperAdmin, async (req: Request, res: Response) => {
  try {
    const { id, status, reason } = req.body
    if (!id || !["active", "suspended", "archived"].includes(status)) {
      return res.status(400).json({ error: "id and a valid status (active, suspended, archived) are required" })
    }
    if ((status === "suspended" || status === "archived") && !reason?.trim()) {
      return res.status(400).json({ error: "A reason is required to suspend or archive an organization" })
    }

    const { data, error } = await db()
      .from("organizations")
      .update({ status })
      .eq("id", id)
      .select()
      .single()
    if (error) throw error

    const actorId = (req as AuthenticatedRequest).user.id
    await writeAudit({
      entityType: "organization",
      entityId: id,
      action: `organization_${status}`,
      newValue: reason ? { reason: reason.trim() } : undefined,
      performedBy: actorId,
      orgId: id,
    })

    res.json({ data })
  } catch (err: any) {
    console.error("[superadmin/organizations/update-status]", err.message)
    res.status(500).json({ error: "Failed to update organization status" })
  }
})

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// POST /api/superadmin/organizations/create-with-admin — the real onboarding
// path: create an org and invite its first admin in one step. Never touches
// a plaintext password -- if the email has no existing Supabase Auth user,
// generateLink() creates the account and returns an invite link, which we
// email ourselves via our own SMTP service (email.service.ts) rather than
// Supabase's own outgoing mailer.
router.post("/organizations/create-with-admin", requireAuth, requireSuperAdmin, async (req: Request, res: Response) => {
  const { orgName, orgCode, adminEmail, adminName } = req.body as {
    orgName?: string; orgCode?: string; adminEmail?: string; adminName?: string
  }
  const actorId = (req as AuthenticatedRequest).user.id

  if (!orgName?.trim() || !orgCode?.trim() || !adminEmail?.trim() || !adminName?.trim()) {
    return res.status(400).json({ error: "orgName, orgCode, adminEmail, and adminName are all required" })
  }
  const email = adminEmail.trim().toLowerCase()
  if (!EMAIL_RE.test(email)) {
    return res.status(400).json({ error: "adminEmail is not a valid email address" })
  }
  const slug = orgCode.trim().toLowerCase()

  const { data: slugClash } = await db().from("organizations").select("id").eq("slug", slug).maybeSingle()
  if (slugClash) return res.status(409).json({ error: "orgCode is already in use by another organization" })

  // Compensating cleanup, since supabase-js doesn't give us a cross-table
  // transaction here: if any later step fails, undo everything created so
  // far rather than leaving an org with no admin, or a stray invited profile.
  let orgId: string | null = null
  let createdNewAuthUser = false
  let profileId: string | null = null

  try {
    const orgCode = await generateUniqueOrgCode(orgName.trim())
    const { data: org, error: orgError } = await db()
      .from("organizations")
      .insert({ name: orgName.trim(), slug, status: "active", org_code: orgCode })
      .select()
      .single()
    if (orgError) throw orgError
    orgId = org.id

    const { data: existingProfile } = await db()
      .from("profiles")
      .select("id")
      .eq("email", email)
      .maybeSingle()

    let inviteSent = false

    if (existingProfile) {
      profileId = existingProfile.id
    } else {
      const { data: invited, error: inviteError } = await db().auth.admin.generateLink({
        type: "invite",
        email,
        options: {
          redirectTo: `${process.env.FRONTEND_URL}/accept-invite`,
          data: { full_name: adminName.trim(), role: "admin" },
        },
      })
      if (inviteError) throw inviteError
      createdNewAuthUser = true
      profileId = invited.user.id
      inviteSent = true

      // No manual profiles insert here: the on_auth_user_created trigger
      // (supabase/migrations/003_triggers.sql) fires synchronously on the
      // auth.users insert this API call makes, and already creates the
      // profiles row from the same user_metadata passed above (full_name,
      // role) -- inserting again here would just collide on profiles_pkey.
      await sendEmail({
        to: email,
        subject: `You've been invited to join ${orgName.trim()} on CogniVend`,
        html: inviteHtml({ fullName: adminName.trim(), entityName: orgName.trim(), entityLabel: "the organization admin", inviteLink: invited.properties.action_link }),
      })
    }

    // org_role is kept populated for now (not dropped until the RLS cutover
    // and legacy-drop migrations are verified) -- org_member_roles is the
    // new, additional source of truth going forward. This route doesn't
    // (yet) accept a solo/tiered choice at creation time, so the new org
    // just gets the 'tiered' default from 019 and its first admin gets a
    // single Admin role, not the solo-mode union of all three.
    const { data: newMember, error: memberError } = await db()
      .from("organization_members")
      .insert({ org_id: orgId, profile_id: profileId, org_role: "org_admin", status: "invited", is_primary: false })
      .select("id")
      .single()
    if (memberError) throw memberError

    const { data: adminRole, error: adminRoleError } = await db()
      .from("roles")
      .select("id")
      .eq("scope", "org")
      .eq("name", "Admin")
      .single()
    if (adminRoleError) throw adminRoleError

    const { error: memberRoleError } = await db()
      .from("org_member_roles")
      .insert({ org_member_id: newMember.id, role_id: adminRole.id })
    if (memberRoleError) throw memberRoleError

    await db().from("audit_log").insert([
      {
        entity_type: "organization", entity_id: orgId, action: "organization_created",
        new_value: { name: orgName.trim(), slug }, performed_by: actorId, org_id: orgId,
      },
      {
        entity_type: "organization", entity_id: orgId, action: "admin_invited",
        new_value: { email, full_name: adminName.trim(), invite_sent: inviteSent },
        performed_by: actorId, org_id: orgId,
      },
    ])

    res.status(201).json({ data: { organization: org, adminEmail: email, inviteSent } })
  } catch (err: any) {
    console.error("[superadmin/organizations/create-with-admin]", err.message)
    try {
      if (profileId && createdNewAuthUser) {
        await db().from("profiles").delete().eq("id", profileId)
        await db().auth.admin.deleteUser(profileId)
      }
      if (orgId) await db().from("organizations").delete().eq("id", orgId)
    } catch (cleanupErr: any) {
      console.error("[superadmin/organizations/create-with-admin] cleanup failed", cleanupErr.message)
    }
    res.status(500).json({ error: err.message || "Failed to create organization" })
  }
})

// POST /api/superadmin/vendors/verification-queue — every vendor's
// verification record (not just pending ones -- a vendor already verified
// can still be revisited, e.g. to suspend it later). Selects ONLY legal/
// registration fields at the query level (not just hidden in the UI) --
// never bank details, other compliance documents, or which org/group
// onboarded them, per the confirmed requirement that verification review
// is blind to reach and financials.
router.post("/vendors/verification-queue", requireAuth, requireSuperAdmin, async (_req: Request, res: Response) => {
  try {
    const { data, error } = await db()
      .from("vendors")
      .select("id, company_name, legal_name, tax_gst_number, pan_number, registration_number, created_at, verification_status")
      .order("created_at", { ascending: false })
    if (error) throw error

    const vendorIds = (data ?? []).map((v: any) => v.id)
    let docsByVendor = new Map<string, any[]>()
    let categoriesByVendor = new Map<string, string[]>()
    if (vendorIds.length > 0) {
      // Only registration-category documents -- never insurance/bank/other
      // compliance docs, consistent with the legal-only review scope.
      const { data: docs, error: docsError } = await db()
        .from("vendor_documents")
        .select("id, vendor_id, document_type, file_name, storage_path, uploaded_at")
        .in("vendor_id", vendorIds)
        .in("document_type", ["tc_agreement", "tax_certificate"])
      if (docsError) throw docsError
      for (const doc of docs ?? []) {
        const list = docsByVendor.get(doc.vendor_id) ?? []
        list.push(doc)
        docsByVendor.set(doc.vendor_id, list)
      }

      // Vendor-level service categories (vendor_categories has no org_id --
      // these are the vendor's own claimed categories, not tied to any
      // specific onboarding org/group) -- safe to show alongside the
      // legal/registration fields above.
      const { data: cats, error: catsError } = await db()
        .from("vendor_categories")
        .select("vendor_id, service_categories(name)")
        .in("vendor_id", vendorIds)
      if (catsError) throw catsError
      for (const c of cats ?? []) {
        const list = categoriesByVendor.get(c.vendor_id) ?? []
        if (c.service_categories?.name) list.push(c.service_categories.name)
        categoriesByVendor.set(c.vendor_id, list)
      }
    }

    const result = (data ?? []).map((v: any) => ({
      id: v.id,
      companyLegalName: v.legal_name || v.company_name,
      gstNumber: v.tax_gst_number,
      panNumber: v.pan_number,
      registrationNumber: v.registration_number,
      submittedAt: v.created_at,
      verificationStatus: v.verification_status,
      registrationDocuments: docsByVendor.get(v.id) ?? [],
      categories: categoriesByVendor.get(v.id) ?? [],
    }))
    res.json({ data: result })
  } catch (err: any) {
    console.error("[superadmin/vendors/verification-queue]", err.message)
    res.status(500).json({ error: "Failed to load verification queue" })
  }
})

// POST /api/superadmin/vendors/verification-status — vendor GLOBAL
// verification status only. Never touches organization_vendors.status
// (each org's own approval decision) or bank/compliance document contents.
router.post("/vendors/verification-status", requireAuth, requireSuperAdmin, async (req: Request, res: Response) => {
  try {
    const { vendor_id, verification_status, reason } = req.body
    if (!vendor_id || !["pending", "verified", "rejected"].includes(verification_status)) {
      return res.status(400).json({ error: "vendor_id and a valid verification_status are required" })
    }
    if (verification_status === "rejected" && !reason?.trim()) {
      return res.status(400).json({ error: "A reason is required to reject a vendor" })
    }

    const { data, error } = await db()
      .from("vendors")
      .update({ verification_status })
      .eq("id", vendor_id)
      .select("id, company_name, verification_status")
      .single()
    if (error) throw error

    const actorId = (req as AuthenticatedRequest).user.id
    await writeAudit({
      entityType: "vendor",
      entityId: vendor_id,
      action: `vendor_${verification_status}`,
      newValue: reason ? { reason } : undefined,
      performedBy: actorId,
      orgId: null,
    })

    res.json({ data })
  } catch (err: any) {
    console.error("[superadmin/vendors/verification-status]", err.message)
    res.status(500).json({ error: "Failed to update vendor verification status" })
  }
})

// POST /api/superadmin/vendors/organizations — which organisations a vendor
// is mapped to (organization_vendors join). Deliberately a separate endpoint
// from vendors/verification-queue above, fetched only when a reviewer opens
// the "Organizations" tab -- the queue itself stays blind to org/reach.
router.post("/vendors/organizations", requireAuth, requireSuperAdmin, async (req: Request, res: Response) => {
  try {
    const { vendor_id } = req.body as { vendor_id?: string }
    if (!vendor_id) return res.status(400).json({ error: "vendor_id is required" })

    const { data, error } = await db()
      .from("organization_vendors")
      .select("status, contract_start_date, contract_anniversary, organization:org_id(id, name, org_code, status)")
      .eq("vendor_id", vendor_id)
    if (error) throw error

    const result = (data ?? [])
      .filter((row: any) => row.organization)
      .map((row: any) => ({
        orgId: row.organization.id,
        orgName: row.organization.name,
        orgCode: row.organization.org_code,
        orgStatus: row.organization.status,
        mappingStatus: row.status,
        contractStartDate: row.contract_start_date,
        contractAnniversary: row.contract_anniversary,
      }))
    res.json({ data: result })
  } catch (err: any) {
    console.error("[superadmin/vendors/organizations]", err.message)
    res.status(500).json({ error: "Failed to load vendor's organizations" })
  }
})

// POST /api/superadmin/break-glass/view — time-of-access-logged read of an
// entity superadmin has no standing access to. Requires a reason; writes an
// audit_log entry via support_view_entity() before fetching the row.
router.post("/break-glass/view", requireAuth, requireSuperAdmin, async (req: Request, res: Response) => {
  try {
    const { entityType, entityId, reason } = req.body
    const ALLOWED = ["purchase_request", "purchase_order", "grn", "invoice", "contract", "quotation"]
    if (!entityType || !ALLOWED.includes(entityType) || !entityId || !reason?.trim()) {
      return res.status(400).json({ error: "entityType (one of: " + ALLOWED.join(", ") + "), entityId, and a non-empty reason are required" })
    }

    // support_view_entity() checks is_platform_admin() via auth.uid(), which
    // only resolves when the call carries the caller's own JWT -- the
    // service-role client has none, so this must go through a per-caller
    // client, not db()/getSupabaseAdmin().
    const callerToken = req.headers.authorization!.replace("Bearer ", "")
    const { error: logError } = await getSupabaseAsUser(callerToken).rpc("support_view_entity", {
      p_entity_type: entityType,
      p_entity_id: entityId,
      p_reason: reason,
    })
    if (logError) throw logError

    const table = `${entityType}s`
    const { data, error } = await db().from(table).select("*").eq("id", entityId).single()
    if (error) throw error

    res.json({ data })
  } catch (err: any) {
    console.error("[superadmin/break-glass/view]", err.message)
    res.status(500).json({ error: err.message || "Failed to access entity" })
  }
})

// POST /api/superadmin/audit-log — platform-wide audit log, including
// break-glass access records. Not org-scoped (this route is itself the
// audited path for platform-level oversight). Filterable by org, entity
// type/id, action, actor, acting_as, and a created_at date range.
router.post("/audit-log", requireAuth, requireSuperAdmin, async (req: Request, res: Response) => {
  try {
    const { orgId, entityType, entityId, action, performedBy, actingAs, dateFrom, dateTo } = req.body as {
      orgId?: string; entityType?: string; entityId?: string; action?: string
      performedBy?: string; actingAs?: "group_admin" | "superadmin" | "none"
      dateFrom?: string; dateTo?: string
    }

    let query = db()
      .from("audit_log")
      .select("*, profiles:performed_by(full_name, email), organizations:org_id(name)")
      .order("created_at", { ascending: false })
      .limit(200)

    if (orgId) query = query.eq("org_id", orgId)
    if (entityType) query = query.eq("entity_type", entityType)
    if (entityId) query = query.eq("entity_id", entityId)
    if (action) query = query.eq("action", action)
    if (performedBy) query = query.eq("performed_by", performedBy)
    if (actingAs === "none") query = query.is("acting_as", null)
    else if (actingAs) query = query.eq("acting_as", actingAs)
    if (dateFrom) query = query.gte("created_at", dateFrom)
    if (dateTo) query = query.lte("created_at", dateTo)

    const { data, error } = await query
    if (error) throw error
    res.json({ data })
  } catch (err: any) {
    console.error("[superadmin/audit-log]", err.message)
    res.status(500).json({ error: "Failed to load platform audit log" })
  }
})

// POST /api/superadmin/groups/health — groups with zero active group_admin
// assignments (groups_without_active_admin, 015_group_functions.sql). The
// one group state that doesn't self-heal (nothing can be approved or
// reassigned there), so it needs active surfacing rather than a passive
// alert. Polled by the superadmin dashboard, not pushed -- no Node
// scheduler exists in this backend today.
router.post("/groups/health", requireAuth, requireSuperAdmin, async (_req: Request, res: Response) => {
  try {
    const { data, error } = await db().from("groups_without_active_admin").select("*")
    if (error) throw error
    res.json({ data })
  } catch (err: any) {
    console.error("[superadmin/groups/health]", err.message)
    res.status(500).json({ error: "Failed to load group health" })
  }
})

function handleServiceError(err: any, res: Response, fallbackMessage: string) {
  if (err instanceof ServiceError) {
    return res.status(409).json({ error: err.message, code: err.code, details: err.details })
  }
  console.error(fallbackMessage, err.message)
  return res.status(500).json({ error: err.message || fallbackMessage })
}

// POST /api/superadmin/groups/merge — superadmin fallback for merging one
// group into another (Phase 4.6): absorbed group's primary is discarded
// outright; the surviving group's primary is nulled, never inherited, if it
// no longer applies post-merge.
router.post("/groups/merge", requireAuth, requireSuperAdmin, async (req: Request, res: Response) => {
  try {
    const { survivingGroupId, absorbedGroupId } = req.body
    if (!survivingGroupId || !absorbedGroupId) {
      return res.status(400).json({ error: "survivingGroupId and absorbedGroupId are required" })
    }
    const actorId = (req as AuthenticatedRequest).user.id
    await mergeGroups(survivingGroupId, absorbedGroupId, actorId)
    res.json({ data: { merged: true } })
  } catch (err: any) {
    handleServiceError(err, res, "Failed to merge groups")
  }
})

// POST /api/superadmin/groups/remove-org — superadmin fallback for removing
// an org from a group (Phase 4.7): blocks with a structured 409 if the org
// is the group's current primary and no successor was chosen.
router.post("/groups/remove-org", requireAuth, requireSuperAdmin, async (req: Request, res: Response) => {
  try {
    const { groupId, organizationId, successorOrgId } = req.body
    if (!groupId || !organizationId) {
      return res.status(400).json({ error: "groupId and organizationId are required" })
    }
    const actorId = (req as AuthenticatedRequest).user.id
    await removeOrgFromGroup(groupId, organizationId, successorOrgId, actorId)
    res.json({ data: { removed: true } })
  } catch (err: any) {
    handleServiceError(err, res, "Failed to remove organization from group")
  }
})

// POST /api/superadmin/groups/dissolve — superadmin fallback for dissolving
// a group (Phase 4.7): blocks with a structured 409 (naming every orphaned
// org/sub-group) until a full reassignment plan is supplied -- no cascade.
router.post("/groups/dissolve", requireAuth, requireSuperAdmin, async (req: Request, res: Response) => {
  try {
    const { groupId, plan } = req.body
    if (!groupId) return res.status(400).json({ error: "groupId is required" })
    const actorId = (req as AuthenticatedRequest).user.id
    await dissolveGroup(groupId, plan, actorId)
    res.json({ data: { dissolved: true } })
  } catch (err: any) {
    handleServiceError(err, res, "Failed to dissolve group")
  }
})

// POST /api/superadmin/groups/list — every active/archived/merged group,
// with its direct member orgs and sub-groups, for the Groups module table.
router.post("/groups/list", requireAuth, requireSuperAdmin, async (_req: Request, res: Response) => {
  try {
    const { data: groups, error } = await db()
      .from("organization_groups")
      .select("id, name, parent_group_id, primary_org_id, status, created_at")
      .order("created_at", { ascending: false })
    if (error) throw error

    const groupIds = (groups ?? []).map((g: any) => g.id)
    const orgsByGroup = new Map<string, any[]>()
    const adminsByGroup = new Map<string, any[]>()

    if (groupIds.length > 0) {
      const { data: memberships, error: memError } = await db()
        .from("group_organizations")
        .select("group_id, organization:organization_id(id, name, slug)")
        .in("group_id", groupIds)
        .is("effective_to", null)
        .eq("status", "active")
      if (memError) throw memError
      for (const row of memberships ?? []) {
        const list = orgsByGroup.get(row.group_id) ?? []
        list.push(row.organization)
        orgsByGroup.set(row.group_id, list)
      }

      const { data: admins, error: adminsError } = await db()
        .from("group_members")
        .select("group_id, profile:user_id(id, full_name, email)")
        .in("group_id", groupIds)
        .eq("role", "group_admin")
        .is("effective_to", null)
      if (adminsError) throw adminsError
      for (const row of admins ?? []) {
        const list = adminsByGroup.get(row.group_id) ?? []
        list.push(row.profile)
        adminsByGroup.set(row.group_id, list)
      }
    }

    const data = (groups ?? []).map((g: any) => ({
      id: g.id,
      name: g.name,
      parentGroupId: g.parent_group_id,
      primaryOrgId: g.primary_org_id,
      status: g.status,
      createdAt: g.created_at,
      memberOrgs: orgsByGroup.get(g.id) ?? [],
      subGroups: (groups ?? []).filter((sg: any) => sg.parent_group_id === g.id).map((sg: any) => ({ id: sg.id, name: sg.name })),
      admins: adminsByGroup.get(g.id) ?? [],
    }))

    res.json({ data })
  } catch (err: any) {
    console.error("[superadmin/groups/list]", err.message)
    res.status(500).json({ error: "Failed to list groups" })
  }
})

// POST /api/superadmin/groups/create
router.post("/groups/create", requireAuth, requireSuperAdmin, async (req: Request, res: Response) => {
  try {
    const { name, parentGroupId } = req.body
    if (!name?.trim()) return res.status(400).json({ error: "name is required" })

    const code = await generateUniqueGroupCode(name.trim())
    const { data, error } = await db()
      .from("organization_groups")
      .insert({ name: name.trim(), parent_group_id: parentGroupId ?? null, code })
      .select()
      .single()
    if (error) throw error

    res.status(201).json({ data })
  } catch (err: any) {
    console.error("[superadmin/groups/create]", err.message)
    res.status(500).json({ error: err.message || "Failed to create group" })
  }
})

// POST /api/superadmin/groups/add-org — link an org into a group via the
// sanctioned rebind_group_organization SP (014/015 dated-row pattern).
router.post("/groups/add-org", requireAuth, requireSuperAdmin, async (req: Request, res: Response) => {
  try {
    const { groupId, organizationId, relationshipType } = req.body
    if (!groupId || !organizationId) return res.status(400).json({ error: "groupId and organizationId are required" })

    const { error } = await db().rpc("rebind_group_organization", {
      p_group_id: groupId,
      p_organization_id: organizationId,
      p_relationship_type: relationshipType ?? "member",
    })
    if (error) throw error

    const actorId = (req as AuthenticatedRequest).user.id
    await writeAudit({
      entityType: "organization_group",
      entityId: groupId,
      action: "org_added_to_group",
      newValue: { organization_id: organizationId, relationship_type: relationshipType ?? "member" },
      performedBy: actorId,
      orgId: organizationId,
    })

    res.json({ data: { added: true } })
  } catch (err: any) {
    console.error("[superadmin/groups/add-org]", err.message)
    res.status(500).json({ error: err.message || "Failed to add organization to group" })
  }
})

// POST /api/superadmin/groups/set-primary — direct superadmin override of a
// group's primary org (distinct from removeOrgFromGroup's successor flow --
// this is for setting/changing primary outside of a removal). The
// enforce_group_primary_org trigger (015) still enforces the org must be an
// active direct member.
router.post("/groups/set-primary", requireAuth, requireSuperAdmin, async (req: Request, res: Response) => {
  try {
    const { groupId, organizationId } = req.body as { groupId?: string; organizationId?: string | null }
    if (!groupId) return res.status(400).json({ error: "groupId is required" })

    const { error } = await db().from("organization_groups").update({ primary_org_id: organizationId ?? null }).eq("id", groupId)
    if (error) throw error

    const actorId = (req as AuthenticatedRequest).user.id
    await writeAudit({
      entityType: "organization_group",
      entityId: groupId,
      action: "group_primary_org_set",
      newValue: { organization_id: organizationId ?? null },
      performedBy: actorId,
      orgId: organizationId ?? null,
    })

    res.json({ data: { groupId, organizationId: organizationId ?? null } })
  } catch (err: any) {
    console.error("[superadmin/groups/set-primary]", err.message)
    res.status(500).json({ error: err.message || "Failed to set primary organization" })
  }
})

// POST /api/superadmin/groups/reparent — move a sub-group to a new parent
// (or null to promote it to top-level).
router.post("/groups/reparent", requireAuth, requireSuperAdmin, async (req: Request, res: Response) => {
  try {
    const { groupId, newParentGroupId } = req.body as { groupId?: string; newParentGroupId?: string | null }
    if (!groupId) return res.status(400).json({ error: "groupId is required" })

    const { error } = await db().from("organization_groups").update({ parent_group_id: newParentGroupId ?? null }).eq("id", groupId)
    if (error) throw error

    const actorId = (req as AuthenticatedRequest).user.id
    await writeAudit({
      entityType: "organization_group",
      entityId: groupId,
      action: "group_reparented",
      newValue: { new_parent_group_id: newParentGroupId ?? null },
      performedBy: actorId,
      orgId: null,
    })

    res.json({ data: { groupId, newParentGroupId: newParentGroupId ?? null } })
  } catch (err: any) {
    console.error("[superadmin/groups/reparent]", err.message)
    res.status(500).json({ error: err.message || "Failed to reparent group" })
  }
})

// POST /api/superadmin/groups/grant-admin — grant standing group_admin
// access via the sanctioned rebind_group_member SP. Accepts either a raw
// userId or an email (resolved to a profile here) -- no user-search/picker
// endpoint exists yet, so email is the practical way to identify someone.
router.post("/groups/grant-admin", requireAuth, requireSuperAdmin, async (req: Request, res: Response) => {
  try {
    const { groupId, userId: rawUserId, email } = req.body
    if (!groupId || (!rawUserId && !email)) {
      return res.status(400).json({ error: "groupId and either userId or email are required" })
    }

    let targetUserId = rawUserId
    if (!targetUserId && email) {
      const { data: profile, error: profileError } = await db()
        .from("profiles")
        .select("id")
        .eq("email", email.trim().toLowerCase())
        .maybeSingle()
      if (profileError) throw profileError
      if (!profile) return res.status(404).json({ error: `No user found with email ${email}` })
      targetUserId = profile.id
    }

    const { error } = await db().rpc("rebind_group_member", { p_group_id: groupId, p_user_id: targetUserId })
    if (error) throw error

    const actorId = (req as AuthenticatedRequest).user.id
    await writeAudit({
      entityType: "organization_group",
      entityId: groupId,
      action: "group_admin_granted",
      newValue: { user_id: targetUserId },
      performedBy: actorId,
      orgId: null,
    })

    res.json({ data: { granted: true } })
  } catch (err: any) {
    console.error("[superadmin/groups/grant-admin]", err.message)
    res.status(500).json({ error: err.message || "Failed to grant group admin access" })
  }
})

// POST /api/superadmin/groups/revoke-admin
router.post("/groups/revoke-admin", requireAuth, requireSuperAdmin, async (req: Request, res: Response) => {
  try {
    const { groupId, userId: targetUserId } = req.body
    if (!groupId || !targetUserId) return res.status(400).json({ error: "groupId and userId are required" })

    const { error } = await db().rpc("end_group_member", { p_group_id: groupId, p_user_id: targetUserId })
    if (error) throw error

    const actorId = (req as AuthenticatedRequest).user.id
    await writeAudit({
      entityType: "organization_group",
      entityId: groupId,
      action: "group_admin_revoked",
      newValue: { user_id: targetUserId },
      performedBy: actorId,
      orgId: null,
    })

    res.json({ data: { revoked: true } })
  } catch (err: any) {
    console.error("[superadmin/groups/revoke-admin]", err.message)
    res.status(500).json({ error: err.message || "Failed to revoke group admin access" })
  }
})

// ─── Organisation onboarding review queue ───────────────────────────────────
// Distinct review surface from vendors/verification-queue above -- these are
// organisations' own onboarding wizard submissions (org_onboarding_drafts,
// 036_org_onboarding_schema.sql), never vendors' verification_status/
// organization_vendors machinery.

// POST /api/superadmin/organizations/onboarding-queue — orgs awaiting review.
router.post("/organizations/onboarding-queue", requireAuth, requireSuperAdmin, async (_req: Request, res: Response) => {
  try {
    const { data, error } = await db()
      .from("org_onboarding_drafts")
      .select("id, org_id, legal_entity_type, location_setup, submitted_at, status, organization:org_id(name, slug), submitter:created_by(full_name, email)")
      .eq("status", "submitted")
      .order("submitted_at", { ascending: true })
    if (error) throw error

    const draftIds = (data ?? []).map((d: any) => d.id)
    const locationCounts = new Map<string, number>()
    const documentCounts = new Map<string, number>()

    if (draftIds.length > 0) {
      const { data: locs, error: locError } = await db().from("org_onboarding_locations").select("draft_id").in("draft_id", draftIds)
      if (locError) throw locError
      for (const l of locs ?? []) locationCounts.set(l.draft_id, (locationCounts.get(l.draft_id) ?? 0) + 1)

      const { data: docs, error: docError } = await db().from("organization_onboarding_documents").select("draft_id").in("draft_id", draftIds)
      if (docError) throw docError
      for (const d of docs ?? []) documentCounts.set(d.draft_id, (documentCounts.get(d.draft_id) ?? 0) + 1)
    }

    const result = (data ?? []).map((d: any) => ({
      id: d.id,
      orgId: d.org_id,
      orgName: d.organization?.name ?? null,
      orgSlug: d.organization?.slug ?? null,
      submittedByName: d.submitter?.full_name ?? null,
      submittedByEmail: d.submitter?.email ?? null,
      legalEntityType: d.legal_entity_type,
      locationSetup: d.location_setup,
      locationCount: locationCounts.get(d.id) ?? 0,
      documentCount: documentCounts.get(d.id) ?? 0,
      submittedAt: d.submitted_at,
      status: d.status,
    }))
    res.json({ data: result })
  } catch (err: any) {
    console.error("[superadmin/organizations/onboarding-queue]", err.message)
    res.status(500).json({ error: "Failed to load organisation onboarding queue" })
  }
})

// POST /api/superadmin/organizations/onboarding-detail — full record (profile
// fields, every location, every document) for the review modal.
router.post("/organizations/onboarding-detail", requireAuth, requireSuperAdmin, async (req: Request, res: Response) => {
  try {
    const { draft_id } = req.body
    if (!draft_id) return res.status(400).json({ error: "draft_id is required" })

    const { data: draft, error } = await db()
      .from("org_onboarding_drafts")
      .select("*, organization:org_id(name, slug)")
      .eq("id", draft_id)
      .single()
    if (error) throw error

    const [{ data: locations, error: locError }, { data: documents, error: docError }] = await Promise.all([
      db().from("org_onboarding_locations").select("*").eq("draft_id", draft_id).order("created_at", { ascending: true }),
      db().from("organization_onboarding_documents").select("*").eq("draft_id", draft_id).order("uploaded_at", { ascending: true }),
    ])
    if (locError) throw locError
    if (docError) throw docError

    res.json({ data: { ...draft, locations: locations ?? [], documents: documents ?? [] } })
  } catch (err: any) {
    console.error("[superadmin/organizations/onboarding-detail]", err.message)
    res.status(500).json({ error: "Failed to load onboarding submission" })
  }
})

// POST /api/superadmin/organizations/onboarding-review — approve or reject a
// submitted draft. Rejecting reopens the SAME draft for editing (status
// reverts to 'draft', per 036's header comment) rather than creating a new
// submission -- the same admin fixes the flagged issues and resubmits.
// Approving a solo-user submission (is_solo_user) also flips the
// organization's role_mode to 'solo', since that checkbox is otherwise inert
// -- nothing else in this migration set reads it.
router.post("/organizations/onboarding-review", requireAuth, requireSuperAdmin, async (req: Request, res: Response) => {
  try {
    const { draft_id, decision, reason } = req.body as { draft_id?: string; decision?: "approved" | "rejected"; reason?: string }
    if (!draft_id || !["approved", "rejected"].includes(decision ?? "")) {
      return res.status(400).json({ error: "draft_id and a valid decision (approved, rejected) are required" })
    }
    if (decision === "rejected" && !reason?.trim()) {
      return res.status(400).json({ error: "A reason is required to reject an onboarding submission" })
    }

    const { data: existing, error: existingError } = await db()
      .from("org_onboarding_drafts")
      .select("id, org_id, status, is_solo_user, is_group_company, group_code, organization:org_id(name, org_code)")
      .eq("id", draft_id)
      .single()
    if (existingError) throw existingError
    if (existing.status !== "submitted") {
      return res.status(400).json({ error: "Only a submitted onboarding record can be reviewed" })
    }

    const actorId = (req as AuthenticatedRequest).user.id
    const updates: Record<string, unknown> = { reviewed_by: actorId, reviewed_at: new Date().toISOString() }
    if (decision === "approved") {
      updates.status = "approved"
      updates.rejection_reason = null
    } else {
      updates.status = "draft"
      updates.rejection_reason = reason!.trim()
    }

    const { data, error } = await db()
      .from("org_onboarding_drafts")
      .update(updates)
      .eq("id", draft_id)
      .select("*, organization:org_id(name)")
      .single()
    if (error) throw error

    if (decision === "approved" && existing.is_solo_user) {
      const { error: roleModeError } = await db().from("organizations").update({ role_mode: "solo" }).eq("id", existing.org_id)
      if (roleModeError) throw roleModeError
    }

    // Organisation Code: generated once, right here -- the one point in a
    // self-registered org's lifecycle where it's gone from "unvetted
    // signup" to a real, approved organisation. Guarded on org_code already
    // being null so re-running this route (it shouldn't be reachable twice
    // given the status guard above, but cheap to be safe) never reassigns it.
    if (decision === "approved" && !existing.organization?.org_code) {
      const orgCode = await generateUniqueOrgCode(existing.organization?.name ?? "ORG")
      const { error: orgCodeError } = await db().from("organizations").update({ org_code: orgCode }).eq("id", existing.org_id)
      if (orgCodeError) throw orgCodeError
    }

    // Group mapping: if this org declared itself part of a group and gave a
    // code that resolves to a real group, link it in now via the same
    // sanctioned dated-row RPC the in-context "add org to group" action uses
    // (rebind_group_organization, 014/015) -- this also fires
    // grant_group_vendor_reach for any vendor already onboarded via that
    // group (035_live_group_vendor_reach.sql), same as any other org join.
    if (decision === "approved" && existing.is_group_company && existing.group_code?.trim()) {
      const { data: group } = await db()
        .from("organization_groups")
        .select("id")
        .eq("code", existing.group_code.trim())
        .eq("status", "active")
        .maybeSingle()
      if (group) {
        const { error: rebindError } = await db().rpc("rebind_group_organization", {
          p_group_id: group.id,
          p_organization_id: existing.org_id,
          p_relationship_type: "member",
        })
        if (rebindError) throw rebindError
      }
    }

    await writeAudit({
      entityType: "org_onboarding_draft",
      entityId: draft_id,
      action: decision === "approved" ? "org_onboarding_approved" : "org_onboarding_rejected",
      newValue: reason ? { reason } : undefined,
      performedBy: actorId,
      orgId: existing.org_id,
    })

    res.json({ data })
  } catch (err: any) {
    console.error("[superadmin/organizations/onboarding-review]", err.message)
    res.status(500).json({ error: err.message || "Failed to review onboarding submission" })
  }
})

// ─── Users module ───────────────────────────────────────────────────────────
// Platform-wide user administration: every registered profile (internal and
// vendor), suspend/reactivate via Supabase's ban mechanism, force re-auth,
// and grant/revoke the platform_admin flag.

async function listAllAuthUsers(): Promise<any[]> {
  let all: any[] = []
  let page = 1
  for (;;) {
    const { data, error } = await db().auth.admin.listUsers({ page, perPage: 1000 })
    if (error) throw error
    all = all.concat(data.users)
    if (data.users.length < 1000) break
    page++
  }
  return all
}

function isCurrentlyBanned(authUser: any): boolean {
  return !!authUser?.banned_until && new Date(authUser.banned_until) > new Date()
}

// POST /api/superadmin/users/list
router.post("/users/list", requireAuth, requireSuperAdmin, async (_req: Request, res: Response) => {
  try {
    const { data: profiles, error } = await db()
      .from("profiles")
      .select("id, email, full_name, role, account_type, created_at")
      .order("created_at", { ascending: false })
    if (error) throw error

    const { data: platformAdmins } = await db().from("platform_admins").select("profile_id")
    const adminIds = new Set((platformAdmins ?? []).map((p: any) => p.profile_id))

    const authUsers = await listAllAuthUsers()
    const authById = new Map(authUsers.map((u: any) => [u.id, u]))

    const data = (profiles ?? []).map((p: any) => ({
      id: p.id,
      email: p.email,
      fullName: p.full_name,
      role: p.role,
      accountType: p.account_type,
      createdAt: p.created_at,
      isPlatformAdmin: adminIds.has(p.id),
      isSuspended: isCurrentlyBanned(authById.get(p.id)),
    }))
    res.json({ data })
  } catch (err: any) {
    console.error("[superadmin/users/list]", err.message)
    res.status(500).json({ error: "Failed to list users" })
  }
})

// super_admin is deliberately excluded -- platform-admin status is managed
// through platform_admins (grant/revoke-platform-admin below), not this
// legacy role field.
const EDITABLE_USER_ROLES = ["vendor", "hr_user", "manager", "procurement_admin", "finance_ap", "admin"]

// POST /api/superadmin/users/update — edit a user's basic profile fields
// (full name, legacy role). Deliberately does NOT touch account_type or
// org_member_roles -- those drive which portal/RLS policies apply and
// per-org bundle assignment respectively, neither of which a platform-wide
// single-value edit here should risk corrupting.
router.post("/users/update", requireAuth, requireSuperAdmin, async (req: Request, res: Response) => {
  try {
    const { userId, fullName, role } = req.body as { userId?: string; fullName?: string; role?: string }
    if (!userId) return res.status(400).json({ error: "userId is required" })
    if (role && !EDITABLE_USER_ROLES.includes(role)) {
      return res.status(400).json({ error: `role must be one of: ${EDITABLE_USER_ROLES.join(", ")}` })
    }

    const updates: Record<string, unknown> = {}
    if (fullName !== undefined) updates.full_name = fullName.trim()
    if (role !== undefined) updates.role = role

    const { data, error } = await db().from("profiles").update(updates).eq("id", userId).select().single()
    if (error) throw error

    const actorId = (req as AuthenticatedRequest).user.id
    await writeAudit({ entityType: "profile", entityId: userId, action: "user_updated", newValue: updates, performedBy: actorId, orgId: null })

    res.json({ data })
  } catch (err: any) {
    console.error("[superadmin/users/update]", err.message)
    res.status(500).json({ error: err.message || "Failed to update user" })
  }
})

// POST /api/superadmin/users/suspend — bans for ~10 years, the pragmatic
// stand-in for "indefinitely" in Supabase Auth's ban_duration model.
router.post("/users/suspend", requireAuth, requireSuperAdmin, async (req: Request, res: Response) => {
  try {
    const { userId } = req.body
    if (!userId) return res.status(400).json({ error: "userId is required" })

    const { error } = await db().auth.admin.updateUserById(userId, { ban_duration: "87600h" })
    if (error) throw error

    const actorId = (req as AuthenticatedRequest).user.id
    await writeAudit({ entityType: "profile", entityId: userId, action: "user_suspended", performedBy: actorId, orgId: null })

    res.json({ data: { suspended: true } })
  } catch (err: any) {
    console.error("[superadmin/users/suspend]", err.message)
    res.status(500).json({ error: err.message || "Failed to suspend user" })
  }
})

// POST /api/superadmin/users/reactivate
router.post("/users/reactivate", requireAuth, requireSuperAdmin, async (req: Request, res: Response) => {
  try {
    const { userId } = req.body
    if (!userId) return res.status(400).json({ error: "userId is required" })

    const { error } = await db().auth.admin.updateUserById(userId, { ban_duration: "none" })
    if (error) throw error

    const actorId = (req as AuthenticatedRequest).user.id
    await writeAudit({ entityType: "profile", entityId: userId, action: "user_reactivated", performedBy: actorId, orgId: null })

    res.json({ data: { suspended: false } })
  } catch (err: any) {
    console.error("[superadmin/users/reactivate]", err.message)
    res.status(500).json({ error: err.message || "Failed to reactivate user" })
  }
})

// POST /api/superadmin/users/force-reauth — a brief ban/unban cycle.
// Supabase Auth invalidates a user's existing refresh tokens the moment
// ban_duration is set (even briefly), so their current session stops
// refreshing and they must sign in again with their password -- but they
// are NOT left banned afterward (unlike /suspend, which is a standing
// state until explicitly reactivated).
router.post("/users/force-reauth", requireAuth, requireSuperAdmin, async (req: Request, res: Response) => {
  try {
    const { userId } = req.body
    if (!userId) return res.status(400).json({ error: "userId is required" })

    const { error: banError } = await db().auth.admin.updateUserById(userId, { ban_duration: "1s" })
    if (banError) throw banError
    await new Promise((resolve) => setTimeout(resolve, 1200))
    const { error: unbanError } = await db().auth.admin.updateUserById(userId, { ban_duration: "none" })
    if (unbanError) throw unbanError

    const actorId = (req as AuthenticatedRequest).user.id
    await writeAudit({ entityType: "profile", entityId: userId, action: "user_forced_reauth", performedBy: actorId, orgId: null })

    res.json({ data: { reauthForced: true } })
  } catch (err: any) {
    console.error("[superadmin/users/force-reauth]", err.message)
    res.status(500).json({ error: err.message || "Failed to force re-authentication" })
  }
})

// POST /api/superadmin/users/grant-platform-admin
router.post("/users/grant-platform-admin", requireAuth, requireSuperAdmin, async (req: Request, res: Response) => {
  try {
    const { userId } = req.body
    if (!userId) return res.status(400).json({ error: "userId is required" })
    const actorId = (req as AuthenticatedRequest).user.id

    const { error } = await db().from("platform_admins").insert({ profile_id: userId, granted_by: actorId })
    if (error) throw error

    await writeAudit({ entityType: "profile", entityId: userId, action: "platform_admin_granted", performedBy: actorId, orgId: null })
    res.json({ data: { granted: true } })
  } catch (err: any) {
    console.error("[superadmin/users/grant-platform-admin]", err.message)
    res.status(500).json({ error: err.message || "Failed to grant platform admin" })
  }
})

// POST /api/superadmin/users/revoke-platform-admin
router.post("/users/revoke-platform-admin", requireAuth, requireSuperAdmin, async (req: Request, res: Response) => {
  try {
    const { userId } = req.body
    if (!userId) return res.status(400).json({ error: "userId is required" })
    const actorId = (req as AuthenticatedRequest).user.id

    const { error } = await db().from("platform_admins").delete().eq("profile_id", userId)
    if (error) throw error

    await writeAudit({ entityType: "profile", entityId: userId, action: "platform_admin_revoked", performedBy: actorId, orgId: null })
    res.json({ data: { revoked: true } })
  } catch (err: any) {
    console.error("[superadmin/users/revoke-platform-admin]", err.message)
    res.status(500).json({ error: err.message || "Failed to revoke platform admin" })
  }
})

// ─── Feature Entitlements (RBAC/Teams Redesign, Phase 2 UI) ───────────────
// Platform-level, Super-Admin-only screen: which product modules a given
// org or vendor tenant has at all. Absence of a feature_entitlements row
// means entitled (061_feature_entitlements.sql) -- "set enabled=true" is
// therefore just "remove any existing disabling row," not an insert.

// POST /api/superadmin/vendors/list-all — every vendor (id + name only),
// for the tenant picker. Distinct from vendors/verification-queue, which is
// scoped to pending-verification vendors specifically.
router.post("/vendors/list-all", requireAuth, requireSuperAdmin, async (_req: Request, res: Response) => {
  try {
    const { data, error } = await db().from("vendors").select("id, company_name").order("company_name")
    if (error) throw error
    res.json({ data })
  } catch (err: any) {
    console.error("[superadmin/vendors/list-all]", err.message)
    res.status(500).json({ error: "Failed to list vendors" })
  }
})

// POST /api/superadmin/feature-entitlements/tenant-state — {scope, orgId?, vendorId?}
// Merges the feature_modules catalog with any existing override rows for
// this tenant so the UI always shows every module, defaulted to enabled.
router.post("/feature-entitlements/tenant-state", requireAuth, requireSuperAdmin, async (req: Request, res: Response) => {
  try {
    const { scope, orgId, vendorId } = req.body as { scope?: "org" | "vendor"; orgId?: string; vendorId?: string }
    if (scope !== "org" && scope !== "vendor") return res.status(400).json({ error: "scope must be 'org' or 'vendor'" })
    if (scope === "org" && !orgId) return res.status(400).json({ error: "orgId is required for scope=org" })
    if (scope === "vendor" && !vendorId) return res.status(400).json({ error: "vendorId is required for scope=vendor" })

    const { data: modules, error: modError } = await db()
      .from("feature_modules").select("code, label, description").eq("active", true).order("label")
    if (modError) throw modError

    const tenantCol = scope === "org" ? "org_id" : "vendor_id"
    const tenantId = scope === "org" ? orgId : vendorId
    const { data: overrides, error: overrideError } = await db()
      .from("feature_entitlements")
      .select("id, module_code, enabled, set_by, set_at, notes")
      .eq("scope", scope)
      .eq(tenantCol, tenantId)
    if (overrideError) throw overrideError

    const overrideByModule = new Map<string, any>((overrides ?? []).map((o: any) => [o.module_code, o]))
    const data = (modules ?? []).map((m: any) => {
      const override: any = overrideByModule.get(m.code)
      return {
        moduleCode: m.code,
        label: m.label,
        description: m.description,
        enabled: override ? override.enabled : true,
        entitlementId: override?.id ?? null,
        setBy: override?.set_by ?? null,
        setAt: override?.set_at ?? null,
        notes: override?.notes ?? null,
      }
    })
    res.json({ data })
  } catch (err: any) {
    console.error("[superadmin/feature-entitlements/tenant-state]", err.message)
    res.status(500).json({ error: "Failed to load feature entitlements" })
  }
})

// POST /api/superadmin/feature-entitlements/set — {scope, orgId?, vendorId?, moduleCode, enabled, reason?}
router.post("/feature-entitlements/set", requireAuth, requireSuperAdmin, async (req: Request, res: Response) => {
  try {
    const { scope, orgId, vendorId, moduleCode, enabled, reason } = req.body as {
      scope?: "org" | "vendor"; orgId?: string; vendorId?: string; moduleCode?: string; enabled?: boolean; reason?: string
    }
    const actorId = (req as AuthenticatedRequest).user.id
    if (scope !== "org" && scope !== "vendor") return res.status(400).json({ error: "scope must be 'org' or 'vendor'" })
    if (scope === "org" && !orgId) return res.status(400).json({ error: "orgId is required for scope=org" })
    if (scope === "vendor" && !vendorId) return res.status(400).json({ error: "vendorId is required for scope=vendor" })
    if (!moduleCode) return res.status(400).json({ error: "moduleCode is required" })
    if (typeof enabled !== "boolean") return res.status(400).json({ error: "enabled must be true or false" })

    const tenantCol = scope === "org" ? "org_id" : "vendor_id"
    const tenantId = scope === "org" ? orgId : vendorId

    if (enabled) {
      // Back to default (entitled) -- delete the disabling row, if any.
      const { error } = await db().from("feature_entitlements").delete().eq("scope", scope).eq(tenantCol, tenantId).eq("module_code", moduleCode)
      if (error) throw error
    } else {
      const { data: existing } = await db()
        .from("feature_entitlements").select("id").eq("scope", scope).eq(tenantCol, tenantId).eq("module_code", moduleCode).maybeSingle()
      if (existing) {
        const { error } = await db().from("feature_entitlements")
          .update({ enabled: false, set_by: actorId, set_at: new Date().toISOString(), notes: reason || null })
          .eq("id", existing.id)
        if (error) throw error
      } else {
        const { error } = await db().from("feature_entitlements").insert({
          scope, [tenantCol]: tenantId, module_code: moduleCode, enabled: false, set_by: actorId, notes: reason || null,
        })
        if (error) throw error
      }
    }

    await writeAudit({
      entityType: "feature_entitlement",
      entityId: tenantId!,
      action: enabled ? "feature_entitlement_enabled" : "feature_entitlement_disabled",
      newValue: { scope, moduleCode, enabled, reason: reason || null },
      performedBy: actorId,
      orgId: scope === "org" ? orgId! : null,
    })

    res.json({ data: { scope, moduleCode, enabled } })
  } catch (err: any) {
    console.error("[superadmin/feature-entitlements/set]", err.message)
    res.status(500).json({ error: err.message || "Failed to update feature entitlement" })
  }
})

// ─── Onboarding Authority: Super-Admin-assisted vendor onboarding ─────────
// CONFIRMED design: Super Admin completes onboarding on behalf of a small
// business with no staff available, and Submit+Approve MAY collapse into
// one action -- but ONLY when risk_classification = 'low' (domestic
// individual/sole-proprietor). This does NOT bypass mandatory compliance:
// the required T&C-equivalent document must still be present, and a
// non-low-risk vendor still lands in pending_review requiring a genuinely
// separate reviewer, even though Super Admin did the data entry. This is
// the one capability that was entirely missing before this route existed --
// there was no way for Super Admin to onboard a vendor at all.
//
// Every action here is logged as explicitly "assisted" (Super Admin acting
// on behalf of the vendor, never impersonation -- the actor's own identity
// is what's recorded performing the action, not a switched session).
const ONBOARDING_REQUIRED_DOCUMENT_TYPE = "tc_agreement"
const ONBOARDING_DOC_MIME_TYPES: Record<string, string> = {
  pdf: "application/pdf", jpg: "image/jpeg", jpeg: "image/jpeg",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
}

router.post("/vendors/onboard-and-activate", requireAuth, requireSuperAdmin, async (req: Request, res: Response) => {
  const actorId = (req as AuthenticatedRequest).user.id
  try {
    const {
      company_name, legal_name, contact_name, contact_email, contact_phone,
      tax_gst_number, pan_number, registration_number,
      bank_name, bank_account_number, bank_routing_number,
      category_ids, is_solo_user, org_code, group_code,
      documents,
    } = req.body as {
      company_name?: string; legal_name?: string; contact_name?: string; contact_email?: string; contact_phone?: string
      tax_gst_number?: string; pan_number?: string; registration_number?: string
      bank_name?: string; bank_account_number?: string; bank_routing_number?: string
      category_ids?: string[]; is_solo_user?: boolean; org_code?: string; group_code?: string
      documents?: { document_type: string; file_name: string; file_data: string }[]
    }

    if (!company_name?.trim() || !contact_name?.trim() || !contact_email?.trim()) {
      return res.status(400).json({ error: "company_name, contact_name, and contact_email are required" })
    }

    const resolved = await resolveOnboardingTargets({ org_code, group_code })
    if ("error" in resolved) return res.status(400).json({ error: resolved.error })
    const { targetOrgIds, onboardedViaGroupId } = resolved

    // profile_id: null -- same as admin-onboard, this vendor has no login
    // yet. Never linked to the Super Admin's own profile (that would
    // incorrectly make Super Admin "the vendor's own user").
    const { data: vendorId, error: vendorErr } = await db().rpc("create_vendor_with_categories", {
      p_profile_id: null,
      p_company_name: company_name.trim(),
      p_contact_name: contact_name.trim(),
      p_contact_email: contact_email.trim(),
      p_contact_phone: contact_phone || null,
      p_tax_gst_number: tax_gst_number || null,
      p_bank_name: bank_name || null,
      p_bank_account_number: bank_account_number || null,
      p_bank_routing_number: bank_routing_number || null,
      p_category_ids: Array.isArray(category_ids) && category_ids.length > 0 ? category_ids : null,
    })
    if (vendorErr) throw vendorErr

    const { error: fillInError } = await db().from("vendors").update({
      legal_name: legal_name || null,
      pan_number: pan_number || null,
      registration_number: registration_number || null,
      is_solo_user: !!is_solo_user,
      onboarded_via_group_id: onboardedViaGroupId,
    }).eq("id", vendorId)
    if (fillInError) throw fillInError

    await ensureDefaultLegalEntity({
      vendorId, isSoloUser: !!is_solo_user, legalName: legal_name, registrationNumber: registration_number,
      panNumber: pan_number, gstNumber: tax_gst_number,
      bankName: bank_name, bankAccountNumber: bank_account_number, bankRoutingNumber: bank_routing_number,
    })

    // Documents -- inserted directly here (not via /api/vendors/upload-
    // document) because that route resolves the vendor from the caller's
    // OWN vendor_users membership in some contexts and was never designed
    // for a platform-level actor uploading on behalf of a vendor that has
    // no login at all yet.
    let hasRequiredDocument = false
    for (const doc of documents ?? []) {
      if (!doc.file_data || !doc.file_name || !doc.document_type) continue
      const buffer = Buffer.from(doc.file_data, "base64")
      if (buffer.length > 15 * 1024 * 1024) continue // 15MB limit, same as upload-document
      const ext = (doc.file_name.split(".").pop() ?? "").toLowerCase()
      const mimeType = ONBOARDING_DOC_MIME_TYPES[ext]
      if (!mimeType) continue
      const storagePath = `vendor-documents/${vendorId}/${doc.document_type}_${Date.now()}.${ext}`
      const { error: uploadError } = await db().storage.from("vendor-documents").upload(storagePath, buffer, { contentType: mimeType })
      if (uploadError) continue
      const { error: docInsertError } = await db().from("vendor_documents").insert({
        vendor_id: vendorId, document_type: doc.document_type, file_name: doc.file_name, storage_path: storagePath,
      })
      if (docInsertError) continue
      if (doc.document_type === ONBOARDING_REQUIRED_DOCUMENT_TYPE) hasRequiredDocument = true
    }

    const { data: riskClassification } = await db().rpc("compute_vendor_risk_classification", { p_vendor_id: vendorId })

    // The collapse: only when risk is low AND the mandatory document is
    // present. Missing the required document blocks activation regardless
    // of risk -- this is never bypassed by Super Admin's involvement.
    const collapsed = riskClassification === "low" && hasRequiredDocument

    // Always insert as pending_review first, same as every other vendor-
    // creation path (/create, /admin-onboard) -- never insert directly as
    // 'active'. The vendor_id_code assignment trigger only fires on UPDATE,
    // not INSERT (undocumented anywhere except a comment in
    // 007_multi_org_backfill.sql); inserting straight to 'active' would
    // silently skip vendor-code assignment, since no existing code path had
    // ever done that before this route. The collapse case immediately
    // follows with a real UPDATE to 'active', which correctly fires it.
    const { error: linkError } = await db().from("organization_vendors").insert(
      targetOrgIds.map((orgId: string) => ({ org_id: orgId, vendor_id: vendorId, status: "pending_review" }))
    )
    if (linkError) throw linkError

    if (collapsed) {
      const { error: activateError } = await db()
        .from("organization_vendors").update({ status: "active" }).eq("vendor_id", vendorId).in("org_id", targetOrgIds)
      if (activateError) throw activateError
    }
    const initialStatus = collapsed ? "active" : "pending_review"

    for (const orgId of targetOrgIds) {
      const recipientIds = await findOrgRoleHolderIds(orgId, ["Admin"])
      await notifyUsers(recipientIds, {
        type: "new_vendor",
        title: collapsed ? "New Vendor Activated (Super Admin Assisted)" : "New Vendor Added",
        message: collapsed
          ? `${company_name} was onboarded and activated by a platform administrator on this vendor's behalf.`
          : `A new vendor application has been submitted: ${company_name}`,
        moduleReferenceId: vendorId,
      })
    }

    await writeAudit({
      entityType: "vendor",
      entityId: vendorId,
      action: collapsed ? "vendor_super_admin_assisted_activation" : "vendor_super_admin_assisted_onboarding",
      newValue: {
        company_name, org_ids: targetOrgIds, risk_classification: riskClassification,
        has_required_document: hasRequiredDocument, collapsed,
        note: collapsed
          ? "assisted, Submit+Approve collapsed, risk=low"
          : `assisted, not collapsed (risk=${riskClassification}${hasRequiredDocument ? "" : ", missing required document"})`,
      },
      performedBy: actorId,
      orgId: null,
    })

    res.status(201).json({
      data: { vendorId, orgIds: targetOrgIds, status: initialStatus, riskClassification, collapsed, hasRequiredDocument },
    })
  } catch (err: any) {
    console.error("[superadmin/vendors/onboard-and-activate]", err.message)
    res.status(500).json({ error: err.message || "Failed to onboard vendor" })
  }
})

export default router
