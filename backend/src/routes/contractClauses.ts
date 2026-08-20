import { Router, Request, Response } from "express"
import { getSupabaseAdmin } from "../utils/supabaseAdmin"
import { requireAuth, AuthenticatedRequest } from "../middleware/auth"
import { resolveListScope } from "../middleware/org"
import { findOrgRoleHolderIds, findVendorRoleHolderIds, notifyUsers } from "../services/approvalGate"

const router = Router()
function db(): any { return getSupabaseAdmin() }

const HIGH_PRIORITY_CATEGORIES = new Set(["liability", "indemnity", "termination", "ip"])

async function orgMemberRoleNames(userId: string, orgId: string): Promise<string[]> {
  const { data: member } = await db()
    .from("organization_members")
    .select("id")
    .eq("org_id", orgId)
    .eq("profile_id", userId)
    .maybeSingle()
  if (!member) return []

  const { data: rows } = await db()
    .from("org_member_roles")
    .select("role:role_id(name)")
    .eq("org_member_id", member.id)
  return (rows ?? []).map((r: any) => r.role.name)
}

// Fetches the contract and confirms the caller (org member or the matching
// vendor) may act on it. Returns { contract, side } on success, or null and
// writes the error response itself.
async function loadContractForCaller(
  req: Request, res: Response, contractId: string
): Promise<{ contract: any; side: "internal" | "vendor" } | null> {
  if (!contractId) {
    res.status(400).json({ error: "contractId is required" })
    return null
  }

  const scope = await resolveListScope(req)
  if ("error" in scope) {
    res.status(scope.error.status).json({ error: scope.error.message })
    return null
  }

  const { data: contract, error } = await db()
    .from("contracts")
    .select("id, org_id, vendor_id, title")
    .eq("id", contractId)
    .single()
  if (error) {
    res.status(500).json({ error: "Failed to load contract" })
    return null
  }

  if (scope.mode === "org") {
    if (contract.org_id !== scope.orgId) {
      res.status(404).json({ error: "Contract not found" })
      return null
    }
    return { contract, side: "internal" }
  }

  if (contract.vendor_id !== scope.vendorId) {
    res.status(404).json({ error: "Contract not found" })
    return null
  }
  return { contract, side: "vendor" }
}

// POST /api/contract-clauses/list — { contractId }
router.post("/list", requireAuth, async (req: Request, res: Response) => {
  try {
    const loaded = await loadContractForCaller(req, res, req.body.contractId)
    if (!loaded) return

    // !inner so the is_current filter below actually applies (a plain
    // embedded select can't be filtered on in PostgREST) -- every clause
    // always has exactly one current version by construction (enforced by
    // the partial unique index), so this never drops a legitimate clause.
    const { data, error } = await db()
      .from("contract_clauses")
      .select("*, current_version:contract_clause_versions!inner(*)")
      .eq("contract_id", loaded.contract.id)
      .eq("current_version.is_current", true)
      .order("created_at", { ascending: true })
    if (error) throw error

    res.json({ data })
  } catch (err: any) {
    console.error("[contract-clauses/list]", err.message)
    res.status(500).json({ error: "Failed to list contract clauses" })
  }
})

// POST /api/contract-clauses/versions — { clauseId }
router.post("/versions", requireAuth, async (req: Request, res: Response) => {
  try {
    const { clauseId } = req.body
    if (!clauseId) return res.status(400).json({ error: "clauseId is required" })

    const { data: clause, error: clauseError } = await db()
      .from("contract_clauses")
      .select("contract_id")
      .eq("id", clauseId)
      .single()
    if (clauseError) throw clauseError

    const loaded = await loadContractForCaller(req, res, clause.contract_id)
    if (!loaded) return

    const { data, error } = await db()
      .from("contract_clause_versions")
      .select("*, author:authored_by(full_name, email)")
      .eq("clause_id", clauseId)
      .order("version", { ascending: false })
    if (error) throw error

    res.json({ data })
  } catch (err: any) {
    console.error("[contract-clauses/versions]", err.message)
    res.status(500).json({ error: "Failed to list clause versions" })
  }
})

