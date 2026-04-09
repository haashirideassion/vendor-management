import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { sendEmail } from "../send-email/index.ts"

const APP_URL = Deno.env.get("APP_URL") ?? "https://vendors.ideasion.com"

serve(async (req) => {
  try {
    const payload = await req.json()
    const vendor = payload.record
    const oldVendor = payload.old_record

    // Only fire when status transitions to 'active'
    if (vendor.status !== "active" || oldVendor?.status === "active") {
      return new Response(JSON.stringify({ ok: true, skipped: true }), { status: 200 })
    }

    await sendEmail({
      to: vendor.contact_email,
      subject: `Welcome to the Ideasion Vendor Network — Your Vendor ID: ${vendor.vendor_id_code}`,
      html: `
        <h2>Congratulations, ${vendor.contact_name}!</h2>
        <p>Your vendor application for <strong>${vendor.company_name}</strong> has been <strong>approved</strong>.</p>

        <table style="border-collapse:collapse;margin:16px 0;">
          <tr>
            <td style="padding:4px 16px 4px 0;color:#666;">Vendor ID</td>
            <td style="padding:4px 0;font-weight:bold;font-family:monospace;">${vendor.vendor_id_code}</td>
          </tr>
          <tr>
            <td style="padding:4px 16px 4px 0;color:#666;">Status</td>
            <td style="padding:4px 0;color:green;font-weight:bold;">Active</td>
          </tr>
          <tr>
            <td style="padding:4px 16px 4px 0;color:#666;">Contract Anniversary</td>
            <td style="padding:4px 0;">${vendor.contract_anniversary}</td>
          </tr>
        </table>

        <p>You can now access your vendor portal:</p>
        <p><a href="${APP_URL}/vendor/dashboard">${APP_URL}/vendor/dashboard</a></p>

        <h3>Next Steps</h3>
        <ul>
          <li>Review our <a href="${APP_URL}/procurement-guidelines.pdf">Procurement Guidelines</a></li>
          <li>Keep your Insurance Certificate (COI) up to date</li>
          <li>Update your service offerings in the vendor portal</li>
        </ul>

        <p>Welcome aboard!</p>
        <p>The Ideasion Procurement Team</p>
      `,
    })

    return new Response(JSON.stringify({ ok: true }), { status: 200 })
  } catch (err) {
    console.error("on-vendor-approved error:", err)
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 })
  }
})
