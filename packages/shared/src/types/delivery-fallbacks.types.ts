export interface DeliveryFallbackStrategy {
  primaryChannel: 'email' | 'push' | 'inApp';
  fallbackOrder: Array<'email' | 'push' | 'inApp'>;
  maxRetries: number;
  backoffBaseMs: number;
}

export interface FallbackAttempt {
  attemptId: string;
  notificationId: string;
  channel: 'email' | 'push' | 'inApp';
  status: 'pending' | 'success' | 'failed';
  attemptedAtIso: string;
  error?: string;
}

export interface DeliveryFailureLog {
  logId: string;
  notificationId: string;
  strategy: DeliveryFallbackStrategy;
  attempts: FallbackAttempt[];
  finalStatus: 'delivered' | 'failed_all';
  completedAtIso: string;
}
