import { Router, Request, Response } from "express"
import { getSupabaseAdmin } from "../utils/supabaseAdmin"
import { requireAuth, AuthenticatedRequest } from "../middleware/auth"
import { requireOrg, OrgScopedRequest } from "../middleware/org"

const router = Router()
function db(): any { return getSupabaseAdmin() }

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

// Stage 11's decision-logging roles: Legal + "Procurement" (mapped to this
// app's existing Manager role, same as every other phase's spec-to-role
// mapping) + Admin + the new Contract Manager, plus the contract's own
// creator (Business User) regardless of role.
const DECISION_ROLE_NAMES = ["Manager", "Admin", "Legal", "Contract Manager"]

// POST /api/contract-renewals/list — { contractId }
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

    const [{ data: decisions, error: decisionsError }, { data: reminders, error: remindersError }] = await Promise.all([
      db()
        .from("contract_renewal_decisions")
        .select("*, decided_by_profile:decided_by(full_name, email)")
        .eq("contract_id", contractId)
        .order("cycle_expiry_date", { ascending: false }),
      db()
        .from("contract_renewal_reminders")
        .select("*")
        .eq("contract_id", contractId)
        .order("sent_at", { ascending: false }),
    ])
    if (decisionsError) throw decisionsError
    if (remindersError) throw remindersError

    res.json({ data: { decisions, reminders } })
  } catch (err: any) {
    console.error("[contract-renewals/list]", err.message)
    res.status(500).json({ error: "Failed to list contract renewal data" })
  }
})

// POST /api/contract-renewals/decide — { contractId, decision, amendmentScope?,
// terminationNoticeDate?, newExpiryDate? }. Finds (or opens, if the cron
// hasn't yet) the cycle matching the contract's CURRENT expiry_date and
// records the decision. `renew` with newExpiryDate also pushes the
// contract's expiry_date forward, since logging "we renewed" without
// extending the date would leave it still counting down to the same expiry.
// Terminate/amend are record-keeping only here -- actually terminating the
// contract remains the existing Terminate button, and amendments still go
// through the existing Add Amendment flow.
router.post("/decide", requireAuth, requireOrg, async (req: Request, res: Response) => {
  try {
    const { contractId, decision, amendmentScope, terminationNoticeDate, newExpiryDate } = req.body
    if (!contractId || !decision) {
      return res.status(400).json({ error: "contractId and decision are required" })
    }
    if (!["renew", "amend", "terminate"].includes(decision)) {
      return res.status(400).json({ error: "decision must be 'renew', 'amend', or 'terminate'" })
    }
    const { orgId } = req as OrgScopedRequest
    const userId = (req as AuthenticatedRequest).user.id

    const { data: contract, error: contractError } = await db()
      .from("contracts")
      .select("id, org_id, title, expiry_date, created_by")
      .eq("id", contractId)
      .single()
    if (contractError) throw contractError
    if (contract.org_id !== orgId) return res.status(404).json({ error: "Contract not found" })
    if (!contract.expiry_date) return res.status(400).json({ error: "Contract has no expiry date set" })

    const callerRoleNames = await orgMemberRoleNames(userId, orgId)
    const isAuthorized = contract.created_by === userId || DECISION_ROLE_NAMES.some((r) => callerRoleNames.includes(r))
    if (!isAuthorized) {
      return res.status(403).json({ error: "You are not authorized to log a renewal decision for this contract" })
    }

    const { data: existingCycle } = await db()
      .from("contract_renewal_decisions")
      .select("id")
      .eq("contract_id", contractId)
      .eq("cycle_expiry_date", contract.expiry_date)
      .maybeSingle()

    let cycleId = existingCycle?.id
    if (!cycleId) {
      const { data: inserted, error: insertError } = await db()
        .from("contract_renewal_decisions")
        .insert({ contract_id: contractId, cycle_expiry_date: contract.expiry_date })
        .select("id")
        .single()
      if (insertError) throw insertError
      cycleId = inserted.id
    }

    const { error: updateError } = await db()
      .from("contract_renewal_decisions")
      .update({
        decision,
        amendment_scope: decision === "amend" ? (amendmentScope ?? null) : null,
        termination_notice_date: decision === "terminate" ? (terminationNoticeDate ?? null) : null,
        decided_by: userId,
        decided_at: new Date().toISOString(),
      })
      .eq("id", cycleId)
    if (updateError) throw updateError

    if (decision === "renew" && newExpiryDate) {
      const { error: contractUpdateError } = await db()
        .from("contracts")
        .update({ expiry_date: newExpiryDate })
        .eq("id", contractId)
      if (contractUpdateError) throw contractUpdateError
    }

    res.json({ data: { ok: true } })
  } catch (err: any) {
    console.error("[contract-renewals/decide]", err.message)
    res.status(500).json({ error: err.message || "Failed to log renewal decision" })
  }
})

export default router
