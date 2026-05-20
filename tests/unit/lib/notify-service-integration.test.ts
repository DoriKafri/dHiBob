/**
 * Integration-level tests for the notify service.
 * Verifies the full fan-out flow: trigger -> preferences check -> channel dispatch.
 * Addresses R6: only unit tests existed; these tests verify cross-module behavior.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// -- Mock Prisma with richer behavior for integration-level tests --
const mockPrefFindMany = vi.fn();
const mockEmpFindMany = vi.fn();
const mockNotifCreate = vi.fn();

vi.mock('@/lib/db', () => ({
  prisma: {
    notificationPreference: { findMany: (...args: any[]) => mockPrefFindMany(...args) },
    employee: { findMany: (...args: any[]) => mockEmpFindMany(...args) },
    notification: { create: (...args: any[]) => mockNotifCreate(...args) },
  },
}));

const mockPush = vi.fn();
vi.mock('@/lib/sse-manager', () => ({
  sseManager: { push: (...args: any[]) => mockPush(...args) },
}));

const mockSendEmail = vi.fn().mockResolvedValue(undefined);
vi.mock('@/lib/channels/email', () => ({
  sendEmail: (...args: any[]) => mockSendEmail(...args),
  isEmailConfigured: () => true,
}));

const mockSendSlackDM = vi.fn().mockResolvedValue(undefined);
vi.mock('@/lib/channels/slack', () => ({
  sendSlackDM: (...args: any[]) => mockSendSlackDM(...args),
  isSlackConfigured: () => true,
}));

describe('notify service — integration flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockNotifCreate.mockResolvedValue({
      id: 'notif-1', companyId: 'co-1', employeeId: 'emp-1',
      type: 'TIMEOFF_REQUEST', title: 'Test', message: null,
      linkUrl: null, channel: 'IN_APP', read: false, createdAt: new Date(),
    });
  });

  it('full fan-out: event -> preference check -> in-app + SSE + email + Slack', async () => {
    // Two recipients, no preference rows -> all channels enabled (defaults)
    mockPrefFindMany.mockResolvedValue([]);
    mockEmpFindMany.mockResolvedValue([
      { id: 'emp-1', email: 'alice@acme.com', firstName: 'Alice', lastName: 'Smith' },
      { id: 'emp-2', email: 'bob@acme.com', firstName: 'Bob', lastName: 'Jones' },
    ]);

    const { notifyService } = await import('@/lib/notify-service');
    await notifyService.send({
      companyId: 'co-1',
      recipients: ['emp-1', 'emp-2'],
      eventType: 'TIMEOFF_REQUEST',
      title: 'Time off request',
      message: 'Alice requested time off',
      linkUrl: '/time-off',
    });

    // In-app: 2 notifications created + 2 SSE pushes
    expect(mockNotifCreate).toHaveBeenCalledTimes(2);
    expect(mockPush).toHaveBeenCalledTimes(2);

    // Email: 2 emails sent
    expect(mockSendEmail).toHaveBeenCalledTimes(2);

    // Slack: 2 DMs sent
    expect(mockSendSlackDM).toHaveBeenCalledTimes(2);
  });

  it('preferences selectively disable channels per recipient', async () => {
    // emp-1: email disabled; emp-2: all channels disabled
    mockPrefFindMany.mockResolvedValue([
      { employeeId: 'emp-1', eventType: 'DOCUMENT_SIGNED', inApp: true, email: false, slack: true },
      { employeeId: 'emp-2', eventType: 'DOCUMENT_SIGNED', inApp: false, email: false, slack: false },
    ]);
    mockEmpFindMany.mockResolvedValue([
      { id: 'emp-1', email: 'alice@acme.com', firstName: 'Alice', lastName: 'Smith' },
      { id: 'emp-2', email: 'bob@acme.com', firstName: 'Bob', lastName: 'Jones' },
    ]);

    const { notifyService } = await import('@/lib/notify-service');
    await notifyService.send({
      companyId: 'co-1',
      recipients: ['emp-1', 'emp-2'],
      eventType: 'DOCUMENT_SIGNED',
      title: 'Document signed',
    });

    // emp-1: in-app + slack (no email); emp-2: nothing
    expect(mockNotifCreate).toHaveBeenCalledTimes(1); // only emp-1 in-app
    expect(mockSendEmail).not.toHaveBeenCalled(); // both disabled email
    expect(mockSendSlackDM).toHaveBeenCalledTimes(1); // only emp-1 slack
    expect(mockPush).toHaveBeenCalledTimes(1); // only emp-1 SSE
  });

  it('graceful degradation: one channel error does not block others', async () => {
    mockPrefFindMany.mockResolvedValue([]);
    mockEmpFindMany.mockResolvedValue([
      { id: 'emp-1', email: 'alice@acme.com', firstName: 'Alice', lastName: 'Smith' },
    ]);
    // In-app creation fails
    mockNotifCreate.mockRejectedValue(new Error('DB error'));

    const { notifyService } = await import('@/lib/notify-service');
    // Should not throw
    await expect(
      notifyService.send({
        companyId: 'co-1',
        recipients: ['emp-1'],
        eventType: 'SURVEY_PUBLISHED',
        title: 'New survey',
      })
    ).resolves.toBeUndefined();

    // Email and Slack should still have run
    expect(mockSendEmail).toHaveBeenCalledTimes(1);
    expect(mockSendSlackDM).toHaveBeenCalledTimes(1);
  });

  it('recipients not found in employee table are silently skipped', async () => {
    mockPrefFindMany.mockResolvedValue([]);
    // Only emp-1 found; emp-2 is not in the company
    mockEmpFindMany.mockResolvedValue([
      { id: 'emp-1', email: 'alice@acme.com', firstName: 'Alice', lastName: 'Smith' },
    ]);

    const { notifyService } = await import('@/lib/notify-service');
    await notifyService.send({
      companyId: 'co-1',
      recipients: ['emp-1', 'emp-ghost'],
      eventType: 'HR_ANNOUNCEMENT',
      title: 'Company update',
    });

    // Only emp-1 gets notifications
    expect(mockNotifCreate).toHaveBeenCalledTimes(1);
    expect(mockSendEmail).toHaveBeenCalledTimes(1);
    expect(mockSendSlackDM).toHaveBeenCalledTimes(1);
  });
});
