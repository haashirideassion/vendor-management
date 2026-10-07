/**
 * services/email.service.ts
 * ============================================================
 * Transactional SMTP email service for CogniVend.
 *
 * All configuration comes from environment variables (see
 * backend/.env.example). Nothing here is provider-specific.
 * ============================================================
 */

import nodemailer, { Transporter } from "nodemailer";
import { validate } from "email-validator";

/* ============================================================
   Configuration
============================================================ */

export type SmtpSecurity = "ssl" | "starttls" | "none";

export interface SmtpConfig {
    host: string;
    port: number;
    user: string;
    pass: string;
    security: SmtpSecurity;
    rejectUnauthorized: boolean;
}

/**
 * Reads SMTP settings from the environment. Returns the list of missing
 * variables instead of silently falling back to defaults, so a bad
 * deployment is reported rather than discovered as "emails never arrive".
 */
export const readSmtpConfig = (): { config?: SmtpConfig; missing: string[] } => {
    const missing: string[] = [];
    const host = process.env.SMTP_HOST?.trim();
    // SMTP_USERNAME / SMTP_PASSWORD are accepted as aliases: a deployment that
    // only defines those names would otherwise look "unconfigured" in production.
    const user = (process.env.SMTP_USER || process.env.SMTP_USERNAME)?.trim();
    const pass = process.env.SMTP_PASS || process.env.SMTP_PASSWORD;
    if (!host) missing.push("SMTP_HOST");
    if (!user) missing.push("SMTP_USER");
    if (!pass) missing.push("SMTP_PASS");

    const port = parseInt(process.env.SMTP_PORT || "587", 10);
    if (!Number.isInteger(port) || port <= 0) missing.push("SMTP_PORT");

    // SMTP_SECURE: "ssl" (implicit TLS, usually 465), "starttls" (usually 587)
    // or "none". Defaults to the conventional mode for the chosen port.
    const requested = (process.env.SMTP_SECURE || "").trim().toLowerCase();
    let security: SmtpSecurity = port === 465 ? "ssl" : "starttls";
    if (requested === "ssl" || requested === "true") security = "ssl";
    else if (requested === "starttls" || requested === "false") security = "starttls";
    else if (requested === "none") security = "none";

    if (missing.length > 0) return { missing };
    return {
        missing,
        config: {
            host: host!,
            port,
            user: user!,
            pass: pass!,
            security,
            // Certificate validation stays ON unless explicitly disabled for a
            // known self-signed dev relay.
            rejectUnauthorized: process.env.SMTP_TLS_REJECT_UNAUTHORIZED !== "false",
        },
    };
};

let _transporter: Transporter | null = null;

const getTransporter = (): Transporter => {
    if (_transporter) return _transporter;
    const { config, missing } = readSmtpConfig();
    if (!config) {
        throw Object.assign(new Error(`SMTP is not configured (missing: ${missing.join(", ")})`), { code: "SMTP_NOT_CONFIGURED" });
    }
    _transporter = nodemailer.createTransport({
        host: config.host,
        port: config.port,
        secure: config.security === "ssl",
        requireTLS: config.security === "starttls",
        ignoreTLS: config.security === "none",
        auth: { user: config.user, pass: config.pass },
        tls: { rejectUnauthorized: config.rejectUnauthorized },
        // Bounded timeouts: on a serverless host a hung socket would otherwise
        // run until the function is killed and the request just times out.
        // Kept well under Vercel's default 10s function limit so a slow SMTP
        // handshake fails visibly (and is logged) instead of the whole request
        // being killed with no log line and no email.
        connectionTimeout: 6_000,
        greetingTimeout: 6_000,
        socketTimeout: 8_000,
    });
    return _transporter;
};

/** Test hook: forget the cached transporter after env changes. */
export const resetTransporter = () => { _transporter = null; };

/** Opens a connection and authenticates, without sending anything. */
export const verifySmtp = async (): Promise<{ ok: boolean; error?: string }> => {
    try {
        await getTransporter().verify();
        return { ok: true };
    } catch (err: any) {
        return { ok: false, error: err.code || err.message };
    }
};

