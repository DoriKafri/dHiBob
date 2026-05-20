import { describe, it, expect, vi, beforeEach } from 'vitest';

// We test the SSEConnectionManager class directly
// Need to get a fresh instance for each test
describe('SSEConnectionManager', () => {
  let SSEConnectionManager: any;

  beforeEach(async () => {
    // Import the module fresh for each test to get the class
    vi.resetModules();
  });

  function makeController() {
    const enqueue = vi.fn();
    const close = vi.fn();
    return { enqueue, close } as unknown as ReadableStreamDefaultController;
  }

  it('register + push delivers data to registered controller', async () => {
    const mod = await import('@/lib/sse-manager');
    const manager = mod.sseManager;
    const ctrl = makeController();

    manager.register('emp-1', ctrl);
    manager.push('emp-1', { type: 'notification', data: { id: '123' } });

    expect(ctrl.enqueue).toHaveBeenCalledTimes(1);
    const encoded = (ctrl.enqueue as any).mock.calls[0][0];
    const decoded = new TextDecoder().decode(encoded);
    expect(decoded).toContain('"type":"notification"');
    expect(decoded).toContain('"id":"123"');

    manager.unregister('emp-1', ctrl);
  });

  it('push to unknown employee does nothing', async () => {
    const mod = await import('@/lib/sse-manager');
    const manager = mod.sseManager;

    // Should not throw
    manager.push('unknown-emp', { type: 'notification' });
  });

  it('unregister removes the controller', async () => {
    const mod = await import('@/lib/sse-manager');
    const manager = mod.sseManager;
    const ctrl = makeController();

    manager.register('emp-2', ctrl);
    expect(manager.connectionCount('emp-2')).toBe(1);

    manager.unregister('emp-2', ctrl);
    expect(manager.connectionCount('emp-2')).toBe(0);

    // Push after unregister should not deliver
    manager.push('emp-2', { type: 'test' });
    expect(ctrl.enqueue).not.toHaveBeenCalled();
  });

  it('supports multiple controllers per employee (multiple tabs)', async () => {
    const mod = await import('@/lib/sse-manager');
    const manager = mod.sseManager;
    const ctrl1 = makeController();
    const ctrl2 = makeController();

    manager.register('emp-3', ctrl1);
    manager.register('emp-3', ctrl2);
    expect(manager.connectionCount('emp-3')).toBe(2);

    manager.push('emp-3', { type: 'test' });
    expect(ctrl1.enqueue).toHaveBeenCalledTimes(1);
    expect(ctrl2.enqueue).toHaveBeenCalledTimes(1);

    manager.unregister('emp-3', ctrl1);
    manager.unregister('emp-3', ctrl2);
  });

  it('evicts oldest connection when exceeding max per user', async () => {
    const mod = await import('@/lib/sse-manager');
    const manager = mod.sseManager;
    const ctrls = [makeController(), makeController(), makeController(), makeController()];

    // Register 3 (max)
    manager.register('emp-4', ctrls[0]);
    manager.register('emp-4', ctrls[1]);
    manager.register('emp-4', ctrls[2]);
    expect(manager.connectionCount('emp-4')).toBe(3);

    // 4th should evict the oldest (ctrls[0])
    manager.register('emp-4', ctrls[3]);
    expect(manager.connectionCount('emp-4')).toBe(3);
    expect(ctrls[0].close).toHaveBeenCalled();

    // Clean up
    manager.unregister('emp-4', ctrls[1]);
    manager.unregister('emp-4', ctrls[2]);
    manager.unregister('emp-4', ctrls[3]);
  });

  it('handles controller.enqueue throwing (stale connection)', async () => {
    const mod = await import('@/lib/sse-manager');
    const manager = mod.sseManager;
    const ctrl = makeController();
    (ctrl.enqueue as any).mockImplementation(() => { throw new Error('closed'); });

    manager.register('emp-5', ctrl);
    // Should not throw — error is caught and connection cleaned up
    manager.push('emp-5', { type: 'test' });

    manager.unregister('emp-5', ctrl);
  });
});
