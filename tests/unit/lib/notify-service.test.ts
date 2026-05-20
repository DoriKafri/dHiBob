import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Prisma
const mockFindMany = vi.fn();
const mockCreate = vi.fn();
vi.mock('@/lib/db', () => ({
  prisma: {
    notificationPreference: { findMany: (...args: any[]) => mockFindMany(...args) },
    employee: { findMany: (...args: any[]) => mockFindMany(...args) },
    notification: { create: (...args: any[]) => mockCreate(...args) },
  },
}));

// Mock SSE manager
const mockPush = vi.fn();
vi.mock('@/lib/sse-manager', () => ({
  sseManager: { push: (...args: any[]) => mockPush(...args) },
}));

// Mock email channel
const mockSendEmail = vi.fn().mockResolvedValue(undefined);
vi.mock('@/lib/channels/email', () => ({
  sendEmail: (...args: any[]) => mockSendEmail(...args),
  isEmailConfigured: () => true,
}));

// Mock Slack channel
const mockSendSlackDM = vi.fn().mockResolvedValue(undefined);
vi.mock('@/lib/channels/slack', () => ({
  sendSlackDM: (...args: any[]) => mockSendSlackDM(...args),
  isSlackConfigured: () => true,
}));

describe('notifyService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default mocks: no preferences (all channels enabled), one employee
    mockFindMany.mockImplementation((args: any) => {
      // Detect which table by the query shape
      if (args?.where?.eventType) {
        // NotificationPreference query
        return Promise.resolve([]);
      }
      // Employee query
      return Promise.resolve([
        { id: 'emp-1', email: 'alice@acme.tech', firstName: 'Alice', lastName: 'Smith' },
      ]);
    });
    mockCreate.mockResolvedValue({
      id: 'notif-1', companyId: 'co-1', employeeId: 'emp-1', type: 'TIMEOFF_REQUEST',
      title: 'Test', message: null, linkUrl: null, channel: 'IN_APP', read: false, createdAt: new Date(),
    });
  });

  it('sends to all channels when no preferences exist (defaults)', async () => {
    const { notifyService } = await import('@/lib/notify-service');
    await notifyService.send({
      companyId: 'co-1',
      recipients: ['emp-1'],
      eventType: 'TIMEOFF_REQUEST',
      title: 'Test notification',
      message: 'Test message',
      linkUrl: '/time-off',
    });

    // In-app: notification created + SSE pushed
    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(mockPush).toHaveBeenCalledTimes(1);
    expect(mockPush).toHaveBeenCalledWith('emp-1', expect.objectContaining({ type: 'notification' }));

    // Email sent
    expect(mockSendEmail).toHaveBeenCalledTimes(1);
    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'alice@acme.tech', firstName: 'Alice' }),
      expect.objectContaining({ subject: 'Test notification' }),
    );

    // Slack sent
    expect(mockSendSlackDM).toHaveBeenCalledTimes(1);
  });

  it('respects preferences — skips email when email is disabled', async () => {
    // Return a preference with email disabled
    mockFindMany.mockImplementation((args: any) => {
      if (args?.where?.eventType) {
        return Promise.resolve([
          { employeeId: 'emp-1', eventType: 'TIMEOFF_REQUEST', inApp: true, email: false, slack: true },
        ]);
      }
      return Promise.resolve([
        { id: 'emp-1', email: 'alice@acme.tech', firstName: 'Alice', lastName: 'Smith' },
      ]);
    });

    const { notifyService } = await import('@/lib/notify-service');
    await notifyService.send({
      companyId: 'co-1',
      recipients: ['emp-1'],
      eventType: 'TIMEOFF_REQUEST',
      title: 'Test',
    });

    expect(mockCreate).toHaveBeenCalledTimes(1); // in-app still sent
    expect(mockSendEmail).not.toHaveBeenCalled(); // email skipped
    expect(mockSendSlackDM).toHaveBeenCalledTimes(1); // slack still sent
  });

  it('respects preferences — skips in-app when inApp is disabled', async () => {
    mockFindMany.mockImplementation((args: any) => {
      if (args?.where?.eventType) {
        return Promise.resolve([
          { employeeId: 'emp-1', eventType: 'TIMEOFF_REQUEST', inApp: false, email: true, slack: true },
        ]);
      }
      return Promise.resolve([
        { id: 'emp-1', email: 'alice@acme.tech', firstName: 'Alice', lastName: 'Smith' },
      ]);
    });

    const { notifyService } = await import('@/lib/notify-service');
    await notifyService.send({
      companyId: 'co-1',
      recipients: ['emp-1'],
      eventType: 'TIMEOFF_REQUEST',
      title: 'Test',
    });

    expect(mockCreate).not.toHaveBeenCalled(); // in-app skipped
    expect(mockPush).not.toHaveBeenCalled(); // SSE not pushed
    expect(mockSendEmail).toHaveBeenCalledTimes(1); // email sent
    expect(mockSendSlackDM).toHaveBeenCalledTimes(1); // slack sent
  });

  it('skips sending when recipients list is empty', async () => {
    const { notifyService } = await import('@/lib/notify-service');
    await notifyService.send({
      companyId: 'co-1',
      recipients: [],
      eventType: 'TIMEOFF_REQUEST',
      title: 'Test',
    });

    expect(mockCreate).not.toHaveBeenCalled();
    expect(mockSendEmail).not.toHaveBeenCalled();
    expect(mockSendSlackDM).not.toHaveBeenCalled();
  });

  it('uses emailSubject/emailBody overrides when provided', async () => {
    const { notifyService } = await import('@/lib/notify-service');
    await notifyService.send({
      companyId: 'co-1',
      recipients: ['emp-1'],
      eventType: 'TIMEOFF_REQUEST',
      title: 'In-App Title',
      message: 'In-App Message',
      emailSubject: 'Custom Email Subject',
      emailBody: 'Custom Email Body',
    });

    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ subject: 'Custom Email Subject', body: 'Custom Email Body' }),
    );
  });

  it('sends general title/message to Slack, not email overrides (R3)', async () => {
    const { notifyService } = await import('@/lib/notify-service');
    await notifyService.send({
      companyId: 'co-1',
      recipients: ['emp-1'],
      eventType: 'TIMEOFF_REQUEST',
      title: 'General Title',
      message: 'General Message',
      emailSubject: 'Email-Only Subject',
      emailBody: 'Email-Only Body',
    });

    // Slack should receive the general title/message, NOT the email-specific overrides
    expect(mockSendSlackDM).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ subject: 'General Title', body: 'General Message' }),
    );
    // Verify email still gets the overrides
    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ subject: 'Email-Only Subject', body: 'Email-Only Body' }),
    );
  });

  it('fans out to multiple recipients', async () => {
    // Return two employees
    mockFindMany.mockImplementation((args: any) => {
      if (args?.where?.eventType) {
        return Promise.resolve([]);
      }
      return Promise.resolve([
        { id: 'emp-1', email: 'alice@acme.tech', firstName: 'Alice', lastName: 'Smith' },
        { id: 'emp-2', email: 'bob@acme.tech', firstName: 'Bob', lastName: 'Jones' },
      ]);
    });
    mockCreate.mockResolvedValue({
      id: 'notif-x', companyId: 'co-1', employeeId: 'emp-x', type: 'TIMEOFF_REQUEST',
      title: 'Test', message: null, linkUrl: null, channel: 'IN_APP', read: false, createdAt: new Date(),
    });

    const { notifyService } = await import('@/lib/notify-service');
    await notifyService.send({
      companyId: 'co-1',
      recipients: ['emp-1', 'emp-2'],
      eventType: 'TIMEOFF_REQUEST',
      title: 'Multi-recipient test',
    });

    // Each recipient gets in-app, email, and Slack (6 total tasks: 2 in-app + 2 email + 2 slack)
    expect(mockCreate).toHaveBeenCalledTimes(2);
    expect(mockSendEmail).toHaveBeenCalledTimes(2);
    expect(mockSendSlackDM).toHaveBeenCalledTimes(2);
    expect(mockPush).toHaveBeenCalledTimes(2);
  });

  it('filters employee lookup by companyId', async () => {
    const { notifyService } = await import('@/lib/notify-service');
    await notifyService.send({
      companyId: 'co-1',
      recipients: ['emp-1'],
      eventType: 'TIMEOFF_REQUEST',
      title: 'Test',
    });

    // The employee findMany should include companyId filter
    const empCall = mockFindMany.mock.calls.find(
      (call: any[]) => call[0]?.select?.email !== undefined
    );
    expect(empCall).toBeDefined();
    expect(empCall![0].where.companyId).toBe('co-1');
  });

  it('handles errors on one channel without blocking others', async () => {
    mockCreate.mockRejectedValue(new Error('DB error'));

    const { notifyService } = await import('@/lib/notify-service');
    // Should not throw — errors are caught per-channel
    await expect(
      notifyService.send({
        companyId: 'co-1',
        recipients: ['emp-1'],
        eventType: 'TIMEOFF_REQUEST',
        title: 'Test',
      })
    ).resolves.toBeUndefined();

    // Email and Slack should still have been attempted
    expect(mockSendEmail).toHaveBeenCalledTimes(1);
    expect(mockSendSlackDM).toHaveBeenCalledTimes(1);
  });
});
