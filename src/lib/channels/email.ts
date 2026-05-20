/**
 * Email channel: sends notifications via Resend.
 * Extracted from notification-dispatcher.ts for the centralized notify service.
 */
import { Resend } from "resend";

const resendApiKey = process.env.RESEND_API_KEY;
const fromEmail = process.env.NOTIFICATION_FROM_EMAIL;
const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

const resend = resendApiKey ? new Resend(resendApiKey) : null;

export interface EmailRecipient {
  email: string;
  firstName: string;
}

export interface EmailPayload {
  subject: string;
  body: string;
  linkPath?: string;
}

export function isEmailConfigured(): boolean {
  return !!(resend && fromEmail);
}

export async function sendEmail(recipient: EmailRecipient, payload: EmailPayload): Promise<void> {
  if (!resend || !fromEmail) return;
  try {
    await resend.emails.send({
      from: fromEmail,
      to: recipient.email,
      subject: payload.subject,
      html: buildHtml(recipient, payload),
      text: buildText(payload),
    });
  } catch (err) {
    console.error("[notify:email] send failed:", (err as Error)?.message ?? err);
  }
}

function buildHtml(recipient: EmailRecipient, payload: EmailPayload): string {
  const link = payload.linkPath
    ? `<p style="margin: 16px 0;"><a href="${escapeHtml(appUrl + payload.linkPath)}" style="background:#E33054; color:#fff; padding:10px 18px; border-radius:6px; text-decoration:none; display:inline-block; font-weight:600;">View in Dpeople</a></p>`
    : "";
  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #1f2937;">
      <p style="font-size: 14px; color: #6b7280; margin: 0 0 8px 0;">Hi ${escapeHtml(recipient.firstName)},</p>
      <h1 style="font-size: 18px; font-weight: 600; margin: 0 0 12px 0; color: #111827;">${escapeHtml(payload.subject)}</h1>
      <p style="font-size: 14px; line-height: 1.6; margin: 0 0 16px 0; white-space: pre-line;">${escapeHtml(payload.body)}</p>
      ${link}
      <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0 16px 0;" />
      <p style="font-size: 12px; color: #9ca3af; margin: 0;">
        Dpeople &middot; Develeap<br />
        Notification preferences can be changed in your profile settings.
      </p>
    </div>
  `.trim();
}

function buildText(payload: EmailPayload): string {
  const link = payload.linkPath ? `\n\n${appUrl}${payload.linkPath}` : "";
  return `${payload.subject}\n\n${payload.body}${link}`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}
