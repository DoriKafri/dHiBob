import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock storage
vi.mock('@/lib/storage', () => ({
  storage: {
    uploadFile: vi.fn().mockResolvedValue('signatures/test-sig.png'),
    readFile: vi.fn().mockResolvedValue(Buffer.from('fake-pdf-bytes')),
    getDownloadUrl: vi.fn().mockResolvedValue('/api/files/download?path=contracts/signed.pdf'),
    deleteFile: vi.fn().mockResolvedValue(undefined),
  },
}));

// Mock signature stamper
vi.mock('@/lib/signature-stamper', () => ({
  stampSignature: vi.fn().mockResolvedValue(new Uint8Array([0x25, 0x50, 0x44, 0x46])),
}));

// Mock notify service
vi.mock('@/lib/notify-service', () => ({
  notifyService: { send: vi.fn().mockResolvedValue(undefined) },
}));

// Mock fs
vi.mock('fs/promises', () => ({
  default: { readFile: vi.fn().mockResolvedValue(Buffer.from('fake-pdf-bytes')) },
}));

// Prisma mock factories
function makeDocument(overrides = {}) {
  return {
    id: 'doc-1',
    name: 'Contract.pdf',
    type: 'CONTRACT',
    companyId: 'company-1',
    employeeId: 'emp-signer',
    filePath: 'contracts/test.pdf',
    fileSize: 1024,
    mimeType: 'application/pdf',
    folder: 'contracts',
    signatureStatus: null,
    uploadedBy: 'emp-requester',
    expiresAt: null,
    createdAt: new Date(),
    ...overrides,
  };
}

function makeEmployee(overrides = {}) {
  return {
    id: 'emp-signer',
    companyId: 'company-1',
    email: 'signer@acme.tech',
    firstName: 'Jane',
    lastName: 'Doe',
    status: 'ACTIVE',
    ...overrides,
  };
}

function makeSignatureRecord(overrides = {}) {
  return {
    id: 'sig-1',
    documentId: 'doc-1',
    signerId: 'emp-signer',
    signerName: 'Jane Doe',
    signerEmail: 'signer@acme.tech',
    status: 'PENDING',
    signatureImage: null,
    signedPdfPath: null,
    requestedAt: new Date(),
    signedAt: null,
    declinedAt: null,
    declineReason: null,
    requestedBy: 'emp-requester',
    companyId: 'company-1',
    document: makeDocument(),
    ...overrides,
  };
}

// Build a mock Prisma-like db
function makeDb() {
  return {
    user: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    document: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    employee: {
      findFirst: vi.fn(),
    },
    signatureRecord: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    },
  };
}

function makeCtx(overrides: Partial<{ user: any; db: any }> = {}) {
  return {
    session: {
      user: {
        id: 'user-1',
        email: 'requester@acme.tech',
        role: 'ADMIN',
        companyId: 'company-1',
        employeeId: 'emp-requester',
        ...(overrides.user || {}),
      },
    },
    db: overrides.db || makeDb(),
    user: {
      id: 'user-1',
      email: 'requester@acme.tech',
      role: 'ADMIN',
      companyId: 'company-1',
      employeeId: 'emp-requester',
      ...(overrides.user || {}),
    },
  };
}

// Import the router after mocks
const { signatureRouter } = await import('@/server/routers/signature');
const { router: createRouter } = await import('@/server/trpc');

const caller = (ctx: any) => createRouter({ signature: signatureRouter }).createCaller(ctx as any);

