import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock next-auth/jwt
const mockGetToken = vi.fn();
vi.mock('next-auth/jwt', () => ({
  getToken: (...args: any[]) => mockGetToken(...args),
}));

// Mock SSE manager
const mockRegister = vi.fn();
const mockUnregister = vi.fn();
vi.mock('@/lib/sse-manager', () => ({
  sseManager: {
    register: (...args: any[]) => mockRegister(...args),
    unregister: (...args: any[]) => mockUnregister(...args),
  },
}));

describe('SSE route — authentication', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when no valid JWT token is present', async () => {
    mockGetToken.mockResolvedValue(null);

    const { GET } = await import('@/app/api/notifications/sse/route');
    const request = new Request('http://localhost:3000/api/notifications/sse', {
      headers: { Authorization: '' },
    });
    // Add signal to prevent hanging
    const controller = new AbortController();
    Object.defineProperty(request, 'signal', { value: controller.signal });

    const response = await GET(request as any);

    expect(response.status).toBe(401);
    expect(mockRegister).not.toHaveBeenCalled();
  });

  it('returns 401 when token has no employeeId', async () => {
    mockGetToken.mockResolvedValue({ sub: 'user-1' }); // no employeeId

    const { GET } = await import('@/app/api/notifications/sse/route');
    const request = new Request('http://localhost:3000/api/notifications/sse', {
      headers: { Authorization: 'Bearer some-token' },
    });
    const controller = new AbortController();
    Object.defineProperty(request, 'signal', { value: controller.signal });

    const response = await GET(request as any);

    expect(response.status).toBe(401);
    expect(mockRegister).not.toHaveBeenCalled();
  });

  it('returns SSE stream when authenticated', async () => {
    mockGetToken.mockResolvedValue({ employeeId: 'emp-1' });

    const { GET } = await import('@/app/api/notifications/sse/route');
    const abortController = new AbortController();
    const request = new Request('http://localhost:3000/api/notifications/sse', {
      headers: { Authorization: 'Bearer valid-token' },
    });
    Object.defineProperty(request, 'signal', {
      value: abortController.signal,
    });

    const response = await GET(request as any);

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('text/event-stream');

    // Clean up the stream
    abortController.abort();
  });
});
