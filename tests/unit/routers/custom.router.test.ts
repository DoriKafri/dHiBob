import { describe, it, expect, vi, beforeEach } from 'vitest';
import { customRouter } from '../../../src/server/routers/custom';
import { TRPCError } from '@trpc/server';

describe('customRouter', () => {
  const mockCtx = {
    db: {
      customTableDefinition: {
        findMany: vi.fn(),
        findUnique: vi.fn(),
      },
      customTableRow: {
        findMany: vi.fn(),
        upsert: vi.fn(),
      },
    },
    user: { id: 'u1', companyId: 'c1', role: 'ADMIN', employeeId: 'admin-emp-id' },
    session: { user: { id: 'u1', companyId: 'c1', role: 'ADMIN', employeeId: 'admin-emp-id' } }
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockCtx.db.customTableDefinition.findMany.mockReset();
    mockCtx.db.customTableDefinition.findUnique.mockReset();
    mockCtx.db.customTableRow.findMany.mockReset();
    mockCtx.db.customTableRow.upsert.mockReset();
  });

  it('getDefinitions should return tables for the user\'s company', async () => {
    const mockTables = [{ id: 't1', companyId: 'c1', name: 'Table 1', columns: '[]', permissions: '{}' }];
    (mockCtx.db.customTableDefinition.findMany as any).mockResolvedValue(mockTables);

    const caller = customRouter.createCaller(mockCtx as any);
    const result = await caller.getDefinitions();
    expect(result).toEqual(mockTables);
    expect(mockCtx.db.customTableDefinition.findMany).toHaveBeenCalledWith({
      where: { companyId: 'c1' },
    });
  });

  it('getRows should return rows for an employee and specific table', async () => {
    const mockRows = [{ id: 'r1', employeeId: 'e1', tableDefinitionId: 't1', data: '{"field1": "value1"}' }];
    const mockDefinition = { id: 't1', companyId: 'c1', permissions: '{"employeeView": true}' };
    (mockCtx.db.customTableDefinition.findUnique as any).mockResolvedValue(mockDefinition);
    (mockCtx.db.customTableRow.findMany as any).mockResolvedValue(mockRows);

    const caller = customRouter.createCaller(mockCtx as any);
    const result = await caller.getRows({ employeeId: 'e1', tableId: 't1' });
    expect(result).toEqual(mockRows);
  });

  it('getRows should throw FORBIDDEN if employee lacks permission', async () => {
    const mockDefinition = { id: 't1', companyId: 'c1', permissions: '{"employeeView": false}' };
    (mockCtx.db.customTableDefinition.findUnique as any).mockResolvedValue(mockDefinition);
    
    // Requester is the employee
    const user = { id: 'u2', companyId: 'c1', role: 'EMPLOYEE', employeeId: 'e1' };
    const employeeCtx = {
      ...mockCtx,
      user,
      session: { user },
    };

    const caller = customRouter.createCaller(employeeCtx as any);
    await expect(caller.getRows({ employeeId: 'e1', tableId: 't1' })).rejects.toThrow(TRPCError);
    // @ts-ignore
    await expect(caller.getRows({ employeeId: 'e1', tableId: 't1' })).rejects.toHaveProperty('code', 'FORBIDDEN');
  });

  it('upsertRow should correctly save JSON data', async () => {
    const mockDefinition = {
        id: 't1',
        companyId: 'c1',
        columns: '[{"name": "field1", "type": "STRING"}]',
        permissions: '{"employeeView": true}'
    };
    const mockUpsertedRow = { id: 'r1', employeeId: 'e1', tableDefinitionId: 't1', data: '{"field1": "value1"}' };
    (mockCtx.db.customTableDefinition.findUnique as any).mockResolvedValue(mockDefinition);
    (mockCtx.db.customTableRow.upsert as any).mockResolvedValue(mockUpsertedRow);

    const caller = customRouter.createCaller(mockCtx as any);
    const result = await caller.upsertRow({
      id: 'r1',
      employeeId: 'e1',
      tableId: 't1',
      data: { field1: 'value1' }
    });
    expect(result).toEqual(mockUpsertedRow);
    expect(mockCtx.db.customTableRow.upsert).toHaveBeenCalled();
  });
});
