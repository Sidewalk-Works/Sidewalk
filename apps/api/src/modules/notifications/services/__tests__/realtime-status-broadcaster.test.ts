import { RealtimeStatusBroadcasterService } from '../realtime-status-broadcaster.service.js';

describe('RealtimeStatusBroadcasterService', () => {
  let service: RealtimeStatusBroadcasterService;
  beforeEach(() => { service = new RealtimeStatusBroadcasterService(); });

  it('returns a payload with the correct caseId and newStatus', () => {
    const result = service.broadcastStatusChange('case-1', 'Resolved');
    expect(result.caseId).toBe('case-1');
    expect(result.newStatus).toBe('Resolved');
  });

  it('sets a valid updatedAtIso timestamp', () => {
    const result = service.broadcastStatusChange('case-1', 'In Review');
    expect(() => new Date(result.updatedAtIso)).not.toThrow();
  });

  it('returns a toast notification with level info', () => {
    const result = service.broadcastStatusChange('case-2', 'Closed');
    expect(result.toast.level).toBe('info');
  });

  it('toast message contains the caseId and new status', () => {
    const result = service.broadcastStatusChange('case-99', 'Open');
    expect(result.toast.message).toContain('case-99');
    expect(result.toast.message).toContain('Open');
  });

  it('toast has a positive autoDismissMs', () => {
    const result = service.broadcastStatusChange('case-1', 'Pending');
    expect(result.toast.autoDismissMs).toBeGreaterThan(0);
  });
});