// POST /api/contract-clauses/create — { contractId, title, category, content }
// Internal callers only -- Legal is the intended owner (Stage 3), but this
// app's established convention is org-membership, not a stricter permission
// check (contracts.ts's own /update has none either).
router.post("/create", requireAuth, async (req: Request, res: Response) => {
  try {
    const { contractId, title, category, content } = req.body
    if (!title || !content) return res.status(400).json({ error: "title and content are required" })

    const loaded = await loadContractForCaller(req, res, contractId)
    if (!loaded) return
    if (loaded.side !== "internal") {
      return res.status(403).json({ error: "Only internal staff can define a new clause" })
    }

    const userId = (req as AuthenticatedRequest).user.id

    const { data: clause, error: clauseError } = await db()
      .from("contract_clauses")
      .insert({ contract_id: contractId, title, category: category || "other", created_by: userId })
      .select("id")
      .single()
    if (clauseError) throw clauseError

    const { error: versionError } = await db()
      .from("contract_clause_versions")
      .insert({ clause_id: clause.id, version: 1, is_current: true, content, author_side: "internal", authored_by: userId })
    if (versionError) throw versionError

    const vendorRecipients = await findVendorRoleHolderIds(loaded.contract.vendor_id, ["Admin", "Manager"])
    await notifyUsers(vendorRecipients, {
      type: "contract_clause_redline_submitted",
      title: "New contract clause for review",
      message: `"${title}" has been added to "${loaded.contract.title}" for your review.`,
      moduleReferenceId: contractId,
    })

    res.json({ data: { clauseId: clause.id } })
  } catch (err: any) {
    console.error("[contract-clauses/create]", err.message)
    res.status(500).json({ error: err.message || "Failed to create clause" })
  }
})

// POST /api/contract-clauses/submit-version — { clauseId, content, changeSummary }
router.post("/submit-version", requireAuth, async (req: Request, res: Response) => {
  try {
    const { clauseId, content, changeSummary } = req.body
    if (!clauseId || !content) return res.status(400).json({ error: "clauseId and content are required" })

    const { data: clause, error: clauseError } = await db()
      .from("contract_clauses")
      .select("id, contract_id, title, category, status")
      .eq("id", clauseId)
      .single()
    if (clauseError) throw clauseError

    const loaded = await loadContractForCaller(req, res, clause.contract_id)
    if (!loaded) return

    if (clause.status === "agreed") {
      return res.status(400).json({ error: "This clause is locked — reopen it via Legal before submitting a new version" })
    }

    const userId = (req as AuthenticatedRequest).user.id

    const { data: currentVersion, error: currentError } = await db()
      .from("contract_clause_versions")
      .select("id, version")
      .eq("clause_id", clauseId)
      .eq("is_current", true)
      .maybeSingle()
    if (currentError) throw currentError

    if (currentVersion) {
      const { error: supersedeError } = await db()
        .from("contract_clause_versions")
        .update({ is_current: false })
        .eq("id", currentVersion.id)
      if (supersedeError) throw supersedeError
    }

    const { error: insertError } = await db()
      .from("contract_clause_versions")
      .insert({
        clause_id: clauseId,
        version: (currentVersion?.version ?? 0) + 1,
        is_current: true,
        content,
        change_summary: changeSummary ?? null,
        author_side: loaded.side,
        authored_by: userId,
      })
    if (insertError) throw insertError

    // A fresh proposal invalidates whatever agreement existed before.
    const { error: resetError } = await db()
      .from("contract_clauses")
      .update({ vendor_agreed: false, internal_agreed: false, status: "under_negotiation" })
      .eq("id", clauseId)
    if (resetError) throw resetError

    const isHighPriority = HIGH_PRIORITY_CATEGORIES.has(clause.category)
    const messagePrefix = isHighPriority ? "⚠ High priority: " : ""
    const message = `${messagePrefix}${loaded.side === "vendor" ? "The vendor" : "Your organization"} proposed a redline on "${clause.title}" (${loaded.contract.title}).`

    if (loaded.side === "vendor") {
      const legalIds = await findOrgRoleHolderIds(loaded.contract.org_id, ["Legal"])
      await notifyUsers(legalIds, {
        type: "contract_clause_redline_submitted",
        title: isHighPriority ? "High-priority clause redline" : "Contract clause redline",
        message,
        moduleReferenceId: clause.contract_id,
      })
    } else {
      const vendorIds = await findVendorRoleHolderIds(loaded.contract.vendor_id, ["Admin", "Manager"])
      await notifyUsers(vendorIds, {
        type: "contract_clause_redline_submitted",
        title: "Contract clause redline",
        message,
        moduleReferenceId: clause.contract_id,
      })
    }

    res.json({ data: { ok: true } })
  } catch (err: any) {
    console.error("[contract-clauses/submit-version]", err.message)
    res.status(500).json({ error: err.message || "Failed to submit clause redline" })
  }
})

