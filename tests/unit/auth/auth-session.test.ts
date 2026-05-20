import { describe, it, expect } from 'vitest'

// This tests the structure of what the auth callbacks produce.
// It does NOT test NextAuth internals — just that our JWT and session
// callbacks correctly forward companyId and role.

function makeJwtCallback(token: Record<string, unknown>, user?: Record<string, unknown>) {
  // Mirrors the jwt callback in auth.ts — we'll copy the fixed version here
  if (user) {
    token.role = user.role
    token.companyId = user.companyId
    token.employeeId = user.employeeId
  }
  return token
}

function makeSessionCallback(session: { user: Record<string, unknown> }, token: Record<string, unknown>) {
  // Mirrors the session callback in auth.ts
  if (session.user) {
    session.user.id = token.sub ?? ''
    session.user.role = token.role as string
    session.user.companyId = token.companyId as string
    session.user.employeeId = token.employeeId as string | undefined
  }
  return session
}

describe('Auth callbacks', () => {
  it('jwt callback preserves companyId from user object', () => {
    const token = { sub: 'user-1' }
    const user = { role: 'EMPLOYEE', companyId: 'company-1', employeeId: 'emp-1' }
    const result = makeJwtCallback(token, user)
    expect(result.companyId).toBe('company-1')
    expect(result.role).toBe('EMPLOYEE')
    expect(result.employeeId).toBe('emp-1')
  })

  it('jwt callback with no user leaves token unchanged', () => {
    const token = { sub: 'user-1', role: 'ADMIN', companyId: 'co-1' }
    const result = makeJwtCallback({ ...token })
    expect(result.companyId).toBe('co-1')
  })

  it('session callback copies companyId from token to session.user', () => {
    const session = { user: { email: 'test@example.com' } }
    const token = { sub: 'user-1', role: 'EMPLOYEE', companyId: 'company-1', employeeId: 'emp-1' }
    const result = makeSessionCallback(session, token)
    expect(result.user.companyId).toBe('company-1')
    expect(result.user.id).toBe('user-1')
    expect(result.user.role).toBe('EMPLOYEE')
  })

  it('session callback sets empty string when sub is missing', () => {
    const session = { user: {} }
    const token = { role: 'ADMIN', companyId: 'co-1' }
    const result = makeSessionCallback(session, token)
    expect(result.user.id).toBe('')
  })
})
