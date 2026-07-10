/**
 * services/email.service.js
 * ============================================================
 * Production-ready Hostinger SMTP email service for CogniVend.
 * ============================================================
 */

import nodemailer from "nodemailer";
import { validate } from "email-validator";

/* ============================================================
   SMTP Transporter — Lazy Singleton
============================================================ */

let _transporter: any = null;

const getTransporter = () => {
    if (!_transporter) {
        const host = process.env.SMTP_HOST || "smtp.hostinger.com";
        const port = parseInt(process.env.SMTP_PORT || "587", 10);
        const user = process.env.SMTP_USER;
        const pass = process.env.SMTP_PASS;

        if (!user || !pass) {
            console.warn("⚠️ SMTP_USER / SMTP_PASS not set");
        }

        _transporter = nodemailer.createTransport({
            host,
            port,
            secure: port === 465,
            auth: { user, pass },
            tls: { rejectUnauthorized: false }
        });

        _transporter.verify((err: any) => {
            if (err) console.error("❌ SMTP connection failed:", err.message);
            else console.log("✅ SMTP transporter ready");
        });
    }

    return _transporter;
};

/* ============================================================
   Config
============================================================ */

const getFrom = () => {
    const smtpFrom = process.env.SMTP_FROM;
    if (smtpFrom) {
        const match = smtpFrom.match(/^(?:"?([^"]*)"?\s)?<([^>]+)>$/);
        if (match) {
            return {
                name: match[1] || "CogniVend",
                email: match[2]
            };
        }
    }
    return {
        email: process.env.SES_FROM_EMAIL || process.env.SMTP_USER || "noreply-cognivend@ideassionlive.in",
        name: process.env.SES_FROM_NAME || "CogniVend"
    };
};

const RATE_LIMIT = parseInt(process.env.EMAIL_RATE_LIMIT_PER_MIN || "30", 10);
const MAX_RETRIES = 3;

/* ============================================================
   Token Bucket Rate Limiter
============================================================ */

const rateLimiter = {
    tokens: RATE_LIMIT,
    lastRefill: Date.now(),

    acquire() {
        const now = Date.now();
        const elapsed = (now - this.lastRefill) / 60000;
        this.tokens = Math.min(RATE_LIMIT, this.tokens + elapsed * RATE_LIMIT);
        this.lastRefill = now;
        if (this.tokens < 1) return false;
        this.tokens -= 1;
        return true;
    }
};

/* ============================================================
   Suppression List
============================================================ */

const suppressionList = new Set();

export const addToSuppressionList = (email: string) => {
    suppressionList.add(email.toLowerCase());
    console.warn(`⚠️ Suppressed email: ${email}`);
};

export const isSupPressed = (email: string) =>
    suppressionList.has(email.toLowerCase());

/* ============================================================
   Utility
============================================================ */

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const stripHtml = (html: string) =>
    html
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<\/p>/gi, "\n\n")
        .replace(/<[^>]+>/g, "")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#039;/g, "'")
        .trim();

/* ============================================================
   Retry Logic
============================================================ */

const sendWithRetry = async (mailOptions: any, attempt: number = 1) => {
    try {
        return await getTransporter().sendMail(mailOptions);
    } catch (err: any) {
        const retryable =
            ["ECONNRESET", "ETIMEDOUT", "ESOCKET"].includes(err.code) ||
            (err.responseCode && err.responseCode >= 400);

        if (retryable && attempt < MAX_RETRIES) {
            const backoff = Math.pow(2, attempt) * 1000;
            console.warn(`⚠️ Retry ${attempt}/${MAX_RETRIES} in ${backoff}ms`);
            await sleep(backoff);
            return sendWithRetry(mailOptions, attempt + 1);
        }

        throw err;
    }
};

/* ============================================================
   Send Single Email
============================================================ */

