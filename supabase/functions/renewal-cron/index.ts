import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { sendEmail } from "../send-email/index.ts"

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
const APP_URL = Deno.env.get("APP_URL") ?? "https://vendors.ideasion.com"

serve(async () => {
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)
  const today = new Date().toISOString().split("T")[0]

  // ── 1. Send renewal nudges (30 days before anniversary) ──────────────────────
  const thirtyDaysFromNow = new Date()
  thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30)
  const thirtyDaysStr = thirtyDaysFromNow.toISOString().split("T")[0]

  const { data: dueSoon, error: dueSoonError } = await supabase
    .from("vendors")
    .select("*")
    .eq("status", "active")
    .lte("contract_anniversary", thirtyDaysStr)
    .gte("contract_anniversary", today)

  if (dueSoonError) {
    console.error("renewal-cron dueSoon query error:", dueSoonError)
  }

  for (const vendor of dueSoon ?? []) {
    // Only send if not already notified in this cycle
    const lastNotified = vendor.renewal_notified_at ? new Date(vendor.renewal_notified_at) : null
    const anniversary = new Date(vendor.contract_anniversary)
    const cycleStart = new Date(anniversary)
    cycleStart.setDate(cycleStart.getDate() - 31) // 31 days before anniversary

    if (lastNotified && lastNotified >= cycleStart) {
      continue // already notified this cycle
    }

    const daysLeft = Math.round(
      (new Date(vendor.contract_anniversary).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
    )

    try {
      await sendEmail({
        to: vendor.contact_email,
        subject: `Action Required: Your vendor contract renews in ${daysLeft} day${daysLeft !== 1 ? "s" : ""}`,
        html: `
          <h2>Annual Renewal Reminder</h2>
          <p>Dear ${vendor.contact_name},</p>
          <p>Your vendor contract for <strong>${vendor.company_name}</strong> is due for renewal in <strong>${daysLeft} day${daysLeft !== 1 ? "s" : ""}</strong> (${vendor.contract_anniversary}).</p>
          <p>Please log into your vendor portal to:</p>
          <ol>
            <li>Review and re-sign the updated Terms &amp; Conditions</li>
            <li>Upload your new Certificate of Insurance (COI)</li>
          </ol>
          <p><a href="${APP_URL}/vendor/renewal">Complete renewal now →</a></p>
          <p>If you do not complete the renewal by the due date, your account status will change to <strong>Action Required</strong>.</p>
          <br/>
          <p>The Ideasion Procurement Team</p>
        `,
      })

      await supabase
        .from("vendors")
        .update({ renewal_notified_at: new Date().toISOString() })
        .eq("id", vendor.id)

      console.log(`Renewal nudge sent to ${vendor.contact_email}`)
    } catch (err) {
      console.error(`Failed to send nudge to ${vendor.contact_email}:`, err)
    }
  }

  // ── 2. Mark overdue vendors as action_required ────────────────────────────────
  const { data: overdue, error: overdueError } = await supabase
    .from("vendors")
    .select("id, company_name, contact_email, renewal_notified_at")
    .eq("status", "active")
    .lt("contract_anniversary", today)
    .not("renewal_notified_at", "is", null) // were notified but didn't act

  if (overdueError) {
    console.error("renewal-cron overdue query error:", overdueError)
  }

  for (const vendor of overdue ?? []) {
    await supabase
      .from("vendors")
      .update({ status: "action_required" })
      .eq("id", vendor.id)

    console.log(`Vendor ${vendor.company_name} set to action_required (overdue)`)
  }

  return new Response(
    JSON.stringify({
      ok: true,
      nudgesSent: dueSoon?.length ?? 0,
      overdue: overdue?.length ?? 0,
    }),
    { status: 200 }
  )
})
