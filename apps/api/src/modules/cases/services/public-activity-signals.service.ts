import {
  signalFeedSummarySchema,
  type PublicProgressEvent,
  type SignalFeedSummary,
} from '@qyou/shared';

export class PublicActivitySignalsService {
  private readonly events: PublicProgressEvent[] = [];

  public emitSignal(event: PublicProgressEvent): void {
    this.events.push(event);
    if (this.events.length > 100) {
      this.events.shift(); // Keep latest 100
    }
  }

  public getRecentSignals(regionId: string): SignalFeedSummary {
    const summary: SignalFeedSummary = {
      regionId,
      recentEvents: this.events.slice(-10).reverse(),
      lastUpdatedIso: new Date().toISOString(),
    };
    return signalFeedSummarySchema.parse(summary);
  }
}
