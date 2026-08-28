import { QuietHoursEvaluatorService } from '../quiet-hours-evaluator.service.js';

const schedule = { isEnabled: true, startTimeWindow: '22:00', endTimeWindow: '07:00' };

describe('QuietHoursEvaluatorService', () => {
  let service: QuietHoursEvaluatorService;
  beforeEach(() => { service = new QuietHoursEvaluatorService(); });

  it('returns false when quiet hours are disabled', () => {
    expect(service.isCurrentlyInQuietHours({ ...schedule, isEnabled: false }, 23)).toBe(false);
  });

  it('returns true at hour inside overnight window (22–07)', () => {
    expect(service.isCurrentlyInQuietHours(schedule, 23)).toBe(true);
    expect(service.isCurrentlyInQuietHours(schedule, 0)).toBe(true);
    expect(service.isCurrentlyInQuietHours(schedule, 6)).toBe(true);
  });

  it('returns false at hour outside overnight window', () => {
    expect(service.isCurrentlyInQuietHours(schedule, 7)).toBe(false);
    expect(service.isCurrentlyInQuietHours(schedule, 12)).toBe(false);
    expect(service.isCurrentlyInQuietHours(schedule, 21)).toBe(false);
  });

  it('handles a same-day window (09:00–17:00)', () => {
    const daytime = { isEnabled: true, startTimeWindow: '09:00', endTimeWindow: '17:00' };
    expect(service.isCurrentlyInQuietHours(daytime, 10)).toBe(true);
    expect(service.isCurrentlyInQuietHours(daytime, 9)).toBe(true);
    expect(service.isCurrentlyInQuietHours(daytime, 17)).toBe(false);
    expect(service.isCurrentlyInQuietHours(daytime, 8)).toBe(false);
  });

  it('boundary: start hour is inclusive', () => {
    expect(service.isCurrentlyInQuietHours(schedule, 22)).toBe(true);
  });

  it('boundary: end hour is exclusive', () => {
    expect(service.isCurrentlyInQuietHours(schedule, 7)).toBe(false);
  });
});
