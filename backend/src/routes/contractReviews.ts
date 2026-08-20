import { Router, Request, Response } from "express"
import { getSupabaseAdmin } from "../utils/supabaseAdmin"
import { requireAuth, AuthenticatedRequest } from "../middleware/auth"
import { requireOrg, OrgScopedRequest } from "../middleware/org"
import { findOrgRoleHolderIds, notifyUsers } from "../services/approvalGate"

const router = Router()
function db(): any { return getSupabaseAdmin() }

type ReviewerRole = "business_user" | "legal" | "finance" | "compliance" | "vp_cfo"

// Reviewer roles required per risk tier -- confirmed scope (Contract
// Lifecycle Management, Phase 1). "vp_cfo" maps to this org's existing
// Admin role rather than a distinct role.
const REQUIRED_ROLES_BY_TIER: Record<string, ReviewerRole[]> = {
  low:    ["business_user", "legal"],
  medium: ["business_user", "legal", "finance"],
  high:   ["business_user", "legal", "finance", "compliance", "vp_cfo"],
}

// Maps a reviewer_role slot to the org role name(s) whose members satisfy it
// (any one holder resolving the slot is enough, same as "Manager or Admin"
// resolves the single-approver gate elsewhere in this app). "business_user"
// has no role -- it's always the contract's own creator specifically.
const ROLE_NAME_BY_REVIEWER_ROLE: Partial<Record<ReviewerRole, string[]>> = {
  legal:      ["Legal"],
  finance:    ["Finance"],
  compliance: ["Compliance"],
  vp_cfo:     ["Admin"],
}

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

// POST /api/contract-reviews/list — { contractId }. All reviewer rows across
// all rounds, newest round first, for display (current round's status plus
// prior rounds' audit history).
router.post("/list", requireAuth, requireOrg, async (req: Request, res: Response) => {
  try {
    const { contractId } = req.body
    if (!contractId) return res.status(400).json({ error: "contractId is required" })
    const { orgId } = req as OrgScopedRequest

    const { data: contract, error: contractError } = await db()
      .from("contracts")
      .select("id, org_id")
      .eq("id", contractId)
      .single()
    if (contractError) throw contractError
    if (contract.org_id !== orgId) return res.status(404).json({ error: "Contract not found" })

    const { data, error } = await db()
      .from("contract_reviewers")
      .select("*, reviewer:reviewed_by(full_name, email)")
      .eq("contract_id", contractId)
      .order("round", { ascending: false })
      .order("reviewer_role")
    if (error) throw error

    res.json({ data })
  } catch (err: any) {
    console.error("[contract-reviews/list]", err.message)
    res.status(500).json({ error: "Failed to list contract reviewers" })
  }
})

// POST /api/contract-reviews/request — { contractId }. Opens a new review
// round: computes the required reviewer_role set from the contract's
// risk_tier, inserts one pending row per role, flips the contract to
// 'internal_review', and notifies each role's holders.
router.post("/request", requireAuth, requireOrg, async (req: Request, res: Response) => {
  try {
    const { contractId } = req.body
    if (!contractId) return res.status(400).json({ error: "contractId is required" })
    const { orgId } = req as OrgScopedRequest

    const { data: contract, error: contractError } = await db()
      .from("contracts")
      .select("id, org_id, title, status, risk_tier, created_by")
      .eq("id", contractId)
      .single()
    if (contractError) throw contractError
    if (contract.org_id !== orgId) return res.status(404).json({ error: "Contract not found" })

    if (!contract.risk_tier) {
      return res.status(400).json({ error: "Set a risk tier before requesting Internal Review" })
    }
    if (contract.status !== "draft") {
      return res.status(400).json({ error: "Internal Review can only be requested while the contract is in draft" })
    }

    const { data: existingRounds, error: roundsError } = await db()
      .from("contract_reviewers")
      .select("round, status")
      .eq("contract_id", contractId)
      .order("round", { ascending: false })
    if (roundsError) throw roundsError

    const latestRound = existingRounds?.[0]?.round ?? 0
    const latestRoundOpen = existingRounds?.some((r: any) => r.round === latestRound && r.status === "pending")
    if (latestRoundOpen) {
      return res.status(400).json({ error: "A review round is already in progress for this contract" })
    }

    const requiredRoles = REQUIRED_ROLES_BY_TIER[contract.risk_tier]
    const nextRound = latestRound + 1

    const { error: insertError } = await db()
      .from("contract_reviewers")
      .insert(requiredRoles.map((reviewer_role) => ({ contract_id: contractId, round: nextRound, reviewer_role })))
    if (insertError) throw insertError

    const { error: statusError } = await db()
      .from("contracts")
      .update({ status: "internal_review" })
      .eq("id", contractId)
    if (statusError) throw statusError

    // Notify each required slot's holders.
    for (const role of requiredRoles) {
      let recipientIds: string[] = []
      if (role === "business_user") {
        recipientIds = [contract.created_by]
      } else {
        const roleNames = ROLE_NAME_BY_REVIEWER_ROLE[role] ?? []
        recipientIds = await findOrgRoleHolderIds(orgId, roleNames)
      }
      await notifyUsers(recipientIds, {
        type: "contract_review_requested",
        title: "Contract pending your review",
        message: `"${contract.title}" needs your Internal Review sign-off.`,
        moduleReferenceId: contractId,
      })
    }

    res.json({ data: { round: nextRound, requiredRoles } })
  } catch (err: any) {
    console.error("[contract-reviews/request]", err.message)
    res.status(500).json({ error: err.message || "Failed to request Internal Review" })
  }
})

