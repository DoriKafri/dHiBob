import { describe, it, expect } from 'vitest'
import { existsSync } from 'fs'
import { resolve } from 'path'

const ROOT = resolve(__dirname, '../../../src')

describe('NextAuth route structure', () => {
  it('NextAuth catch-all route exists at /api/auth/[...nextauth]/route.ts', () => {
    const correctPath = resolve(ROOT, 'app/api/auth/[...nextauth]/route.ts')
    expect(existsSync(correctPath), `Missing: ${correctPath}`).toBe(true)
  })

  it('NextAuth route is NOT at /api/auth/route.ts (wrong path — breaks all auth endpoints)', () => {
    const wrongPath = resolve(ROOT, 'app/api/auth/route.ts')
    expect(existsSync(wrongPath), `Found wrong path: ${wrongPath}`).toBe(false)
  })

  it('NextAuth route exports GET and POST handlers', async () => {
    const mod = await import('../../../src/app/api/auth/[...nextauth]/route')
    expect(typeof mod.GET).toBe('function')
    expect(typeof mod.POST).toBe('function')
  })
})