export const sendEmail = async ({ to, subject, html, text }: { to: string; subject: string; html: string; text?: string }) => {
    if (!validate(to)) {
        console.error("Invalid email:", to);
        return { success: false };
    }

    if (isSupPressed(to)) {
        console.warn("Suppressed:", to);
        return { success: false };
    }

    if (!rateLimiter.acquire()) {
        console.warn("Rate limited:", to);
        return { success: false };
    }

    const { email: FROM_EMAIL, name: FROM_NAME } = getFrom();

    const mailOptions = {
        from: `"${FROM_NAME}" <${FROM_EMAIL}>`,
        to,
        subject,
        html,
        text: text || stripHtml(html),
        replyTo: FROM_EMAIL,
        headers: {
            "X-Mailer": "CogniVend Mailer"
        }
    };

    try {
        console.log("📤 Sending:", to);
        const response = await sendWithRetry(mailOptions);
        console.log("✅ Delivered:", response.messageId);
        return { success: true, messageId: response.messageId };
    } catch (err) {
        console.error("❌ Failed:", err.message);
        return { success: false };
    }
};

/* ============================================================
   Bulk Email — Sequential
============================================================ */

export const sendBulkEmail = async ({ recipients, subject, html, text }) => {
    const unique = [...new Set(recipients)];
    console.log(`Bulk send: ${unique.length}`);

    const summary = { sent: 0, failed: 0 };

    for (const to of unique) {
        const result = await sendEmail({ to, subject, html, text });
        if (result.success) summary.sent++;
        else summary.failed++;
        await sleep(4000);
    }

    console.log("Bulk summary:", summary);
    return summary;
};

/* ============================================================
   Health Check
============================================================ */

export const isConfigured = () =>
    Boolean(process.env.SMTP_USER && process.env.SMTP_PASS && process.env.SES_FROM_EMAIL);

/* ============================================================
   Email Templates
============================================================ */

