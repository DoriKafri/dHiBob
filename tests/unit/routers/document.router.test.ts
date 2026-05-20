import { describe, it, expect, vi } from 'vitest';
import { appRouter } from '../../../src/server/routers/_app';
import { prisma } from '../../../src/lib/db';

vi.mock('../../../src/lib/notify-service', () => ({
  notifyService: { send: vi.fn().mockResolvedValue(undefined) },
}));

vi.mock('../../../src/lib/db', () => ({
  prisma: {
    document: {
      findMany: vi.fn(),
      update: vi.fn(),
    },
  },
}));

describe('Document Router', () => {
  it('should list documents for the current company', async () => {
    const caller = appRouter.createCaller({ 
      session: { user: { companyId: 'company-1', role: 'ADMIN', employeeId: 'admin-1' } },
      db: prisma
    } as any);

    const mockDocs = [{ id: 'doc-1', name: 'Document 1' }];
    (prisma.document.findMany as any).mockResolvedValue(mockDocs);

    const result = await caller.document.list({});

    expect(result).toEqual(mockDocs);
    expect(prisma.document.findMany).toHaveBeenCalledWith({
      where: { companyId: 'company-1' },
      orderBy: { createdAt: 'desc' },
    });
  });

  it('should filter documents by employeeId and folder', async () => {
    const caller = appRouter.createCaller({ 
      session: { user: { companyId: 'company-1', role: 'ADMIN', employeeId: 'admin-1' } },
      db: prisma
    } as any);

    (prisma.document.findMany as any).mockResolvedValue([]);

    await caller.document.list({ employeeId: 'emp-1', folder: 'HR' });

    expect(prisma.document.findMany).toHaveBeenCalledWith({
      where: { 
        companyId: 'company-1',
        employeeId: 'emp-1',
        folder: 'HR'
      },
      orderBy: { createdAt: 'desc' },
    });
  });

  it('should sign a document', async () => {
    const caller = appRouter.createCaller({ 
      session: { user: { companyId: 'company-1', role: 'ADMIN', employeeId: 'admin-1' } },
      db: prisma
    } as any);

    const mockDoc = { id: 'doc-1', signatureStatus: 'SIGNED' };
    (prisma.document.update as any).mockResolvedValue(mockDoc);

    const result = await caller.document.sign({ id: 'doc-1' });

    expect(result).toEqual(mockDoc);
    expect(prisma.document.update).toHaveBeenCalledWith({
      where: { id: 'doc-1', companyId: 'company-1' },
      data: { signatureStatus: 'SIGNED' },
    });
  });
});
