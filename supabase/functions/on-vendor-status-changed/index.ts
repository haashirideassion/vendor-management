import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { sendEmail } from "../send-email/index.ts"

const APP_URL = Deno.env.get("APP_URL") ?? "https://vendors.ideasion.com"

const SUBJECT_MAP: Record<string, string> = {
  suspended: "Your vendor account has been suspended",
  rejected: "Vendor application update",
  action_required: "Action Required: Annual renewal due",
}

const BODY_MAP: Record<string, (vendor: Record<string, string>) => string> = {
  suspended: (v) => `
    <h2>Account Suspended</h2>
    <p>Dear ${v.contact_name},</p>
    <p>Your vendor account for <strong>${v.company_name}</strong> has been temporarily suspended.</p>
    <p>Please contact our procurement team for more information.</p>
    ${v.admin_notes ? `<p><strong>Notes from our team:</strong> ${v.admin_notes}</p>` : ""}
  `,
  rejected: (v) => `
    <h2>Application Status Update</h2>
    <p>Dear ${v.contact_name},</p>
    <p>After reviewing your application for <strong>${v.company_name}</strong>, we are unable to proceed at this time.</p>
    ${v.admin_notes ? `<p><strong>Feedback:</strong> ${v.admin_notes}</p>` : ""}
    <p>You are welcome to re-apply in the future.</p>
  `,
  action_required: (v) => `
    <h2>Annual Renewal Required</h2>
    <p>Dear ${v.contact_name},</p>
    <p>Your annual contract for <strong>${v.company_name}</strong> is due for renewal.</p>
    <p>Please log into your vendor portal and:</p>
    <ol>
      <li>Review and re-sign the updated Terms & Conditions</li>
      <li>Upload your new Certificate of Insurance (COI)</li>
    </ol>
    <p><a href="${APP_URL}/vendor/renewal">Complete renewal now</a></p>
    <p>Failure to complete renewal may result in suspension of your vendor account.</p>
  `,
}

serve(async (req) => {
  try {
    const payload = await req.json()
    const vendor = payload.record
    const oldVendor = payload.old_record

    // Skip if status hasn't changed or no email template for this status
    if (vendor.status === oldVendor?.status) {
      return new Response(JSON.stringify({ ok: true, skipped: true }), { status: 200 })
    }

    // 'active' status is handled by on-vendor-approved
    const bodyFn = BODY_MAP[vendor.status]
    if (!bodyFn) {
      return new Response(JSON.stringify({ ok: true, skipped: true }), { status: 200 })
    }

    await sendEmail({
      to: vendor.contact_email,
      subject: SUBJECT_MAP[vendor.status],
      html: bodyFn(vendor),
    })

    return new Response(JSON.stringify({ ok: true }), { status: 200 })
  } catch (err) {
    console.error("on-vendor-status-changed error:", err)
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 })
  }
})
