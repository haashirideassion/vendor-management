import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { sendEmail } from "../send-email/index.ts"

const ADMIN_EMAIL = Deno.env.get("ADMIN_EMAIL") ?? "admin@ideasion.com"
const APP_URL = Deno.env.get("APP_URL") ?? "https://vendors.ideasion.com"

serve(async (req) => {
  try {
    const payload = await req.json()
    // Supabase database webhook payload structure: { type, table, record, old_record }
    const vendor = payload.record

    // Email to vendor
    await sendEmail({
      to: vendor.contact_email,
      subject: "Your vendor application has been received",
      html: `
        <h2>Thank you, ${vendor.contact_name}!</h2>
        <p>We have received your vendor application for <strong>${vendor.company_name}</strong>.</p>
        <p>Our team will review your documents and get back to you within <strong>2–3 business days</strong>.</p>
        <p>You can track your application status by logging into your vendor portal:</p>
        <p><a href="${APP_URL}/vendor/dashboard">${APP_URL}/vendor/dashboard</a></p>
        <br/>
        <p>The Ideasion Procurement Team</p>
      `,
    })

    // Email to admin
    await sendEmail({
      to: ADMIN_EMAIL,
      subject: `New vendor application: ${vendor.company_name}`,
      html: `
        <h2>New Vendor Application</h2>
        <p><strong>Company:</strong> ${vendor.company_name}</p>
        <p><strong>Contact:</strong> ${vendor.contact_name} (${vendor.contact_email})</p>
        <p>Please review and approve or reject this application:</p>
        <p><a href="${APP_URL}/admin/vendors/${vendor.id}">Review application</a></p>
      `,
    })

    return new Response(JSON.stringify({ ok: true }), { status: 200 })
  } catch (err) {
    console.error("on-vendor-submitted error:", err)
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 })
  }
})
