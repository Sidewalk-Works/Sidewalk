import { ToastTriggerService } from '../toast-trigger.service.js';

describe('ToastTriggerService', () => {
  let service: ToastTriggerService;
  beforeEach(() => { service = new ToastTriggerService(); });

  it('returns a toast with type success', () => {
    const toast = service.triggerStatusChangeToast({ oldStatus: 'Open', newStatus: 'In Review', caseId: 'c-1' });
    expect(toast.type).toBe('success');
  });

  it('includes old and new status in the message', () => {
    const toast = service.triggerStatusChangeToast({ oldStatus: 'Open', newStatus: 'Closed', caseId: 'c-1' });
    expect(toast.message).toContain('Open');
    expect(toast.message).toContain('Closed');
  });

  it('sets a positive durationMs', () => {
    const toast = service.triggerStatusChangeToast({ oldStatus: 'Open', newStatus: 'Closed', caseId: 'c-1' });
    expect(toast.durationMs).toBeGreaterThan(0);
  });

  it('generates a toastId prefixed with toast_', () => {
    const toast = service.triggerStatusChangeToast({ oldStatus: 'Open', newStatus: 'Closed', caseId: 'c-1' });
    expect(toast.toastId).toMatch(/^toast_/);
  });
});
