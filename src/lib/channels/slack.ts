/**
 * Slack channel: sends DM notifications via bot token.
 * Extracted from notification-dispatcher.ts for the centralized notify service.
 */
import { WebClient } from "@slack/web-api";

const slackToken = process.env.SLACK_BOT_TOKEN;
const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
const slackTestEmail = process.env.SLACK_TEST_EMAIL;

const slack = slackToken ? new WebClient(slackToken) : null;

export interface SlackRecipient {
  email: string;
}

export interface SlackPayload {
  subject: string;
  body: string;
  linkPath?: string;
}

export function isSlackConfigured(): boolean {
  return !!slack;
}

/**
 * Escape Slack mrkdwn special characters to prevent injection.
 * Slack mrkdwn uses angle brackets for links/mentions/channels,
 * so we escape `<`, `>`, and `&` using Slack's entity encoding.
 * See: https://api.slack.com/reference/surfaces/formatting#escaping
 */
function escapeSlackMrkdwn(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Escape only angle brackets in a URL path for safe inclusion inside
 * Slack link markup (`<url|label>`). Ampersands must NOT be escaped
 * here because they are valid URL query-parameter separators and
 * Slack preserves them literally inside link URLs.
 */
function escapeSlackLinkPath(s: string): string {
  return s.replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export async function sendSlackDM(recipient: SlackRecipient, payload: SlackPayload): Promise<void> {
  if (!slack) return;
  // Dev safety: when SLACK_TEST_EMAIL is set, only send to that email
  if (slackTestEmail && recipient.email !== slackTestEmail) return;
  try {
    const lookup = await slack.users.lookupByEmail({ email: recipient.email });
    if (!lookup.ok || !lookup.user?.id) return;
    const safeSubject = escapeSlackMrkdwn(payload.subject);
    const safeBody = escapeSlackMrkdwn(payload.body);
    const safeLinkPath = payload.linkPath ? escapeSlackLinkPath(payload.linkPath) : undefined;
    const link = safeLinkPath ? ` <${appUrl}${safeLinkPath}|View in Dpeople>` : "";
    await slack.chat.postMessage({
      channel: lookup.user.id,
      text: `*${safeSubject}*\n${safeBody}${link}`,
    });
  } catch (err: any) {
    // users_not_found just means the email isn't on the workspace — expected, skip silently
    if (err?.data?.error !== "users_not_found") {
      console.error("[notify:slack] send failed:", err?.data?.error ?? err?.message ?? err);
    }
  }
}
