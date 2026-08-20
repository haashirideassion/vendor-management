import { Router, Request, Response } from "express"
import { getSupabaseAdmin } from "../utils/supabaseAdmin"
import { requireAuth, AuthenticatedRequest } from "../middleware/auth"
import { requireOrg, OrgScopedRequest } from "../middleware/org"
import { findOrgRoleHolderIds, notifyUsers } from "../services/approvalGate"

const router = Router()
function db(): any { return getSupabaseAdmin() }

type ApproverRole = "legal" | "finance" | "vp_cfo"

// Tier -> required approver roles, escalating -- driven by contract VALUE
// (amount in base currency), a deliberately DIFFERENT axis from Stage 4's
// risk-tier reviewer set (contractReviews.ts), and a deliberately different
// role set (no business_user/compliance slot here -- Stage 7's spec names
// only Legal Head/Finance Controller/VP-CFO).
const ROLES_BY_TIER: Record<"low" | "medium" | "high", ApproverRole[]> = {
  low:    ["legal"],
  medium: ["legal", "finance"],
  high:   ["legal", "finance", "vp_cfo"],
}

// "VP/CFO" maps to this org's existing Admin role, same mapping Phase 1
// already established for the same spec wording.
const ROLE_NAME_BY_APPROVER_ROLE: Record<ApproverRole, string[]> = {
  legal:   ["Legal"],
  finance: ["Finance"],
  vp_cfo:  ["Admin"],
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

async function resolveTier(orgId: string, amount: number | null): Promise<"low" | "medium" | "high"> {
  if (amount === null) return "low"

  const { data: thresholds } = await db()
    .from("contract_approval_thresholds")
    .select("medium_threshold, high_threshold")
    .eq("org_id", orgId)
    .maybeSingle()

  const mediumThreshold = thresholds ? Number(thresholds.medium_threshold) : 500000
  const highThreshold   = thresholds ? Number(thresholds.high_threshold)   : 2000000

  if (amount >= highThreshold) return "high"
  if (amount >= mediumThreshold) return "medium"
  return "low"
}

// POST /api/contract-approvals/list — { contractId }
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
      .from("contract_approvals")
      .select("*, approver:approved_by(full_name, email)")
      .eq("contract_id", contractId)
      .order("round", { ascending: false })
      .order("approver_role")
    if (error) throw error

    res.json({ data })
  } catch (err: any) {
    console.error("[contract-approvals/list]", err.message)
    res.status(500).json({ error: "Failed to list contract approvals" })
  }
})

// POST /api/contract-approvals/request — { contractId }. Opens a new
// approval round sized to the contract's value tier.
router.post("/request", requireAuth, requireOrg, async (req: Request, res: Response) => {
  try {
    const { contractId } = req.body
    if (!contractId) return res.status(400).json({ error: "contractId is required" })
    const { orgId } = req as OrgScopedRequest

    const { data: contract, error: contractError } = await db()
      .from("contracts")
      .select("id, org_id, title, status, total_value, exchange_rate_to_base, created_by")
      .eq("id", contractId)
      .single()
    if (contractError) throw contractError
    if (contract.org_id !== orgId) return res.status(404).json({ error: "Contract not found" })

    if (!["draft", "internal_review"].includes(contract.status)) {
      return res.status(400).json({ error: "Final Approval can only be requested while the contract is in draft or internal review" })
    }

    const { data: existingRounds, error: roundsError } = await db()
      .from("contract_approvals")
      .select("round, status")
      .eq("contract_id", contractId)
      .order("round", { ascending: false })
    if (roundsError) throw roundsError

    const latestRound = existingRounds?.[0]?.round ?? 0
    const latestRoundOpen = existingRounds?.some((r: any) => r.round === latestRound && r.status === "pending")
    if (latestRoundOpen) {
      return res.status(400).json({ error: "A final approval round is already in progress for this contract" })
    }

    const amount = contract.total_value != null && contract.exchange_rate_to_base != null
      ? Number(contract.total_value) * Number(contract.exchange_rate_to_base)
      : (contract.total_value != null ? Number(contract.total_value) : null)
    const tier = await resolveTier(orgId, amount)
    const requiredRoles = ROLES_BY_TIER[tier]
    const nextRound = latestRound + 1

    const { error: insertError } = await db()
      .from("contract_approvals")
      .insert(requiredRoles.map((approver_role) => ({ contract_id: contractId, round: nextRound, approver_role })))
    if (insertError) throw insertError

    const { error: statusError } = await db()
      .from("contracts")
      .update({ status: "pending_final_approval" })
      .eq("id", contractId)
    if (statusError) throw statusError

    for (const role of requiredRoles) {
      const roleNames = ROLE_NAME_BY_APPROVER_ROLE[role]
      const recipientIds = await findOrgRoleHolderIds(orgId, roleNames)
      await notifyUsers(recipientIds, {
        type: "contract_approval_requested",
        title: "Contract pending your final approval",
        message: `"${contract.title}" needs your sign-off before it can be activated.`,
        moduleReferenceId: contractId,
      })
    }

    res.json({ data: { round: nextRound, tier, requiredRoles } })
  } catch (err: any) {
    console.error("[contract-approvals/request]", err.message)
    res.status(500).json({ error: err.message || "Failed to request final approval" })
  }
})

