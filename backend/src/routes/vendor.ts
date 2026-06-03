import { Router, Request, Response } from "express"
import { requireWebhookSecret } from "../middleware/auth"
import {
  sendMail,
  vendorSubmittedVendorHtml,
  vendorSubmittedAdminHtml,
  vendorApprovedHtml,
  vendorStatusChangedHtml,
} from "../utils/mailer"

const router = Router()

const FRONTEND_URL = process.env.FRONTEND_URL!
const ADMIN_EMAIL = process.env.ADMIN_EMAIL!

// POST /api/vendor/status-change
// Triggered by a Supabase database webhook on the vendors table (INSERT and UPDATE events).
// Protected by the x-webhook-secret header — matches WEBHOOK_SECRET env var.
router.post("/status-change", requireWebhookSecret, async (req: Request, res: Response) => {
  try {
    const { record: vendor, old_record: oldVendor } = req.body

    // INSERT event: new vendor created
    if (!oldVendor) {
      await sendMail({
        to: vendor.contact_email,
        subject: "Your vendor application has been received",
        html: vendorSubmittedVendorHtml({
          contactName: vendor.contact_name,
          companyName: vendor.company_name,
          dashboardUrl: `${FRONTEND_URL}/vendor/dashboard`,
        }),
      })

      await sendMail({
        to: ADMIN_EMAIL,
        subject: `New vendor application: ${vendor.company_name}`,
        html: vendorSubmittedAdminHtml({
          companyName: vendor.company_name,
          contactName: vendor.contact_name,
          contactEmail: vendor.contact_email,
          reviewUrl: `${FRONTEND_URL}/admin/vendors/${vendor.id}`,
        }),
      })

      res.json({ ok: true })
      return
    }

    // UPDATE event: skip if status hasn't changed
    if (vendor.status === oldVendor?.status) {
      res.json({ ok: true, skipped: true })
      return
    }

    // Approval — status transitions to active
    if (vendor.status === "active" && oldVendor.status !== "active") {
      await sendMail({
        to: vendor.contact_email,
        subject: `Welcome to CogniVend — Vendor ID: ${vendor.vendor_id_code}`,
        html: vendorApprovedHtml({
          contactName: vendor.contact_name,
          companyName: vendor.company_name,
          vendorIdCode: vendor.vendor_id_code,
          contractAnniversary: vendor.contract_anniversary,
          dashboardUrl: `${FRONTEND_URL}/vendor/dashboard`,
        }),
      })
    } else if (["suspended", "rejected", "action_required"].includes(vendor.status)) {
      const { subject, html } = vendorStatusChangedHtml({
        contactName: vendor.contact_name,
        companyName: vendor.company_name,
        status: vendor.status,
        adminNotes: vendor.admin_notes,
        renewalUrl: `${FRONTEND_URL}/vendor/renewal`,
      })
      await sendMail({ to: vendor.contact_email, subject, html })
    }

    res.json({ ok: true })
  } catch (err: any) {
    console.error("[vendor/status-change]", err.message)
    res.status(500).json({ error: err.message })
  }
})

export default router