const getFrom = () => {
    // Preferred: SMTP_FROM_EMAIL + SMTP_FROM_NAME. Legacy: SMTP_FROM="Name <addr>".
    const email = process.env.SMTP_FROM_EMAIL?.trim();
    if (email) return { email, name: process.env.SMTP_FROM_NAME?.trim() || "CogniVend" };

    const legacy = process.env.SMTP_FROM;
    if (legacy) {
        const match = legacy.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
        if (match) return { name: match[1] || "CogniVend", email: match[2] };
        if (validate(legacy.trim())) return { name: "CogniVend", email: legacy.trim() };
    }
    return { email: process.env.SMTP_USER || "", name: process.env.SMTP_FROM_NAME?.trim() || "CogniVend" };
};

const RATE_LIMIT = parseInt(process.env.EMAIL_RATE_LIMIT_PER_MIN || "30", 10);
const MAX_RETRIES = 3;

/* ============================================================
   Token Bucket Rate Limiter (per process)
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

const suppressionList = new Set<string>();

export const addToSuppressionList = (email: string) => {
    suppressionList.add(email.toLowerCase());
    console.warn("⚠️ Email address added to suppression list");
};

export const isSupPressed = (email: string) =>
    suppressionList.has(email.toLowerCase());

/* ============================================================
   Utility
============================================================ */

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const escapeHtml = (value: unknown): string =>
    String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");

