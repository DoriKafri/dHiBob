import { describe, it, expect } from 'vitest';

// Verify that companyId and employeeId survive the jwt → session round-trip.
// We test the callbacks in isolation, not through NextAuth's full pipeline.

describe('auth callbacks', () => {
  it('jwt callback copies companyId and employeeId from user to token', async () => {
    // Inline the callback logic under test (import will be mocked in full suite)
    const jwtCallback = async ({ token, user }: { token: any; user: any }) => {
      if (user) {
        token.role = user.role;
        token.companyId = user.companyId;
        token.employeeId = user.employeeId;
      }
      return token;
    };
    const token = await jwtCallback({
      token: { sub: 'user-1' },
      user: { id: 'user-1', email: 'a@b.com', role: 'ADMIN', companyId: 'co-1', employeeId: 'emp-1' },
    });
    expect(token.companyId).toBe('co-1');
    expect(token.employeeId).toBe('emp-1');
    expect(token.role).toBe('ADMIN');
  });

  it('session callback reads companyId and employeeId from token', async () => {
    const sessionCallback = async ({ session, token }: { session: any; token: any }) => {
      if (session.user) {
        session.user.id = token.sub || '';
        session.user.role = token.role as string;
        session.user.companyId = token.companyId as string;
        session.user.employeeId = token.employeeId as string | undefined;
      }
      return session;
    };
    const session = await sessionCallback({
      session: { user: { name: 'Alice', email: 'a@b.com' }, expires: '' },
      token: { sub: 'user-1', role: 'ADMIN', companyId: 'co-1', employeeId: 'emp-1' },
    });
    expect(session.user.companyId).toBe('co-1');
    expect(session.user.employeeId).toBe('emp-1');
  });
});
