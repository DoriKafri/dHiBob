import { describe, it, expect, vi } from 'vitest';
import { homeRouter } from '../../../src/server/routers/home';

describe('homeRouter', () => {
  it('getFeed should return merged and sorted feed items', async () => {
    const mockCtx = {
      db: {
        employee: {
          findMany: vi.fn().mockResolvedValue([
            {
              id: 'emp-1',
              firstName: 'New',
              lastName: 'Joiner',
              startDate: new Date(),
              personalInfo: JSON.stringify({ birthday: '1990-04-10' }),
              department: { name: 'Engineering' }
            }
          ]),
        },
        post: {
          findMany: vi.fn().mockResolvedValue([
            {
              id: 'post-1',
              type: 'SHOUTOUT',
              content: 'Great job!',
              createdAt: new Date(),
              author: { id: 'admin-1', firstName: 'Admin', lastName: 'User', avatar: null },
              target: { id: 'emp-1', firstName: 'New', lastName: 'Joiner', avatar: null }
            }
          ]),
        },
        hrPortalItem: {
          findMany: vi.fn().mockResolvedValue([]),
        }
      },
      session: {
        user: {
          id: 'user-1',
          companyId: 'company-1'
        }
      },
      user: {
        id: 'user-1',
        companyId: 'company-1'
      }
    };

    const caller = homeRouter.createCaller(mockCtx as any);
    const result = await caller.getFeed();

    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);
    expect(['NEW_JOINER', 'SHOUTOUT', 'ANNIVERSARY', 'BIRTHDAY']).toContain(result[0].type);
  });
});