describe('signatureRouter', () => {
  describe('requestSignature', () => {
    it('S-1: creates a PENDING signature record and updates document status', async () => {
      const db = makeDb();
      const doc = makeDocument();
      const signer = makeEmployee();
      db.document.findFirst.mockResolvedValue(doc);
      db.employee.findFirst.mockResolvedValue(signer);
      db.signatureRecord.create.mockResolvedValue(makeSignatureRecord());
      db.document.update.mockResolvedValue({ ...doc, signatureStatus: 'PENDING_SIGNATURE' });

      const ctx = makeCtx({ db });
      const result = await caller(ctx).signature.requestSignature({
        documentId: 'doc-1',
        signerId: 'emp-signer',
      });

      expect(result.status).toBe('PENDING');
      expect(db.signatureRecord.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            documentId: 'doc-1',
            signerId: 'emp-signer',
            status: 'PENDING',
            companyId: 'company-1',
          }),
        }),
      );
      expect(db.document.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { signatureStatus: 'PENDING_SIGNATURE' },
        }),
      );
    });

    it('S-2: throws NOT_FOUND when document does not exist', async () => {
      const db = makeDb();
      db.document.findFirst.mockResolvedValue(null);
      const ctx = makeCtx({ db });

      await expect(
        caller(ctx).signature.requestSignature({ documentId: 'bad', signerId: 'emp-signer' }),
      ).rejects.toThrow('Document not found');
    });

    it('S-3: throws NOT_FOUND when signer employee does not exist', async () => {
      const db = makeDb();
      db.document.findFirst.mockResolvedValue(makeDocument());
      db.employee.findFirst.mockResolvedValue(null);
      const ctx = makeCtx({ db });

      await expect(
        caller(ctx).signature.requestSignature({ documentId: 'doc-1', signerId: 'bad' }),
      ).rejects.toThrow('Signer employee not found');
    });
  });

  describe('sign', () => {
    it('S-4: marks record as SIGNED and updates document status', async () => {
      const db = makeDb();
      const record = makeSignatureRecord();
      db.signatureRecord.findFirst.mockResolvedValue(record);
      db.signatureRecord.update.mockResolvedValue({ ...record, status: 'SIGNED' });
      db.document.update.mockResolvedValue({ ...record.document, signatureStatus: 'SIGNED' });

      const ctx = makeCtx({ db, user: { employeeId: 'emp-signer' } });
      const result = await caller(ctx).signature.sign({
        signatureRecordId: 'sig-1',
        signatureImageBase64: 'data:image/png;base64,iVBORw0KGgo=',
      });

      expect(db.signatureRecord.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'SIGNED' }),
        }),
      );
      expect(db.document.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { signatureStatus: 'SIGNED' },
        }),
      );
    });

    it('S-5: throws NOT_FOUND when signature record does not exist', async () => {
      const db = makeDb();
      db.signatureRecord.findFirst.mockResolvedValue(null);
      const ctx = makeCtx({ db, user: { employeeId: 'emp-signer' } });

      await expect(
        caller(ctx).signature.sign({
          signatureRecordId: 'bad',
          signatureImageBase64: 'data:image/png;base64,iVBORw0KGgo=',
        }),
      ).rejects.toThrow('Signature request not found');
    });
  });

  describe('decline', () => {
    it('S-6: marks record as DECLINED with reason', async () => {
      const db = makeDb();
      const record = makeSignatureRecord();
      db.signatureRecord.findFirst.mockResolvedValue(record);
      db.signatureRecord.update.mockResolvedValue({ ...record, status: 'DECLINED', declineReason: 'Wrong doc' });
      db.document.update.mockResolvedValue({ ...record.document, signatureStatus: 'DECLINED' });

      const ctx = makeCtx({ db, user: { employeeId: 'emp-signer' } });
      await caller(ctx).signature.decline({
        signatureRecordId: 'sig-1',
        reason: 'Wrong doc',
      });

      expect(db.signatureRecord.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'DECLINED',
            declineReason: 'Wrong doc',
          }),
        }),
      );
    });

    it('S-7: throws NOT_FOUND for non-pending or wrong-user record', async () => {
      const db = makeDb();
      db.signatureRecord.findFirst.mockResolvedValue(null);
      const ctx = makeCtx({ db, user: { employeeId: 'wrong-emp' } });

      await expect(
        caller(ctx).signature.decline({ signatureRecordId: 'sig-1' }),
      ).rejects.toThrow('Signature request not found');
    });
  });

  describe('getPending', () => {
    it('S-8: returns pending records for current user', async () => {
      const db = makeDb();
      const records = [makeSignatureRecord()];
      db.signatureRecord.findMany.mockResolvedValue(records);

      const ctx = makeCtx({ db, user: { employeeId: 'emp-signer' } });
      const result = await caller(ctx).signature.getPending();

      expect(result).toHaveLength(1);
      expect(db.signatureRecord.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            signerId: 'emp-signer',
            status: 'PENDING',
          }),
        }),
      );
    });
  });

  describe('getByDocument', () => {
    it('S-9: returns all records for a document scoped by company', async () => {
      const db = makeDb();
      db.signatureRecord.findMany.mockResolvedValue([
        makeSignatureRecord(),
        makeSignatureRecord({ id: 'sig-2', status: 'SIGNED' }),
      ]);

      const ctx = makeCtx({ db });
      const result = await caller(ctx).signature.getByDocument({ documentId: 'doc-1' });

      expect(result).toHaveLength(2);
      expect(db.signatureRecord.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { documentId: 'doc-1', companyId: 'company-1' },
        }),
      );
    });
  });

  describe('requestSignature with placements', () => {
    it('S-12: stores placements JSON when provided', async () => {
      const db = makeDb();
      const doc = makeDocument();
      const signer = makeEmployee();
      db.document.findFirst.mockResolvedValue(doc);
      db.employee.findFirst.mockResolvedValue(signer);
      db.signatureRecord.create.mockResolvedValue(
        makeSignatureRecord({ placements: '[{"pageIndex":0,"x":100,"y":200,"width":150,"height":50}]' }),
      );
      db.document.update.mockResolvedValue({ ...doc, signatureStatus: 'PENDING_SIGNATURE' });

      const ctx = makeCtx({ db });
      const result = await caller(ctx).signature.requestSignature({
        documentId: 'doc-1',
        signerId: 'emp-signer',
        placements: JSON.stringify([{ pageIndex: 0, x: 100, y: 200, width: 150, height: 50 }]),
      });

      expect(db.signatureRecord.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            placements: expect.stringContaining('"pageIndex":0'),
          }),
        }),
      );
    });

    it('S-13: works without placements (backward compat)', async () => {
      const db = makeDb();
      const doc = makeDocument();
      const signer = makeEmployee();
      db.document.findFirst.mockResolvedValue(doc);
      db.employee.findFirst.mockResolvedValue(signer);
      db.signatureRecord.create.mockResolvedValue(makeSignatureRecord());
      db.document.update.mockResolvedValue({ ...doc, signatureStatus: 'PENDING_SIGNATURE' });

      const ctx = makeCtx({ db });
      await caller(ctx).signature.requestSignature({
        documentId: 'doc-1',
        signerId: 'emp-signer',
      });

      expect(db.signatureRecord.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            documentId: 'doc-1',
            signerId: 'emp-signer',
          }),
        }),
      );
    });

    it('S-14: rejects invalid placements JSON', async () => {
      const db = makeDb();
      db.document.findFirst.mockResolvedValue(makeDocument());
      db.employee.findFirst.mockResolvedValue(makeEmployee());
      const ctx = makeCtx({ db });

      await expect(
        caller(ctx).signature.requestSignature({
          documentId: 'doc-1',
          signerId: 'emp-signer',
          placements: 'not-valid-json',
        }),
      ).rejects.toThrow();
    });
  });

  describe('sign with placements', () => {
    it('S-15: passes placements to stampSignature when record has them', async () => {
      const { stampSignature: mockStamp } = await import('@/lib/signature-stamper');
      const db = makeDb();
      const placements = JSON.stringify([
        { pageIndex: 0, x: 100, y: 200, width: 150, height: 50 },
      ]);
      const record = makeSignatureRecord({ placements });
      db.signatureRecord.findFirst.mockResolvedValue(record);
      db.signatureRecord.update.mockResolvedValue({ ...record, status: 'SIGNED' });
      db.document.update.mockResolvedValue({ ...record.document, signatureStatus: 'SIGNED' });

      const ctx = makeCtx({ db, user: { employeeId: 'emp-signer' } });
      await caller(ctx).signature.sign({
        signatureRecordId: 'sig-1',
        signatureImageBase64: 'data:image/png;base64,iVBORw0KGgo=',
      });

      expect(mockStamp).toHaveBeenCalledWith(
        expect.any(Uint8Array),
        expect.any(Uint8Array),
        expect.objectContaining({
          placements: [{ pageIndex: 0, x: 100, y: 200, width: 150, height: 50 }],
        }),
      );
    });

    it('S-16: uses default stamping when record has no placements', async () => {
      const { stampSignature: mockStamp } = await import('@/lib/signature-stamper');
      (mockStamp as any).mockClear();
      const db = makeDb();
      const record = makeSignatureRecord({ placements: null });
      db.signatureRecord.findFirst.mockResolvedValue(record);
      db.signatureRecord.update.mockResolvedValue({ ...record, status: 'SIGNED' });
      db.document.update.mockResolvedValue({ ...record.document, signatureStatus: 'SIGNED' });

      const ctx = makeCtx({ db, user: { employeeId: 'emp-signer' } });
      await caller(ctx).signature.sign({
        signatureRecordId: 'sig-1',
        signatureImageBase64: 'data:image/png;base64,iVBORw0KGgo=',
      });

      // Should NOT pass placements — let stampSignature use defaults
      const callArgs = (mockStamp as any).mock.calls[(mockStamp as any).mock.calls.length - 1];
      expect(callArgs[2]).not.toHaveProperty('placements');
    });
  });

  describe('getPdfUrl', () => {
    it('S-17: returns download URL for a signature record document', async () => {
      const db = makeDb();
      db.signatureRecord.findFirst.mockResolvedValue(
        makeSignatureRecord({ document: makeDocument({ filePath: 'contracts/test.pdf' }) }),
      );

      const ctx = makeCtx({ db });
      const result = await caller(ctx).signature.getPdfUrl({ signatureRecordId: 'sig-1' });
      expect(result.url).toBeDefined();
      expect(typeof result.url).toBe('string');
    });
  });

  describe('getSignedPdf', () => {
    it('S-10: returns download URL for signed PDF', async () => {
      const db = makeDb();
      db.signatureRecord.findFirst.mockResolvedValue(
        makeSignatureRecord({ status: 'SIGNED', signedPdfPath: 'contracts/signed.pdf' }),
      );

      const ctx = makeCtx({ db });
      const result = await caller(ctx).signature.getSignedPdf({ signatureRecordId: 'sig-1' });

      expect(result.url).toContain('download');
    });

    it('S-11: throws NOT_FOUND when no signed PDF exists', async () => {
      const db = makeDb();
      db.signatureRecord.findFirst.mockResolvedValue(null);

      const ctx = makeCtx({ db });
      await expect(
        caller(ctx).signature.getSignedPdf({ signatureRecordId: 'bad' }),
      ).rejects.toThrow('Signed PDF not found');
    });
  });
});
