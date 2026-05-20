import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock @slack/web-api
const mockPostMessage = vi.fn().mockResolvedValue({ ok: true });
const mockLookupByEmail = vi.fn().mockResolvedValue({ ok: true, user: { id: 'U123' } });
vi.mock('@slack/web-api', () => ({
  WebClient: vi.fn().mockImplementation(() => ({
    chat: { postMessage: (...args: any[]) => mockPostMessage(...args) },
    users: { lookupByEmail: (...args: any[]) => mockLookupByEmail(...args) },
  })),
}));

// Set env vars before importing
process.env.SLACK_BOT_TOKEN = 'xoxb-test-token';
process.env.NEXT_PUBLIC_APP_URL = 'https://app.test.com';

describe('slack channel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLookupByEmail.mockResolvedValue({ ok: true, user: { id: 'U123' } });
    mockPostMessage.mockResolvedValue({ ok: true });
  });

  it('sends a DM with subject and body', async () => {
    const { sendSlackDM } = await import('@/lib/channels/slack');
    await sendSlackDM(
      { email: 'alice@test.com' },
      { subject: 'Time-off approved', body: 'Your request has been approved.' },
    );

    expect(mockLookupByEmail).toHaveBeenCalledWith({ email: 'alice@test.com' });
    expect(mockPostMessage).toHaveBeenCalledTimes(1);
    const msg = mockPostMessage.mock.calls[0][0];
    expect(msg.channel).toBe('U123');
    expect(msg.text).toContain('Time-off approved');
    expect(msg.text).toContain('Your request has been approved.');
  });

  it('includes a link when linkPath is provided', async () => {
    const { sendSlackDM } = await import('@/lib/channels/slack');
    await sendSlackDM(
      { email: 'alice@test.com' },
      { subject: 'Test', body: 'Body', linkPath: '/time-off' },
    );

    const msg = mockPostMessage.mock.calls[0][0];
    expect(msg.text).toContain('https://app.test.com/time-off');
    expect(msg.text).toContain('View in Dpeople');
  });

  it('does not send when user lookup fails', async () => {
    mockLookupByEmail.mockResolvedValue({ ok: false });
    const { sendSlackDM } = await import('@/lib/channels/slack');
    await sendSlackDM(
      { email: 'nobody@test.com' },
      { subject: 'Test', body: 'Body' },
    );

    expect(mockPostMessage).not.toHaveBeenCalled();
  });

  it('silently handles users_not_found error', async () => {
    mockLookupByEmail.mockRejectedValue({ data: { error: 'users_not_found' } });
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { sendSlackDM } = await import('@/lib/channels/slack');
    await sendSlackDM(
      { email: 'nobody@test.com' },
      { subject: 'Test', body: 'Body' },
    );

    // Should NOT log an error for users_not_found
    expect(consoleSpy).not.toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it('escapes mrkdwn special characters in subject and body to prevent injection', async () => {
    const { sendSlackDM } = await import('@/lib/channels/slack');
    await sendSlackDM(
      { email: 'alice@test.com' },
      {
        subject: 'Hello *bold* & <script>',
        body: 'Test ~strike~ `code` and <@U999>',
      },
    );

    const msg = mockPostMessage.mock.calls[0][0];
    // Slack mrkdwn special chars should be escaped
    // Raw * in subject should not produce unintended bold formatting
    expect(msg.text).not.toContain('<script>');
    expect(msg.text).not.toContain('<@U999>');
    // Angle brackets should be escaped for Slack mrkdwn
    expect(msg.text).toContain('&lt;script&gt;');
    expect(msg.text).toContain('&lt;@U999&gt;');
  });

  it('escapes linkPath to prevent Slack mrkdwn injection via URL', async () => {
    const { sendSlackDM } = await import('@/lib/channels/slack');
    await sendSlackDM(
      { email: 'alice@test.com' },
      {
        subject: 'Test',
        body: 'Body',
        linkPath: '/path?q=<script>&x=1',
      },
    );

    const msg = mockPostMessage.mock.calls[0][0];
    // linkPath should be escaped — raw angle brackets must not appear
    // inside the Slack link markup (which uses < > for link syntax)
    expect(msg.text).not.toContain('<script>');
    // The escaped URL should still be present in a valid Slack link
    expect(msg.text).toContain('View in Dpeople');
  });

  it('preserves ampersands in linkPath (does not break URL query params)', async () => {
    const { sendSlackDM } = await import('@/lib/channels/slack');
    await sendSlackDM(
      { email: 'alice@test.com' },
      {
        subject: 'Test',
        body: 'Body',
        linkPath: '/time-off?status=pending&page=2',
      },
    );

    const msg = mockPostMessage.mock.calls[0][0];
    // Ampersands in URLs must NOT be converted to &amp; — that breaks the link
    expect(msg.text).toContain('https://app.test.com/time-off?status=pending&page=2');
    expect(msg.text).not.toContain('&amp;');
  });
});
