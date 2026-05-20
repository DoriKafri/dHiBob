import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('Google Calendar configuration', () => {
  it('prisma schema includes googleCalendarEventId on TimeOffRequest', () => {
    const schema = fs.readFileSync(
      path.resolve(__dirname, '../../../prisma/schema.prisma'),
      'utf-8',
    );
    expect(schema).toContain('googleCalendarEventId');
    expect(schema).toMatch(/googleCalendarEventId\s+String\?/);
  });

  it('.env.example contains GOOGLE_SERVICE_ACCOUNT_KEY', () => {
    const envExample = fs.readFileSync(
      path.resolve(__dirname, '../../../.env.example'),
      'utf-8',
    );
    expect(envExample).toContain('GOOGLE_SERVICE_ACCOUNT_KEY');
  });

  it('.env.example contains GOOGLE_CALENDAR_ID', () => {
    const envExample = fs.readFileSync(
      path.resolve(__dirname, '../../../.env.example'),
      'utf-8',
    );
    expect(envExample).toContain('GOOGLE_CALENDAR_ID');
  });

  it('pull-secrets.sh extracts GOOGLE_SERVICE_ACCOUNT_KEY from secrets', () => {
    const pullSecrets = fs.readFileSync(
      path.resolve(__dirname, '../../../scripts/pull-secrets.sh'),
      'utf-8',
    );
    expect(pullSecrets).toContain('GOOGLE_SERVICE_ACCOUNT_KEY');
  });

  it('pull-secrets.sh extracts GOOGLE_CALENDAR_ID from secrets', () => {
    const pullSecrets = fs.readFileSync(
      path.resolve(__dirname, '../../../scripts/pull-secrets.sh'),
      'utf-8',
    );
    expect(pullSecrets).toContain('GOOGLE_CALENDAR_ID');
  });
});
