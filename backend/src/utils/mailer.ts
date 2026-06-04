import nodemailer from "nodemailer"

// ── SMTP Transporter ─────────────────────────────────────────────────────────

export const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT ?? 587),
  secure: true, // port 465 requires SSL
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
})

// ── Shared layout ─────────────────────────────────────────────────────────────

function layout(body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>CogniVend</title>
</head>
<body style="margin:0;padding:0;background:#f4f6f9;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f9;padding:40px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0"
             style="background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.07);">
        <tr>
          <td style="background:#1e3a5f;padding:28px 40px;">
            <span style="color:#ffffff;font-size:22px;font-weight:bold;letter-spacing:.5px;">CogniVend</span>
            <span style="color:#7eb3e0;font-size:13px;margin-left:8px;">Vendor Management</span>
          </td>
        </tr>
        <tr>
          <td style="padding:36px 40px;color:#333333;font-size:15px;line-height:1.7;">
            ${body}
          </td>
        </tr>
        <tr>
          <td style="background:#f4f6f9;padding:20px 40px;text-align:center;
                     color:#999999;font-size:12px;border-top:1px solid #e8ecf0;">
            &copy; ${new Date().getFullYear()} CogniVend &mdash; Ideassion Technologies.<br/>
            This email was sent because you have an account on CogniVend.
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
}

function btn(href: string, label: string): string {
  return `<p style="margin:28px 0;">
    <a href="${href}"
       style="background:#1e3a5f;color:#ffffff;text-decoration:none;
              padding:13px 28px;border-radius:6px;font-size:15px;
              font-weight:bold;display:inline-block;">${label}</a>
  </p>`
}

// ── Email templates ───────────────────────────────────────────────────────────

export function signupConfirmationHtml(opts: {
  fullName: string
  confirmationLink: string
}): string {
  return layout(`
    <h2 style="color:#1e3a5f;margin-top:0;">Confirm your email address</h2>
    <p>Hi ${opts.fullName},</p>
    <p>Welcome to <strong>CogniVend</strong>! Please confirm your email address to activate your vendor account.</p>
    ${btn(opts.confirmationLink, "Confirm Email Address")}
    <p style="color:#666;font-size:13px;">
      This link expires in 24 hours. If you did not create an account, you can safely ignore this email.
    </p>
  `)
}

export function passwordResetHtml(opts: { resetLink: string }): string {
  return layout(`
    <h2 style="color:#1e3a5f;margin-top:0;">Reset your password</h2>
    <p>We received a request to reset the password for your CogniVend account.</p>
    ${btn(opts.resetLink, "Reset Password")}
    <p style="color:#666;font-size:13px;">
      This link expires in 1 hour. If you did not request a password reset, you can safely ignore this email.
    </p>
  `)
}

export function vendorSubmittedVendorHtml(opts: {
  contactName: string
  companyName: string
  dashboardUrl: string
}): string {
  return layout(`
    <h2 style="color:#1e3a5f;margin-top:0;">Application received</h2>
    <p>Hi ${opts.contactName},</p>
    <p>Thank you for submitting your vendor application for <strong>${opts.companyName}</strong>.</p>
    <p>Our procurement team will review your documents and respond within <strong>2–3 business days</strong>.</p>
    ${btn(opts.dashboardUrl, "View Application Status")}
    <p>The CogniVend Procurement Team</p>
  `)
}

export function vendorSubmittedAdminHtml(opts: {
  companyName: string
  contactName: string
  contactEmail: string
  reviewUrl: string
}): string {
  return layout(`
    <h2 style="color:#1e3a5f;margin-top:0;">New vendor application</h2>
    <table style="border-collapse:collapse;margin:16px 0;width:100%;">
      <tr>
        <td style="padding:6px 16px 6px 0;color:#666;width:140px;">Company</td>
        <td style="font-weight:bold;">${opts.companyName}</td>
      </tr>
      <tr>
        <td style="padding:6px 16px 6px 0;color:#666;">Contact</td>
        <td>${opts.contactName}</td>
      </tr>
      <tr>
        <td style="padding:6px 16px 6px 0;color:#666;">Email</td>
        <td>${opts.contactEmail}</td>
      </tr>
    </table>
    ${btn(opts.reviewUrl, "Review Application")}
  `)
}

