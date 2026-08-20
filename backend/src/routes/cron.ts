import { Router, Request, Response, NextFunction } from "express"
import { getSupabaseAdmin } from "../utils/supabaseAdmin"
import { findOrgRoleHolderIds, notifyUsers } from "../services/approvalGate"

const router = Router()
function db(): any { return getSupabaseAdmin() }

const REMINDER_THRESHOLDS = [90, 60, 30] as const
const ESCALATION_THRESHOLD_DAYS = 7

// Vercel injects Authorization: Bearer <CRON_SECRET> on the scheduled
// request (per the `crons` entry in the root vercel.json) -- this replaces
// requireAuth/requireOrg entirely, since a cron invocation has no logged-in
// user or org context. If CRON_SECRET isn't configured, reject everything
// rather than leaving the endpoint open.
function requireCronSecret(req: Request, res: Response, next: NextFunction) {
  const secret = process.env.CRON_SECRET
  const header = req.header("authorization") ?? ""
  if (!secret || header !== `Bearer ${secret}`) {
    return res.status(401).json({ error: "Unauthorized" })
  }
  next()
}

// Date-only arithmetic in UTC -- expiry_date comes back from Postgres as a
// plain "YYYY-MM-DD" string, and comparing it against a local-time `Date`
// would drift by a day near midnight depending on server TZ.
function daysUntil(dateStr: string): number {
  const today = new Date()
  const todayUTC = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())
  const [y, m, d] = dateStr.split("-").map(Number)
  const targetUTC = Date.UTC(y, m - 1, d)
  return Math.round((targetUTC - todayUTC) / 86_400_000)
}

// POST /api/cron/contract-renewals — daily. For every active contract with
// an expiry_date: sends the 90/60/30-day reminder nudges (Stage 9), opens a
// renewal decision cycle once the contract's own renewal_notice_days window
// is reached (Stage 11), and escalates urgently if that cycle is still
// undecided within a week of expiry. Each step is idempotent via the unique
// constraints on contract_renewal_reminders/contract_renewal_decisions, so
// re-running the same day (or a retried invocation) never double-sends.
router.post("/contract-renewals", requireCronSecret, async (_req: Request, res: Response) => {
  const summary = { contractsChecked: 0, remindersSent: 0, cyclesOpened: 0, escalationsSent: 0 }
  try {
    const { data: contracts, error } = await db()
      .from("contracts")
      .select("id, org_id, title, expiry_date, renewal_notice_days, created_by")
      .eq("status", "active")
      .not("expiry_date", "is", null)
    if (error) throw error

    for (const contract of contracts ?? []) {
      summary.contractsChecked++
      const remaining = daysUntil(contract.expiry_date)

      const contractManagerIds = await findOrgRoleHolderIds(contract.org_id, ["Contract Manager"])

      for (const threshold of REMINDER_THRESHOLDS) {
        if (remaining > threshold) continue
        const { data: existing } = await db()
          .from("contract_renewal_reminders")
          .select("id")
          .eq("contract_id", contract.id)
          .eq("expiry_date", contract.expiry_date)
          .eq("days_before", threshold)
          .maybeSingle()
        if (existing) continue

        const { error: insertError } = await db().from("contract_renewal_reminders").insert({
          contract_id: contract.id, expiry_date: contract.expiry_date, days_before: threshold,
        })
        if (insertError) { console.error("[cron/contract-renewals] reminder insert failed:", insertError.message); continue }

        await notifyUsers([...contractManagerIds, contract.created_by], {
          type: "contract_renewal_reminder",
          title: "Contract renewal approaching",
          message: `"${contract.title}" expires in ${remaining <= 0 ? "less than a day" : `${remaining} day${remaining !== 1 ? "s" : ""}`} (${threshold}-day notice).`,
          moduleReferenceId: contract.id,
        })
        summary.remindersSent++
      }

      if (remaining <= contract.renewal_notice_days) {
        const { data: existingCycle } = await db()
          .from("contract_renewal_decisions")
          .select("id, decision, escalated_at")
          .eq("contract_id", contract.id)
          .eq("cycle_expiry_date", contract.expiry_date)
          .maybeSingle()

        let cycle = existingCycle
        if (!cycle) {
          const { data: inserted, error: insertError } = await db()
            .from("contract_renewal_decisions")
            .insert({ contract_id: contract.id, cycle_expiry_date: contract.expiry_date })
            .select("id, decision, escalated_at")
            .single()
          if (insertError) { console.error("[cron/contract-renewals] cycle insert failed:", insertError.message); continue }
          cycle = inserted
          summary.cyclesOpened++

          const managerIds = await findOrgRoleHolderIds(contract.org_id, ["Manager"])
          const legalIds = await findOrgRoleHolderIds(contract.org_id, ["Legal"])
          await notifyUsers([...new Set([...managerIds, ...legalIds, contract.created_by])], {
            type: "contract_renewal_decision_needed",
            title: "Renewal decision needed",
            message: `"${contract.title}" needs a renew/amend/terminate decision before it expires.`,
            moduleReferenceId: contract.id,
          })
        }

        if (!cycle.decision && !cycle.escalated_at && remaining <= ESCALATION_THRESHOLD_DAYS) {
          const { error: escalateError } = await db()
            .from("contract_renewal_decisions")
            .update({ escalated_at: new Date().toISOString() })
            .eq("id", cycle.id)
          if (!escalateError) {
            await notifyUsers([...new Set([...contractManagerIds, contract.created_by])], {
              type: "contract_renewal_escalation",
              title: "Urgent: contract renewal undecided",
              message: `"${contract.title}" expires in ${remaining <= 0 ? "less than a day" : `${remaining} day${remaining !== 1 ? "s" : ""}`} with no renewal decision logged.`,
              moduleReferenceId: contract.id,
            })
            summary.escalationsSent++
          }
        }
      }
    }

    res.json({ data: summary })
  } catch (err: any) {
    console.error("[cron/contract-renewals]", err.message)
    res.status(500).json({ error: err.message || "Contract renewal cron failed", partial: summary })
  }
})

export default router
