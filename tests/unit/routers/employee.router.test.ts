import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { PrismaClient } from '@prisma/client'
import { employeeRouter } from '@/server/routers/employee'
import { execSync } from 'child_process'
import path from 'path'

const TEST_DB_URL = process.env.TEST_DATABASE_URL ?? 'postgresql://dhibob:dhibob_secret@localhost:5432/dhibob_test'

let db: PrismaClient
let companyId: string
let employeeId: string
let otherCompanyId: string

// Helper to create a tRPC caller with a mock session context
function makeCaller(overrideCompanyId?: string) {
  const ctx = {
    session: { user: { id: 'user-1', companyId: overrideCompanyId ?? companyId, role: 'ADMIN' } },
    db,
    user: { id: 'user-1', companyId: overrideCompanyId ?? companyId, role: 'ADMIN' },
  }
  return employeeRouter.createCaller(ctx as any)
}

beforeAll(async () => {
  // Apply schema to test database
  execSync(`DATABASE_URL="${TEST_DB_URL}" npx prisma db push --skip-generate`, {
    cwd: path.resolve(__dirname, '../../../'),
    stdio: 'pipe',
  })

  db = new PrismaClient({ datasources: { db: { url: TEST_DB_URL } } })

  // Clean slate for idempotent re-runs (Postgres unique constraints will fail without this)
  await db.employee.deleteMany({})
  await db.department.deleteMany({})
  await db.company.deleteMany({})

  // Seed minimal data
  const company = await db.company.create({
    data: { name: 'Test Corp', domain: 'test.corp', settings: '{}' },
  })
  companyId = company.id

  const otherCompany = await db.company.create({
    data: { name: 'Other Corp', domain: 'other.corp', settings: '{}' },
  })
  otherCompanyId = otherCompany.id

  const dept = await db.department.create({
    data: { companyId, name: 'Engineering' },
  })

  const emp = await db.employee.create({
    data: {
      companyId,
      email: 'alice@test.corp',
      firstName: 'Alice',
      lastName: 'Smith',
      displayName: 'Alice Smith',
      status: 'ACTIVE',
      employmentType: 'FULL_TIME',
      startDate: new Date('2022-01-10'),
      departmentId: dept.id,
    },
  })
  employeeId = emp.id

  // Second employee in same company for search/filter tests
  await db.employee.create({
    data: {
      companyId,
      email: 'bob@test.corp',
      firstName: 'Bob',
      lastName: 'Jones',
      displayName: 'Bob Jones',
      status: 'ACTIVE',
      employmentType: 'FULL_TIME',
      startDate: new Date('2023-06-01'),
    },
  })

  // Employee in a different company (must never appear in queries)
  await db.employee.create({
    data: {
      companyId: otherCompanyId,
      email: 'eve@other.corp',
      firstName: 'Eve',
      lastName: 'Other',
      displayName: 'Eve Other',
      status: 'ACTIVE',
      employmentType: 'FULL_TIME',
      startDate: new Date('2021-05-01'),
    },
  })
}, 60000)

afterAll(async () => {
  await db.$disconnect()
})

describe('employeeRouter.list', () => {
  it('returns only employees from the caller company', async () => {
    const caller = makeCaller()
    const result = await caller.list({ limit: 50 })
    expect(result.employees).toHaveLength(2)
    expect(result.employees.every(e => e.companyId === companyId)).toBe(true)
  })

  it('returns correct fields including manager relation', async () => {
    const caller = makeCaller()
    const result = await caller.list({ limit: 10 })
    const alice = result.employees.find(e => e.email === 'alice@test.corp')
    expect(alice).toBeDefined()
    expect(alice!.firstName).toBe('Alice')
    expect(alice!.lastName).toBe('Smith')
    // manager relation should be present (null in this case since no manager set)
    expect('manager' in alice!).toBe(true)
  })

  it('filters by search string (partial first name match)', async () => {
    const caller = makeCaller()
    const result = await caller.list({ limit: 10, search: 'ali' })
    expect(result.employees).toHaveLength(1)
    expect(result.employees[0].firstName).toBe('Alice')
  })

  it('search is case-insensitive (mode: insensitive on Postgres)', async () => {
    const caller = makeCaller()
    const result = await caller.list({ limit: 10, search: 'ALI' })
    expect(result.employees).toHaveLength(1)
  })

  it('search by email works', async () => {
    const caller = makeCaller()
    const result = await caller.list({ limit: 10, search: 'bob@test' })
    expect(result.employees).toHaveLength(1)
    expect(result.employees[0].firstName).toBe('Bob')
  })

  it('returns empty results for search with no match', async () => {
    const caller = makeCaller()
    const result = await caller.list({ limit: 10, search: 'zzznomatch' })
    expect(result.employees).toHaveLength(0)
    expect(result.nextCursor).toBeUndefined()
  })

  it('paginates correctly with limit', async () => {
    const caller = makeCaller()
    const page1 = await caller.list({ limit: 1 })
    expect(page1.employees).toHaveLength(1)
    expect(page1.nextCursor).toBeDefined()

    const page2 = await caller.list({ limit: 1, cursor: page1.nextCursor })
    expect(page2.employees).toHaveLength(1)
    expect(page2.employees[0].id).not.toBe(page1.employees[0].id)
  })

  it('returns all when limit is large enough', async () => {
    const caller = makeCaller()
    const result = await caller.list({ limit: 100 })
    expect(result.employees).toHaveLength(2)
    expect(result.nextCursor).toBeUndefined()
  })
})

describe('employeeRouter.getById', () => {
  it('returns the employee with relations when found', async () => {
    const caller = makeCaller()
    const emp = await caller.getById({ id: employeeId })
    expect(emp.id).toBe(employeeId)
    expect(emp.firstName).toBe('Alice')
    expect(emp.companyId).toBe(companyId)
    // includes directReports relation
    expect(Array.isArray(emp.directReports)).toBe(true)
  })

  it('throws NOT_FOUND for non-existent employee', async () => {
    const caller = makeCaller()
    await expect(caller.getById({ id: 'nonexistent-id' })).rejects.toThrow('Employee not found')
  })

  it('throws FORBIDDEN when employee belongs to different company', async () => {
    // Find the other company's employee
    const otherEmp = await db.employee.findFirst({ where: { companyId: otherCompanyId } })
    expect(otherEmp).not.toBeNull()
    const caller = makeCaller() // caller is from companyId, not otherCompanyId
    await expect(caller.getById({ id: otherEmp!.id })).rejects.toThrow('You do not have access to this employee')
  })
})

describe('employeeRouter.getOrgChartData', () => {
  it('should fetch org chart data for the company', async () => {
    const caller = makeCaller();
    const result = await (caller as any).getOrgChartData();
    expect(result).toBeDefined();
  });
})
