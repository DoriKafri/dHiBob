import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Resend
const mockSend = vi.fn().mockResolvedValue({ id: 'email-1' });
vi.mock('resend', () => ({
  Resend: vi.fn().mockImplementation(() => ({
    emails: { send: (...args: any[]) => mockSend(...args) },
  })),
}));

// Set env vars before importing
process.env.RESEND_API_KEY = 'test-key';
process.env.NOTIFICATION_FROM_EMAIL = 'noreply@test.com';
process.env.NEXT_PUBLIC_APP_URL = 'https://app.test.com';

describe('email channel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('escapes linkPath in HTML to prevent XSS', async () => {
    const { sendEmail } = await import('@/lib/channels/email');

    await sendEmail(
      { email: 'alice@test.com', firstName: 'Alice' },
      {
        subject: 'Test Subject',
        body: 'Test body',
        linkPath: '/path?a=1&b=2"onmouseover="alert(1)',
      },
    );

    expect(mockSend).toHaveBeenCalledTimes(1);
    const html = mockSend.mock.calls[0][0].html;

    // The linkPath should be escaped in the href — no raw double quotes
    expect(html).not.toContain('onmouseover="alert(1)');
    // Should contain the escaped version
    expect(html).toContain('&amp;');
    expect(html).toContain('&quot;');
  });
});