// POST /api/contract-reviews/submit — { contractId, reviewerRole, status,
// notes }. status is 'approved' | 'changes_requested'.
router.post("/submit", requireAuth, requireOrg, async (req: Request, res: Response) => {
  try {
    const { contractId, reviewerRole, status, notes } = req.body
    if (!contractId || !reviewerRole || !status) {
      return res.status(400).json({ error: "contractId, reviewerRole, and status are required" })
    }
    if (!["approved", "changes_requested"].includes(status)) {
      return res.status(400).json({ error: "status must be 'approved' or 'changes_requested'" })
    }
    const { orgId } = req as OrgScopedRequest
    const userId = (req as AuthenticatedRequest).user.id

    const { data: contract, error: contractError } = await db()
      .from("contracts")
      .select("id, org_id, title, created_by")
      .eq("id", contractId)
      .single()
    if (contractError) throw contractError
    if (contract.org_id !== orgId) return res.status(404).json({ error: "Contract not found" })

    // Authorization: caller must hold the role matching this reviewer slot,
    // or be the contract's own creator for the business_user slot.
    if (reviewerRole === "business_user") {
      if (contract.created_by !== userId) {
        return res.status(403).json({ error: "Only the contract's own creator can resolve the Business User review" })
      }
    } else {
      const requiredRoleNames = ROLE_NAME_BY_REVIEWER_ROLE[reviewerRole as ReviewerRole] ?? []
      const callerRoleNames = await orgMemberRoleNames(userId, orgId)
      if (!requiredRoleNames.some((r) => callerRoleNames.includes(r))) {
        return res.status(403).json({ error: `You are not authorized to submit the ${reviewerRole} review` })
      }
    }

    const { data: latestRow, error: latestError } = await db()
      .from("contract_reviewers")
      .select("id, round, status")
      .eq("contract_id", contractId)
      .eq("reviewer_role", reviewerRole)
      .order("round", { ascending: false })
      .limit(1)
      .maybeSingle()
    if (latestError) throw latestError
    if (!latestRow || latestRow.status !== "pending") {
      return res.status(400).json({ error: "No pending review is open for this role" })
    }

    const { error: updateError } = await db()
      .from("contract_reviewers")
      .update({ status, notes: notes ?? null, reviewed_by: userId, reviewed_at: new Date().toISOString() })
      .eq("id", latestRow.id)
    if (updateError) throw updateError

    if (status === "changes_requested") {
      await db().from("contracts").update({ status: "draft" }).eq("id", contractId)
      await notifyUsers([contract.created_by], {
        type: "contract_review_decision",
        title: "Changes requested on your contract",
        message: `A reviewer requested changes on "${contract.title}" — it's back in draft.`,
        moduleReferenceId: contractId,
      })
    } else {
      const { data: roundRows, error: roundRowsError } = await db()
        .from("contract_reviewers")
        .select("status")
        .eq("contract_id", contractId)
        .eq("round", latestRow.round)
      if (roundRowsError) throw roundRowsError

      const allApproved = (roundRows ?? []).every((r: any) => r.status === "approved")
      if (allApproved) {
        await notifyUsers([contract.created_by], {
          type: "contract_review_decision",
          title: "Internal Review complete",
          message: `All reviewers have approved "${contract.title}" — it's ready to activate.`,
          moduleReferenceId: contractId,
        })
      }
    }

    res.json({ data: { ok: true } })
  } catch (err: any) {
    console.error("[contract-reviews/submit]", err.message)
    res.status(500).json({ error: err.message || "Failed to submit contract review" })
  }
})

export default router
