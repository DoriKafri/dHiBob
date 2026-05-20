import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockInsert = vi.fn().mockResolvedValue({ data: { id: 'evt-123' } });
const mockDelete = vi.fn().mockResolvedValue({});

vi.mock('googleapis', () => ({
  google: {
    auth: {
      GoogleAuth: vi.fn().mockImplementation(() => ({})),
    },
    calendar: vi.fn().mockReturnValue({
      events: {
        insert: (...args: any[]) => mockInsert(...args),
        delete: (...args: any[]) => mockDelete(...args),
      },
    }),
  },
}));

// Set env vars before importing the channel module
process.env.GOOGLE_SERVICE_ACCOUNT_KEY = Buffer.from(
  JSON.stringify({ type: 'service_account', project_id: 'test' }),
).toString('base64');
process.env.GOOGLE_CALENDAR_ID = 'test-calendar-id';

const sampleInput = {
  employeeName: 'Alice Tester',
  policyName: 'Vacation',
  startDate: new Date('2024-06-10'),
  endDate: new Date('2024-06-14'),
  reason: 'Summer trip',
  requestId: 'req-1',
};

describe('google-calendar channel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('isGoogleCalendarConfigured returns true when both env vars are set', async () => {
    const { isGoogleCalendarConfigured } = await import('@/lib/channels/google-calendar');
    expect(isGoogleCalendarConfigured()).toBe(true);
  });

  it('createTimeOffEvent calls calendar.events.insert with correct params', async () => {
    const { createTimeOffEvent } = await import('@/lib/channels/google-calendar');
    await createTimeOffEvent(sampleInput);

    expect(mockInsert).toHaveBeenCalledTimes(1);
    const args = mockInsert.mock.calls[0][0];
    expect(args.calendarId).toBe('test-calendar-id');
    expect(args.requestBody.summary).toBe('Alice Tester -- Vacation');
    expect(args.requestBody.start.date).toBe('2024-06-10');
    expect(args.requestBody.end.date).toBe('2024-06-15'); // exclusive end = endDate + 1 day
    expect(args.requestBody.description).toContain('req-1');
    expect(args.requestBody.description).toContain('Summer trip');
    expect(args.requestBody.transparency).toBe('opaque');
  });

  it('createTimeOffEvent returns the event ID from the API response', async () => {
    mockInsert.mockResolvedValueOnce({ data: { id: 'evt-xyz' } });
    const { createTimeOffEvent } = await import('@/lib/channels/google-calendar');
    const result = await createTimeOffEvent(sampleInput);
    expect(result).toBe('evt-xyz');
  });

  it('createTimeOffEvent returns null when API throws', async () => {
    mockInsert.mockRejectedValueOnce(new Error('API quota exceeded'));
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { createTimeOffEvent } = await import('@/lib/channels/google-calendar');
    const result = await createTimeOffEvent(sampleInput);
    expect(result).toBeNull();
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('[notify:gcal]'),
      expect.anything(),
    );
    consoleSpy.mockRestore();
  });

  it('createTimeOffEvent omits reason line from description when reason is null', async () => {
    const { createTimeOffEvent } = await import('@/lib/channels/google-calendar');
    await createTimeOffEvent({ ...sampleInput, reason: null });

    const args = mockInsert.mock.calls[0][0];
    expect(args.requestBody.description).not.toContain('Reason:');
    expect(args.requestBody.description).toContain('req-1');
  });

  it('deleteTimeOffEvent calls calendar.events.delete with correct params', async () => {
    const { deleteTimeOffEvent } = await import('@/lib/channels/google-calendar');
    await deleteTimeOffEvent('evt-123');

    expect(mockDelete).toHaveBeenCalledTimes(1);
    const args = mockDelete.mock.calls[0][0];
    expect(args.calendarId).toBe('test-calendar-id');
    expect(args.eventId).toBe('evt-123');
  });

  it('deleteTimeOffEvent does not throw when API fails', async () => {
    mockDelete.mockRejectedValueOnce(new Error('Not found'));
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { deleteTimeOffEvent } = await import('@/lib/channels/google-calendar');
    await expect(deleteTimeOffEvent('evt-999')).resolves.toBeUndefined();
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('[notify:gcal]'),
      expect.anything(),
    );
    consoleSpy.mockRestore();
  });

  describe('when not configured', () => {
    beforeEach(() => {
      vi.resetModules();
      delete process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
      delete process.env.GOOGLE_CALENDAR_ID;
    });

    afterEach(() => {
      // Restore for other tests
      process.env.GOOGLE_SERVICE_ACCOUNT_KEY = Buffer.from(
        JSON.stringify({ type: 'service_account', project_id: 'test' }),
      ).toString('base64');
      process.env.GOOGLE_CALENDAR_ID = 'test-calendar-id';
    });

    it('isGoogleCalendarConfigured returns false when env vars are missing', async () => {
      const { isGoogleCalendarConfigured } = await import('@/lib/channels/google-calendar');
      expect(isGoogleCalendarConfigured()).toBe(false);
    });

    it('createTimeOffEvent returns null silently when not configured', async () => {
      const { createTimeOffEvent } = await import('@/lib/channels/google-calendar');
      const result = await createTimeOffEvent(sampleInput);
      expect(result).toBeNull();
      expect(mockInsert).not.toHaveBeenCalled();
    });
  });
});
