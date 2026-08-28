import { RefinedActivitySignalsService } from '../refined-activity-signals.service.js';

const makeEvent = (id: string) => ({
  eventId: id,
  caseId: 'case-1',
  activityType: 'status_change' as const,
  actorUserId: 'user-1',
  occurredAtIso: new Date().toISOString(),
  metadata: {},
});

describe('RefinedActivitySignalsService', () => {
  let service: RefinedActivitySignalsService;

  beforeEach(() => {
    service = new RefinedActivitySignalsService();
  });

  describe('emitSignal', () => {
    it('prepends new events so the feed is newest-first', () => {
      service.emitSignal(makeEvent('ev-1'));
      service.emitSignal(makeEvent('ev-2'));
      const state = service.getFeedState();
      expect(state.events[0].eventId).toBe('ev-2');
      expect(state.events[1].eventId).toBe('ev-1');
    });

    it('caps the event list at 50 items', () => {
      for (let i = 0; i < 55; i++) {
        service.emitSignal(makeEvent(`ev-${i}`));
      }
      expect(service.getFeedState().events).toHaveLength(50);
    });

    it('drops the oldest event (tail) when cap is exceeded', () => {
      for (let i = 0; i < 51; i++) {
        service.emitSignal(makeEvent(`ev-${i}`));
      }
      const ids = service.getFeedState().events.map((e) => e.eventId);
      expect(ids).not.toContain('ev-0');
    });
  });

  describe('getFeedState', () => {
    it('returns isLive: true', () => {
      expect(service.getFeedState().isLive).toBe(true);
    });

    it('returns a valid lastPolledIso ISO timestamp', () => {
      const ts = service.getFeedState().lastPolledIso;
      expect(() => new Date(ts)).not.toThrow();
      expect(new Date(ts).toISOString()).toBe(ts);
    });

    it('returns an empty events array when no signals have been emitted', () => {
      expect(service.getFeedState().events).toHaveLength(0);
    });

    it('returns a schema-valid ActivityFeedState', () => {
      service.emitSignal(makeEvent('ev-1'));
      const state = service.getFeedState();
      expect(state).toHaveProperty('events');
      expect(state).toHaveProperty('lastPolledIso');
      expect(state).toHaveProperty('isLive');
    });
  });
});
