/**
 * In-memory SSE connection manager.
 * Maintains a map of employeeId -> active stream controllers.
 * When a notification arrives, push() writes to all active connections for that employee.
 *
 * Scaling note: For multi-instance deployments, replace the in-memory map
 * with Redis Pub/Sub. The interface is designed for that swap.
 */

const MAX_CONNECTIONS_PER_USER = 3;

class SSEConnectionManager {
  private connections = new Map<string, Set<ReadableStreamDefaultController>>();

  register(employeeId: string, controller: ReadableStreamDefaultController): void {
    if (!this.connections.has(employeeId)) {
      this.connections.set(employeeId, new Set());
    }
    const set = this.connections.get(employeeId)!;

    // Evict oldest if over limit
    if (set.size >= MAX_CONNECTIONS_PER_USER) {
      const oldest = set.values().next().value;
      if (oldest) {
        try { oldest.close(); } catch {}
        set.delete(oldest);
      }
    }

    set.add(controller);
  }

  unregister(employeeId: string, controller: ReadableStreamDefaultController): void {
    const set = this.connections.get(employeeId);
    if (!set) return;
    set.delete(controller);
    if (set.size === 0) this.connections.delete(employeeId);
  }

  push(employeeId: string, data: object): void {
    const set = this.connections.get(employeeId);
    if (!set || set.size === 0) return;
    const payload = `data: ${JSON.stringify(data)}\n\n`;
    const encoder = new TextEncoder();
    const encoded = encoder.encode(payload);
    // Note: Set.delete() during for-of iteration is safe per the ES2015 spec
    // (https://tc39.es/ecma262/#sec-set.prototype.forEach) — deleted entries
    // are not revisited and the iterator continues correctly.
    for (const controller of set) {
      try {
        controller.enqueue(encoded);
      } catch {
        // Connection might be closed; clean up
        set.delete(controller);
      }
    }
  }

  /** Get the number of active connections for an employee (for testing/monitoring). */
  connectionCount(employeeId: string): number {
    return this.connections.get(employeeId)?.size ?? 0;
  }
}

// Singleton — survives hot reloads in development
const globalForSSE = globalThis as unknown as { sseManager?: SSEConnectionManager };
export const sseManager = globalForSSE.sseManager ?? new SSEConnectionManager();
if (process.env.NODE_ENV !== 'production') globalForSSE.sseManager = sseManager;
