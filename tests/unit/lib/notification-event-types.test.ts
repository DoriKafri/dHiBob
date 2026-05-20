import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { NOTIFICATION_EVENT_TYPES } from '@/lib/notification-event-types';

describe('notification event types — architectural boundary', () => {
  it('NOTIFICATION_EVENT_TYPES is exported from a shared constants module, not a server router', () => {
    // The shared constants file should exist
    const sharedPath = path.resolve(__dirname, '../../../src/lib/notification-event-types.ts');
    expect(fs.existsSync(sharedPath)).toBe(true);

    // Verify the constant is importable and correct
    expect(NOTIFICATION_EVENT_TYPES).toBeDefined();
    expect(Array.isArray(NOTIFICATION_EVENT_TYPES)).toBe(true);
    expect(NOTIFICATION_EVENT_TYPES).toContain('TIMEOFF_REQUEST');
    expect(NOTIFICATION_EVENT_TYPES).toContain('SYSTEM');
    expect(NOTIFICATION_EVENT_TYPES.length).toBe(11);
  });

  it('notification-preferences.tsx does NOT import from @/server/', () => {
    const filePath = path.resolve(__dirname, '../../../src/components/settings/notification-preferences.tsx');
    const content = fs.readFileSync(filePath, 'utf-8');
    // Must not import from server modules (pulls in Prisma/tRPC server code)
    expect(content).not.toMatch(/from\s+["']@\/server\//);
  });

  it('notification-preferences.tsx imports NOTIFICATION_EVENT_TYPES from shared lib', () => {
    const filePath = path.resolve(__dirname, '../../../src/components/settings/notification-preferences.tsx');
    const content = fs.readFileSync(filePath, 'utf-8');
    expect(content).toMatch(/from\s+["']@\/lib\/notification-event-types["']/);
  });
});
