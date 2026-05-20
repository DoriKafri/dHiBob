import { describe, it, expect, vi } from 'vitest';

// Mock storage
vi.mock('@/lib/storage', () => ({
  storage: {
    uploadFile: vi.fn().mockResolvedValue('signatures/test-sig.png'),
    getDownloadUrl: vi.fn().mockResolvedValue('/api/files/download?path=contracts/signed.pdf'),
    deleteFile: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('@/lib/signature-stamper', () => ({
  stampSignature: vi.fn().mockResolvedValue(new Uint8Array([0x25, 0x50, 0x44, 0x46])),
}));

vi.mock('@/lib/notify-service', () => ({
  notifyService: { send: vi.fn().mockResolvedValue(undefined) },
}));

vi.mock('fs/promises', () => ({
  default: { readFile: vi.fn().mockResolvedValue(Buffer.from('fake-pdf-bytes')) },
}));

function makeDb() {
  return {
    user: { findMany: vi.fn().mockResolvedValue([]) },
    document: { findFirst: vi.fn(), update: vi.fn() },
    employee: { findFirst: vi.fn() },
    signatureRecord: { create: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(), update: vi.fn() },
  };
}

function makeCtx(overrides: Partial<{ user: any; db: any }> = {}) {
  return {
    session: {
      user: {
        id: 'user-1', email: 'r@acme.tech', role: 'ADMIN',
        companyId: 'company-1', employeeId: 'emp-signer',
        ...(overrides.user || {}),
      },
    },
    db: overrides.db || makeDb(),
    user: {
      id: 'user-1', email: 'r@acme.tech', role: 'ADMIN',
      companyId: 'company-1', employeeId: 'emp-signer',
      ...(overrides.user || {}),
    },
  };
}

const { signatureRouter } = await import('@/server/routers/signature');
const { router: createRouter } = await import('@/server/trpc');
const caller = (ctx: any) => createRouter({ signature: signatureRouter }).createCaller(ctx as any);

describe('R4: signatureImageBase64 max length validation', () => {
  it('rejects signatureImageBase64 over 500KB', async () => {
    const db = makeDb();
    db.signatureRecord.findFirst.mockResolvedValue({
      id: 'sig-1', documentId: 'doc-1', signerId: 'emp-signer',
      signerName: 'Jane', signerEmail: 'j@x.com', status: 'PENDING',
      requestedBy: 'emp-req', companyId: 'company-1',
      document: { id: 'doc-1', name: 'test.pdf', filePath: 'test.pdf' },
    });

    const ctx = makeCtx({ db });
    // Generate a string just over 500KB (approx 512,001 chars)
    const oversizedBase64 = 'data:image/png;base64,' + 'A'.repeat(500_001);

    await expect(
      caller(ctx).signature.sign({
        signatureRecordId: 'sig-1',
        signatureImageBase64: oversizedBase64,
      }),
    ).rejects.toThrow(); // Should be rejected by zod validation
  });

  it('accepts signatureImageBase64 under 500KB', async () => {
    const db = makeDb();
    db.signatureRecord.findFirst.mockResolvedValue({
      id: 'sig-1', documentId: 'doc-1', signerId: 'emp-signer',
      signerName: 'Jane', signerEmail: 'j@x.com', status: 'PENDING',
      requestedBy: 'emp-req', companyId: 'company-1',
      document: { id: 'doc-1', name: 'test.pdf', filePath: 'test.pdf' },
    });
    db.signatureRecord.update.mockResolvedValue({ id: 'sig-1', status: 'SIGNED' });
    db.document.update.mockResolvedValue({});

    const ctx = makeCtx({ db });
    const validBase64 = 'data:image/png;base64,' + 'A'.repeat(1000);

    const result = await caller(ctx).signature.sign({
      signatureRecordId: 'sig-1',
      signatureImageBase64: validBase64,
    });

    expect(result.status).toBe('SIGNED');
  });
});
