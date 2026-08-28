import { DeliveryChannelService } from '../delivery-channel.service.js';

describe('DeliveryChannelService', () => {
  let service: DeliveryChannelService;
  beforeEach(() => { service = new DeliveryChannelService(); });

  it('returns a payload with alertId and recipientId', () => {
    const result = service.routeAlert('user-1', 'alert-1', false);
    expect(result.alertId).toBe('alert-1');
    expect(result.recipientId).toBe('user-1');
  });

  it('includes default channels for a non-urgent alert', () => {
    const result = service.routeAlert('user-1', 'alert-1', false);
    expect(Array.isArray(result.targetChannels)).toBe(true);
    expect(result.targetChannels.length).toBeGreaterThan(0);
  });

  it('sets a valid payloadTimestamp', () => {
    const result = service.routeAlert('user-1', 'alert-1', false);
    expect(() => new Date(result.payloadTimestamp)).not.toThrow();
  });

  it('routes urgent and non-urgent alerts without throwing', () => {
    expect(() => service.routeAlert('user-1', 'alert-1', true)).not.toThrow();
    expect(() => service.routeAlert('user-1', 'alert-2', false)).not.toThrow();
  });
});