function layout(body) {
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
</html>`;
}

function btn(href, label) {
    return `<p style="margin:28px 0;">
    <a href="${href}"
       style="background:#1e3a5f;color:#ffffff;text-decoration:none;
              padding:13px 28px;border-radius:6px;font-size:15px;
              font-weight:bold;display:inline-block;">${label}</a>
  </p>`;
}

export const signupConfirmationHtml = ({ fullName, confirmationLink }) =>
    layout(`
    <h2 style="color:#1e3a5f;margin-top:0;">Confirm your email address</h2>
    <p>Hi ${fullName},</p>
    <p>Welcome to <strong>CogniVend</strong>! Please confirm your email address to activate your vendor account.</p>
    ${btn(confirmationLink, "Confirm Email Address")}
    <p style="color:#666;font-size:13px;">
      This link expires in 24 hours. If you did not create an account, you can safely ignore this email.
    </p>
  `);

export const passwordResetHtml = ({ resetLink }) =>
    layout(`
    <h2 style="color:#1e3a5f;margin-top:0;">Reset your password</h2>
    <p>We received a request to reset the password for your CogniVend account.</p>
    ${btn(resetLink, "Reset Password")}
    <p style="color:#666;font-size:13px;">
      This link expires in 1 hour. If you did not request a password reset, you can safely ignore this email.
    </p>
  `);

export const vendorSubmittedVendorHtml = ({ contactName, companyName, dashboardUrl }) =>
    layout(`
    <h2 style="color:#1e3a5f;margin-top:0;">Application received</h2>
    <p>Hi ${contactName},</p>
    <p>Thank you for submitting your vendor application for <strong>${companyName}</strong>.</p>
    <p>Our procurement team will review your documents and respond within <strong>2–3 business days</strong>.</p>
    ${btn(dashboardUrl, "View Application Status")}
    <p>The CogniVend Procurement Team</p>
  `);

export const vendorSubmittedAdminHtml = ({ companyName, contactName, contactEmail, reviewUrl }) =>
    layout(`
    <h2 style="color:#1e3a5f;margin-top:0;">New vendor application</h2>
    <table style="border-collapse:collapse;margin:16px 0;width:100%;">
      <tr>
        <td style="padding:6px 16px 6px 0;color:#666;width:140px;">Company</td>
        <td style="font-weight:bold;">${companyName}</td>
      </tr>
      <tr>
        <td style="padding:6px 16px 6px 0;color:#666;">Contact</td>
        <td>${contactName}</td>
      </tr>
      <tr>
        <td style="padding:6px 16px 6px 0;color:#666;">Email</td>
        <td>${contactEmail}</td>
      </tr>
    </table>
    ${btn(reviewUrl, "Review Application")}
  `);

export const vendorApprovedHtml = ({ contactName, companyName, vendorIdCode, contractAnniversary, dashboardUrl }) =>
    layout(`
    <h2 style="color:#1e3a5f;margin-top:0;">Your application has been approved &#127881;</h2>
    <p>Hi ${contactName},</p>
    <p>Congratulations! Your vendor application for <strong>${companyName}</strong>
       has been <strong style="color:#16a34a;">approved</strong>.</p>
    <table style="border-collapse:collapse;margin:20px 0;width:100%;">
      <tr>
        <td style="padding:6px 16px 6px 0;color:#666;width:180px;">Vendor ID</td>
        <td style="font-weight:bold;font-family:monospace;">${vendorIdCode}</td>
      </tr>
      <tr>
        <td style="padding:6px 16px 6px 0;color:#666;">Status</td>
        <td style="color:#16a34a;font-weight:bold;">Active</td>
      </tr>
      <tr>
        <td style="padding:6px 16px 6px 0;color:#666;">Contract Anniversary</td>
        <td>${contractAnniversary}</td>
      </tr>
    </table>
    <h3 style="color:#1e3a5f;">Next steps</h3>
    <ul style="padding-left:20px;color:#333;">
      <li>Review our Procurement Guidelines from the vendor portal</li>
      <li>Keep your Certificate of Insurance (COI) up to date</li>
      <li>Update your service offerings</li>
    </ul>
    ${btn(dashboardUrl, "Go to Vendor Portal")}
    <p>Welcome aboard!<br/>The CogniVend Procurement Team</p>
  `);

export const vendorStatusChangedHtml = ({ contactName, companyName, status, adminNotes, renewalUrl }) => {
    const subjects = {
        suspended: "Your vendor account has been suspended",
        rejected: "Vendor application update — CogniVend",
        action_required: "Action Required: Annual renewal due",
    };

    const bodies = {
        suspended: `
      <h2 style="color:#dc2626;margin-top:0;">Account Suspended</h2>
      <p>Hi ${contactName},</p>
      <p>Your vendor account for <strong>${companyName}</strong> has been temporarily suspended.</p>
      ${adminNotes ? `<p><strong>Note from our team:</strong> ${adminNotes}</p>` : ""}
      <p>Please contact our procurement team to discuss reinstatement.</p>`,

        rejected: `
      <h2 style="color:#dc2626;margin-top:0;">Application Update</h2>
      <p>Hi ${contactName},</p>
      <p>After reviewing your application for <strong>${companyName}</strong>,
         we are unable to proceed at this time.</p>
      ${adminNotes ? `<p><strong>Feedback:</strong> ${adminNotes}</p>` : ""}
      <p>You are welcome to re-apply in the future.</p>`,

        action_required: `
      <h2 style="color:#d97706;margin-top:0;">Annual Renewal Required</h2>
      <p>Hi ${contactName},</p>
      <p>Your annual contract for <strong>${companyName}</strong> is due for renewal. Please:</p>
      <ol style="padding-left:20px;">
        <li>Review and re-sign the updated Terms &amp; Conditions</li>
        <li>Upload your new Certificate of Insurance (COI)</li>
      </ol>
      ${renewalUrl ? btn(renewalUrl, "Complete Renewal Now") : ""}
      <p style="color:#dc2626;font-size:13px;">
        Failure to complete renewal may result in suspension of your vendor account.
      </p>`,
    };

    return { subject: subjects[status], html: layout(bodies[status]) };
};