export function vendorApprovedHtml(opts: {
  contactName: string
  companyName: string
  vendorIdCode: string
  contractAnniversary: string
  dashboardUrl: string
}): string {
  return layout(`
    <h2 style="color:#1e3a5f;margin-top:0;">Your application has been approved &#127881;</h2>
    <p>Hi ${opts.contactName},</p>
    <p>Congratulations! Your vendor application for <strong>${opts.companyName}</strong>
       has been <strong style="color:#16a34a;">approved</strong>.</p>
    <table style="border-collapse:collapse;margin:20px 0;width:100%;">
      <tr>
        <td style="padding:6px 16px 6px 0;color:#666;width:180px;">Vendor ID</td>
        <td style="font-weight:bold;font-family:monospace;">${opts.vendorIdCode}</td>
      </tr>
      <tr>
        <td style="padding:6px 16px 6px 0;color:#666;">Status</td>
        <td style="color:#16a34a;font-weight:bold;">Active</td>
      </tr>
      <tr>
        <td style="padding:6px 16px 6px 0;color:#666;">Contract Anniversary</td>
        <td>${opts.contractAnniversary}</td>
      </tr>
    </table>
    <h3 style="color:#1e3a5f;">Next steps</h3>
    <ul style="padding-left:20px;color:#333;">
      <li>Review our Procurement Guidelines from the vendor portal</li>
      <li>Keep your Certificate of Insurance (COI) up to date</li>
      <li>Update your service offerings</li>
    </ul>
    ${btn(opts.dashboardUrl, "Go to Vendor Portal")}
    <p>Welcome aboard!<br/>The CogniVend Procurement Team</p>
  `)
}

export function vendorStatusChangedHtml(opts: {
  contactName: string
  companyName: string
  status: "suspended" | "rejected" | "action_required"
  adminNotes?: string
  renewalUrl?: string
}): { subject: string; html: string } {
  const subjects: Record<string, string> = {
    suspended: "Your vendor account has been suspended",
    rejected: "Vendor application update — CogniVend",
    action_required: "Action Required: Annual renewal due",
  }

  const bodies: Record<string, string> = {
    suspended: `
      <h2 style="color:#dc2626;margin-top:0;">Account Suspended</h2>
      <p>Hi ${opts.contactName},</p>
      <p>Your vendor account for <strong>${opts.companyName}</strong> has been temporarily suspended.</p>
      ${opts.adminNotes ? `<p><strong>Note from our team:</strong> ${opts.adminNotes}</p>` : ""}
      <p>Please contact our procurement team to discuss reinstatement.</p>`,

    rejected: `
      <h2 style="color:#dc2626;margin-top:0;">Application Update</h2>
      <p>Hi ${opts.contactName},</p>
      <p>After reviewing your application for <strong>${opts.companyName}</strong>,
         we are unable to proceed at this time.</p>
      ${opts.adminNotes ? `<p><strong>Feedback:</strong> ${opts.adminNotes}</p>` : ""}
      <p>You are welcome to re-apply in the future.</p>`,

    action_required: `
      <h2 style="color:#d97706;margin-top:0;">Annual Renewal Required</h2>
      <p>Hi ${opts.contactName},</p>
      <p>Your annual contract for <strong>${opts.companyName}</strong> is due for renewal. Please:</p>
      <ol style="padding-left:20px;">
        <li>Review and re-sign the updated Terms &amp; Conditions</li>
        <li>Upload your new Certificate of Insurance (COI)</li>
      </ol>
      ${opts.renewalUrl ? btn(opts.renewalUrl, "Complete Renewal Now") : ""}
      <p style="color:#dc2626;font-size:13px;">
        Failure to complete renewal may result in suspension of your vendor account.
      </p>`,
  }

  return {
    subject: subjects[opts.status],
    html: layout(bodies[opts.status]),
  }
}

// ── Send helper ───────────────────────────────────────────────────────────────

export async function sendMail(opts: {
  to: string
  subject: string
  html: string
}): Promise<void> {
  await transporter.sendMail({
    from: process.env.SMTP_FROM,
    to: opts.to,
    subject: opts.subject,
    html: opts.html,
  })
}