// POST /api/contract-approvals/submit — { contractId, approverRole, status,
// notes }. status is 'approved' | 'rejected'.
router.post("/submit", requireAuth, requireOrg, async (req: Request, res: Response) => {
  try {
    const { contractId, approverRole, status, notes } = req.body
    if (!contractId || !approverRole || !status) {
      return res.status(400).json({ error: "contractId, approverRole, and status are required" })
    }
    if (!["approved", "rejected"].includes(status)) {
      return res.status(400).json({ error: "status must be 'approved' or 'rejected'" })
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

    const requiredRoleNames = ROLE_NAME_BY_APPROVER_ROLE[approverRole as ApproverRole] ?? []
    const callerRoleNames = await orgMemberRoleNames(userId, orgId)
    if (!requiredRoleNames.some((r) => callerRoleNames.includes(r))) {
      return res.status(403).json({ error: `You are not authorized to submit the ${approverRole} approval` })
    }

    const { data: latestRow, error: latestError } = await db()
      .from("contract_approvals")
      .select("id, round, status")
      .eq("contract_id", contractId)
      .eq("approver_role", approverRole)
      .order("round", { ascending: false })
      .limit(1)
      .maybeSingle()
    if (latestError) throw latestError
    if (!latestRow || latestRow.status !== "pending") {
      return res.status(400).json({ error: "No pending approval is open for this role" })
    }

    const { error: updateError } = await db()
      .from("contract_approvals")
      .update({ status, notes: notes ?? null, approved_by: userId, approved_at: new Date().toISOString() })
      .eq("id", latestRow.id)
    if (updateError) throw updateError

    if (status === "rejected") {
      await db().from("contracts").update({ status: "draft" }).eq("id", contractId)
      await notifyUsers([contract.created_by], {
        type: "contract_approval_decision",
        title: "Contract approval rejected",
        message: `A ${approverRole} approver rejected "${contract.title}" — it's back in draft.`,
        moduleReferenceId: contractId,
      })
    } else {
      const { data: roundRows, error: roundRowsError } = await db()
        .from("contract_approvals")
        .select("status")
        .eq("contract_id", contractId)
        .eq("round", latestRow.round)
      if (roundRowsError) throw roundRowsError

      const allApproved = (roundRows ?? []).every((r: any) => r.status === "approved")
      if (allApproved) {
        await notifyUsers([contract.created_by], {
          type: "contract_approval_decision",
          title: "Final approval complete",
          message: `All required approvers have signed off on "${contract.title}" — it's ready to activate.`,
          moduleReferenceId: contractId,
        })
      }
    }

    res.json({ data: { ok: true } })
  } catch (err: any) {
    console.error("[contract-approvals/submit]", err.message)
    res.status(500).json({ error: err.message || "Failed to submit approval decision" })
  }
})

export default router
