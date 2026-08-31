import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DeliveryFallbackService } from '../delivery-fallback.service.js';

describe('DeliveryFallbackService failure branch (#820)', () => {
  let service: DeliveryFallbackService;

  beforeEach(() => {
    service = new DeliveryFallbackService();
  });

  it('logs and dead-letters a delivery that fails on every channel', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const failingDelivery = async () => false;

    const log = await service.deliverWithFallback(
      'notif-1',
      'email',
      failingDelivery,
      { maxRetries: 1 },
    );

    expect(log.finalStatus).toBe('failed_all');
    expect(log.attempts.length).toBeGreaterThan(0);
    expect(log.attempts.every((a) => a.status === 'failed')).toBe(true);

    // Every failed attempt is logged with channel + error context (#820).
    const failureLogs = errorSpy.mock.calls.filter(([msg]) =>
      String(msg).includes('fallback delivery attempt failed'),
    );
    expect(failureLogs.length).toBe(log.attempts.length);
    const firstContext = failureLogs[0][1] as Record<string, unknown>;
    expect(firstContext.notificationId).toBe('notif-1');

    // The dead-letter signal is logged too (#820).
    expect(
      errorSpy.mock.calls.some(([msg]) =>
        String(msg).includes('delivery failed on all channels'),
      ),
    ).toBe(true);

    errorSpy.mockRestore();
  });

  it('does not dead-letter when a fallback channel succeeds', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    let calls = 0;
    const flakyDelivery = async () => {
      calls += 1;
      return calls > 1; // fail the primary channel, succeed on fallback
    };

    const log = await service.deliverWithFallback(
      'notif-2',
      'email',
      flakyDelivery,
      { maxRetries: 1 },
    );

    expect(log.finalStatus).toBe('delivered');
    expect(
      errorSpy.mock.calls.some(([msg]) =>
        String(msg).includes('delivery failed on all channels'),
      ),
    ).toBe(false);

    errorSpy.mockRestore();
  });

  it('tracks failure-rate metrics across deliveries (#820)', async () => {
    const ok = async () => true;
    const fail = async () => false;

    await service.deliverWithFallback('notif-3', 'email', fail, { maxRetries: 1 });
    await service.deliverWithFallback('notif-3', 'email', fail, { maxRetries: 1 });
    await service.deliverWithFallback('notif-4', 'push', ok, { maxRetries: 1 });

    const stats = service.getFailureStats();
    expect(stats.totalAttempted).toBeGreaterThan(0);
    expect(stats.totalFailed).toBeGreaterThan(0);
    expect(stats.failureRate).toBeGreaterThan(0);
    expect(stats.failureRate).toBeLessThanOrEqual(1);
    expect(stats.byChannel.email).toBeGreaterThan(0);
  });
});
