import {
  deliveryFallbackStrategySchema,
  fallbackAttemptSchema,
  deliveryFailureLogSchema,
  type DeliveryFallbackStrategy,
  type FallbackAttempt,
  type DeliveryFailureLog,
} from '@sidewalk/shared';
import { logger } from '../../../shared/logger/logger.js';

const DEFAULT_STRATEGY: DeliveryFallbackStrategy = {
  primaryChannel: 'inApp',
  fallbackOrder: ['email', 'push', 'inApp'],
  maxRetries: 3,
  backoffBaseMs: 1000,
};

/** Rolling window (ms) over which the failure-rate metric is computed. */
const METRIC_WINDOW_MS = 15 * 60 * 1000;

/** Aggregated failure counters used by the fallback-failure metric (#820). */
export interface FallbackFailureStats {
  /** Failures within the last METRIC_WINDOW_MS, keyed by channel. */
  byChannel: Record<string, number>;
  /** Total failed deliveries within the window. */
  totalFailed: number;
  /** Total deliveries attempted within the window. */
  totalAttempted: number;
  /** Fraction of attempts that failed, 0..1. */
  failureRate: number;
}

export class DeliveryFallbackService {
  private readonly logs: Map<string, DeliveryFailureLog> = new Map();
  private readonly attemptsWindow: { at: number; channel: string; failed: boolean }[] = [];

  public async deliverWithFallback(
    notificationId: string,
    primaryChannel: 'email' | 'push' | 'inApp',
    deliverFn: (channel: string) => Promise<boolean>,
    strategy?: Partial<DeliveryFallbackStrategy>,
  ): Promise<DeliveryFailureLog> {
    const resolvedStrategy = deliveryFallbackStrategySchema.parse({
      ...DEFAULT_STRATEGY,
      ...strategy,
      primaryChannel,
    });

    const attempts: FallbackAttempt[] = [];
    const channels = [primaryChannel, ...resolvedStrategy.fallbackOrder.filter((c) => c !== primaryChannel)];

    let finalStatus: 'delivered' | 'failed_all' = 'failed_all';

    for (const channel of channels) {
      for (let retry = 0; retry < resolvedStrategy.maxRetries; retry++) {
        const attempt: FallbackAttempt = {
          attemptId: `fa_${Date.now()}_${channel}_${retry}`,
          notificationId,
          channel,
          status: 'pending',
          attemptedAtIso: new Date().toISOString(),
        };

        try {
          const success = await deliverFn(channel);
          attempt.status = success ? 'success' : 'failed';
          if (!success) {
            attempt.error = `Channel ${channel} returned false`;
          }
        } catch (err) {
          attempt.status = 'failed';
          attempt.error = err instanceof Error ? err.message : String(err);
        }

        attempts.push(fallbackAttemptSchema.parse(attempt));

        // Every failed attempt is logged with enough context to debug the
        // delivery: notification, channel, attempt number and the error
        // (#820). Failures were previously only discoverable by reading the
        // in-memory logs after the fact.
        if (attempt.status === 'failed') {
          logger.error('[notifications] fallback delivery attempt failed', {
            notificationId,
            channel,
            attempt: retry + 1,
            maxRetries: resolvedStrategy.maxRetries,
            error: attempt.error,
          });
        }
        this.recordAttempt(channel, attempt.status === 'failed');

        if (attempt.status === 'success') {
          finalStatus = 'delivered';
          break;
        }

        if (retry < resolvedStrategy.maxRetries - 1) {
          const backoffMs = resolvedStrategy.backoffBaseMs * Math.pow(2, retry);
          await new Promise((resolve) => setTimeout(resolve, backoffMs));
        }
      }

      if (finalStatus === 'delivered') break;
    }

    const log: DeliveryFailureLog = {
      logId: `dfl_${Date.now()}_${notificationId}`,
      notificationId,
      strategy: resolvedStrategy,
      attempts,
      finalStatus,
      completedAtIso: new Date().toISOString(),
    };

    const validated = deliveryFailureLogSchema.parse(log);
    this.logs.set(validated.logId, validated);

    // Dead-letter signal (#820): a notification that exhausted every channel
    // and retry is logged loudly — it will not be retried again, so an
    // operator needs to see it.
    if (finalStatus === 'failed_all') {
      logger.error('[notifications] delivery failed on all channels — dead-lettered', {
        notificationId,
        attempts: attempts.length,
      });
    }
    return validated;
  }

  /** Records one attempt into the rolling metric window (#820). */
  private recordAttempt(channel: string, failed: boolean): void {
    const now = Date.now();
    this.attemptsWindow.push({ at: now, channel, failed });
    while (this.attemptsWindow.length > 0 && now - this.attemptsWindow[0].at > METRIC_WINDOW_MS) {
      this.attemptsWindow.shift();
    }
  }

  /**
   * Failure-rate metric over the rolling window (#820).
   *
   * Consumers (e.g. a monitoring sweep) can poll this and alert when
   * `failureRate` exceeds a threshold; it is also cheap enough to expose on
   * a health endpoint.
   */
  public getFailureStats(): FallbackFailureStats {
    const byChannel: Record<string, number> = {};
    let totalFailed = 0;
    for (const a of this.attemptsWindow) {
      if (a.failed) {
        totalFailed += 1;
        byChannel[a.channel] = (byChannel[a.channel] ?? 0) + 1;
      }
    }
    const totalAttempted = this.attemptsWindow.length;
    return {
      byChannel,
      totalFailed,
      totalAttempted,
      failureRate: totalAttempted === 0 ? 0 : totalFailed / totalAttempted,
    };
  }

  public getLogsForNotification(notificationId: string): DeliveryFailureLog[] {
    return Array.from(this.logs.values()).filter((l) => l.notificationId === notificationId);
  }

  public getAllLogs(): DeliveryFailureLog[] {
    return Array.from(this.logs.values());
  }

  public getLog(logId: string): DeliveryFailureLog | undefined {
    return this.logs.get(logId);
  }
}

export const deliveryFallbackService = new DeliveryFallbackService();