// POST /api/contract-clauses/agree — { clauseId }
router.post("/agree", requireAuth, async (req: Request, res: Response) => {
  try {
    const { clauseId } = req.body
    if (!clauseId) return res.status(400).json({ error: "clauseId is required" })

    const { data: clause, error: clauseError } = await db()
      .from("contract_clauses")
      .select("id, contract_id, title, status, vendor_agreed, internal_agreed")
      .eq("id", clauseId)
      .single()
    if (clauseError) throw clauseError

    const loaded = await loadContractForCaller(req, res, clause.contract_id)
    if (!loaded) return

    if (clause.status === "agreed") {
      return res.status(400).json({ error: "This clause is already agreed" })
    }

    const update: Record<string, unknown> = loaded.side === "vendor"
      ? { vendor_agreed: true }
      : { internal_agreed: true }

    const nowBothAgreed = loaded.side === "vendor"
      ? clause.internal_agreed
      : clause.vendor_agreed
    if (nowBothAgreed) update.status = "agreed"

    const { error: updateError } = await db().from("contract_clauses").update(update).eq("id", clauseId)
    if (updateError) throw updateError

    if (nowBothAgreed) {
      const orgIds = await findOrgRoleHolderIds(loaded.contract.org_id, ["Legal", "Manager", "Admin"])
      const vendorIds = await findVendorRoleHolderIds(loaded.contract.vendor_id, ["Admin", "Manager"])
      await notifyUsers([...orgIds, ...vendorIds], {
        type: "contract_clause_agreed",
        title: "Contract clause agreed",
        message: `Both parties have agreed on "${clause.title}" (${loaded.contract.title}).`,
        moduleReferenceId: clause.contract_id,
      })
    }

    res.json({ data: { ok: true, status: nowBothAgreed ? "agreed" : "under_negotiation" } })
  } catch (err: any) {
    console.error("[contract-clauses/agree]", err.message)
    res.status(500).json({ error: err.message || "Failed to record agreement" })
  }
})

// POST /api/contract-clauses/reopen — { clauseId }. Legal-role org members only.
router.post("/reopen", requireAuth, async (req: Request, res: Response) => {
  try {
    const { clauseId } = req.body
    if (!clauseId) return res.status(400).json({ error: "clauseId is required" })

    const { data: clause, error: clauseError } = await db()
      .from("contract_clauses")
      .select("id, contract_id, title")
      .eq("id", clauseId)
      .single()
    if (clauseError) throw clauseError

    const loaded = await loadContractForCaller(req, res, clause.contract_id)
    if (!loaded) return
    if (loaded.side !== "internal") {
      return res.status(403).json({ error: "Only Legal can reopen a clause" })
    }

    const userId = (req as AuthenticatedRequest).user.id
    const roleNames = await orgMemberRoleNames(userId, loaded.contract.org_id)
    if (!roleNames.includes("Legal")) {
      return res.status(403).json({ error: "Only Legal can reopen a clause" })
    }

    const { error: updateError } = await db()
      .from("contract_clauses")
      .update({ status: "under_negotiation", vendor_agreed: false, internal_agreed: false })
      .eq("id", clauseId)
    if (updateError) throw updateError

    const vendorIds = await findVendorRoleHolderIds(loaded.contract.vendor_id, ["Admin", "Manager"])
    await notifyUsers(vendorIds, {
      type: "contract_clause_agreed",
      title: "Contract clause reopened",
      message: `Legal reopened "${clause.title}" (${loaded.contract.title}) for further negotiation.`,
      moduleReferenceId: clause.contract_id,
    })

    res.json({ data: { ok: true } })
  } catch (err: any) {
    console.error("[contract-clauses/reopen]", err.message)
    res.status(500).json({ error: err.message || "Failed to reopen clause" })
  }
})

export default router