// Plain-text alternative. Anchors become "label: url" so the action link is
// still present for clients that only render text/plain.
const stripHtml = (html: string) =>
    html
        .replace(/<a\s[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, (_m, href, label) => `${label.replace(/<[^>]+>/g, "").trim()}: ${href}`)
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<\/(p|h2|h3|tr|li)>/gi, "\n\n")
        .replace(/<[^>]+>/g, "")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#039;/g, "'")
        .replace(/[ \t]+\n/g, "\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim();

/* ============================================================
   Retry Logic — transient failures only
============================================================ */

const isTransient = (err: any) =>
    ["ECONNRESET", "ETIMEDOUT", "ESOCKET", "ECONNECTION", "EDNS"].includes(err.code) ||
    // 4xx SMTP replies are temporary; 5xx (bad credentials 535, rejected
    // recipient 550, ...) will not succeed on retry.
    (typeof err.responseCode === "number" && err.responseCode >= 400 && err.responseCode < 500);

// Total time we allow ourselves for one email, retries included.
const SEND_BUDGET_MS = parseInt(process.env.EMAIL_SEND_BUDGET_MS || "8000", 10);

const sendWithRetry = async (mailOptions: any, attempt: number = 1, startedAt: number = Date.now()): Promise<any> => {
    try {
        return await getTransporter().sendMail(mailOptions);
    } catch (err: any) {
        const backoff = Math.pow(2, attempt) * 500;
        if (isTransient(err) && attempt < MAX_RETRIES && Date.now() - startedAt + backoff < SEND_BUDGET_MS) {
            console.warn(`⚠️ SMTP transient failure (${err.code || err.responseCode}), retry ${attempt}/${MAX_RETRIES - 1} in ${backoff}ms`);
            await sleep(backoff);
            return sendWithRetry(mailOptions, attempt + 1, startedAt);
        }
        throw err;
    }
};

/* ============================================================
   Send Single Email
============================================================ */

export interface SendEmailResult {
    success: boolean;
    messageId?: string;
    /** Machine-readable reason when success is false. Never contains secrets. */
    reason?: "invalid_recipient" | "suppressed" | "rate_limited" | "not_configured" | "smtp_error";
}

/**
 * Never throws. Callers MUST inspect `success` -- invitation/verification
 * endpoints use it to tell the sender whether the email actually went out.
 */
export const sendEmail = async ({ to, subject, html, text }: { to: string; subject: string; html: string; text?: string }): Promise<SendEmailResult> => {
    if (!to || !validate(to)) {
        console.error("[email] invalid recipient address");
        return { success: false, reason: "invalid_recipient" };
    }

    if (isSupPressed(to)) {
        console.warn("[email] recipient suppressed");
        return { success: false, reason: "suppressed" };
    }

    if (!rateLimiter.acquire()) {
        console.warn("[email] rate limited");
        return { success: false, reason: "rate_limited" };
    }

    const { missing } = readSmtpConfig();
    const { email: FROM_EMAIL, name: FROM_NAME } = getFrom();
    if (missing.length > 0 || !FROM_EMAIL) {
        console.error(`[email] SMTP not configured (missing: ${[...missing, ...(FROM_EMAIL ? [] : ["SMTP_FROM_EMAIL"])].join(", ")})`);
        return { success: false, reason: "not_configured" };
    }

    const mailOptions = {
        from: { name: FROM_NAME, address: FROM_EMAIL },
        to,
        subject,
        html,
        text: text || stripHtml(html),
        replyTo: FROM_EMAIL,
        headers: { "X-Mailer": "CogniVend Mailer" },
    };

    try {
        const response = await sendWithRetry(mailOptions);
        console.log("[email] accepted by SMTP server:", response.messageId);
        return { success: true, messageId: response.messageId };
    } catch (err: any) {
        // The message body (which holds the link/token) is never logged.
        console.error(`[email] send failed (${err.code || err.responseCode || "unknown"}): ${err.message}`);
        return { success: false, reason: "smtp_error" };
    }
};


/* ============================================================
   Bulk Email — Sequential
============================================================ */

export const sendBulkEmail = async ({ recipients, subject, html, text }: { recipients: string[]; subject: string; html: string; text?: string }) => {
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
    readSmtpConfig().missing.length === 0 && Boolean(getFrom().email);

/**
 * Safe-to-return picture of the email setup for production debugging:
 * variable NAMES that are missing, non-secret settings, and a live SMTP
 * handshake. Never includes the password or any token.
 */
export const smtpDiagnostics = async () => {
    const { config, missing } = readSmtpConfig();
    const from = getFrom();
    const usedNames = {
        user: process.env.SMTP_USER ? "SMTP_USER" : process.env.SMTP_USERNAME ? "SMTP_USERNAME" : null,
        pass: process.env.SMTP_PASS ? "SMTP_PASS" : process.env.SMTP_PASSWORD ? "SMTP_PASSWORD" : null,
    };
    let frontendUrl: string | { error: string };
    try { frontendUrl = (await import("../utils/appUrl")).getFrontendUrl(); }
    catch (e: any) { frontendUrl = { error: e.message }; }
    const t0 = Date.now();
    const handshake = config ? await verifySmtp() : { ok: false, error: "not configured" };
    return {
        runtime: { nodeEnv: process.env.NODE_ENV ?? null, vercel: Boolean(process.env.VERCEL), vercelEnv: process.env.VERCEL_ENV ?? null, region: process.env.VERCEL_REGION ?? null },
        configured: isConfigured(),
        missing: [...missing, ...(from.email ? [] : ["SMTP_FROM_EMAIL (or SMTP_FROM)"])],
        settings: config ? { host: config.host, port: config.port, security: config.security, tlsVerify: config.rejectUnauthorized, user: config.user } : null,
        credentialVariables: usedNames,
        from,
        frontendUrl,
        handshake: { ...handshake, ms: Date.now() - t0 },
    };
};

/* ============================================================
   Email Templates
============================================================ */

function layout(body: string) {
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

function btn(href: string, label: string) {
    return `<p style="margin:28px 0;">
    <a href="${href}"
       style="background:#1e3a5f;color:#ffffff;text-decoration:none;
              padding:13px 28px;border-radius:6px;font-size:15px;
              font-weight:bold;display:inline-block;">${label}</a>
  </p>`;
}

// Displayed expiry only -- the real lifetimes are enforced by Supabase Auth
// (Dashboard > Authentication > Email > OTP expiry; recovery links default
// to 1h, invite/confirm links to 24h). Keep these env values in sync.
const hours = (envName: string, fallback: number) => {
    const n = parseInt(process.env[envName] || "", 10);
    return Number.isFinite(n) && n > 0 ? n : fallback;
};
const humanHours = (h: number) => (h === 1 ? "1 hour" : h % 24 === 0 ? `${h / 24} day${h === 24 ? "" : "s"}` : `${h} hours`);

export const signupConfirmationHtml = ({ fullName, confirmationLink, accountLabel }: { fullName: string; confirmationLink: string; accountLabel?: string }) =>
    layout(`
    <h2 style="color:#1e3a5f;margin-top:0;">Verify your email address</h2>
    <p>Hi ${escapeHtml(fullName)},</p>
    <p>Welcome to <strong>CogniVend</strong>! Please verify your email address to activate your ${escapeHtml(accountLabel ?? "account")}.</p>
    ${btn(escapeHtml(confirmationLink), "Verify Email Address")}
    <p style="color:#666;font-size:13px;">
      This link can be used once and expires in ${humanHours(hours("EMAIL_VERIFICATION_EXPIRY_HOURS", 24))}. If you did not create an account, you can safely ignore this email.
    </p>
  `);

export const inviteHtml = ({ fullName, entityName, entityLabel, inviteLink }: { fullName: string; entityName: string; entityLabel?: string; inviteLink: string }) =>
    layout(`
    <h2 style="color:#1e3a5f;margin-top:0;">You've been invited to CogniVend</h2>
    <p>Hi ${escapeHtml(fullName)},</p>
    <p>You've been invited to join <strong>${escapeHtml(entityName)}</strong>${entityLabel ? ` as ${escapeHtml(entityLabel)}` : ""} on CogniVend. Accepting verifies your email and lets you choose a password.</p>
    ${btn(escapeHtml(inviteLink), "Accept Invitation")}
    <p style="color:#666;font-size:13px;">
      This link can be used once and expires in ${humanHours(hours("INVITE_EXPIRY_HOURS", 24))}. If you weren't expecting this invitation, you can safely ignore this email.
    </p>
  `);

export const existingAccountAddedHtml = ({ fullName, entityName, entityLabel, loginLink }: { fullName: string; entityName: string; entityLabel?: string; loginLink: string }) =>
    layout(`
    <h2 style="color:#1e3a5f;margin-top:0;">You've been added to ${escapeHtml(entityName)}</h2>
    <p>Hi ${escapeHtml(fullName)},</p>
    <p>You've been added to <strong>${escapeHtml(entityName)}</strong>${entityLabel ? ` as ${escapeHtml(entityLabel)}` : ""} on CogniVend. Sign in with your existing account to get started.</p>
    ${btn(escapeHtml(loginLink), "Sign In")}
  `);

export const passwordResetHtml = ({ resetLink }: { resetLink: string }) =>
    layout(`
    <h2 style="color:#1e3a5f;margin-top:0;">Reset your password</h2>
    <p>We received a request to reset the password for your CogniVend account.</p>
    ${btn(escapeHtml(resetLink), "Reset Password")}
    <p style="color:#666;font-size:13px;">
      This link can be used once and expires in ${humanHours(hours("PASSWORD_RESET_EXPIRY_HOURS", 1))}. If you did not request a password reset, you can safely ignore this email.
    </p>
  `);

export const vendorSubmittedVendorHtml = ({ contactName, companyName, dashboardUrl }: any) =>
    layout(`
    <h2 style="color:#1e3a5f;margin-top:0;">Application received</h2>
    <p>Hi ${contactName},</p>
    <p>Thank you for submitting your vendor application for <strong>${companyName}</strong>.</p>
    <p>Our procurement team will review your documents and respond within <strong>2–3 business days</strong>.</p>
    ${btn(dashboardUrl, "View Application Status")}
    <p>The CogniVend Procurement Team</p>
  `);

export const vendorSubmittedAdminHtml = ({ companyName, contactName, contactEmail, reviewUrl }: any) =>
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

export const vendorApprovedHtml = ({ contactName, companyName, vendorIdCode, contractAnniversary, dashboardUrl }: any) =>
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

export const vendorStatusChangedHtml = ({ contactName, companyName, status, adminNotes, renewalUrl }: any) => {
    const subjects: Record<string, string> = {
        suspended: "Your vendor account has been suspended",
        rejected: "Vendor application update — CogniVend",
        action_required: "Action Required: Annual renewal due",
    };

    const bodies: Record<string, string> = {
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
