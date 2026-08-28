import { StaleReportRemindersService } from '../stale-report-reminders.service.js';

describe('StaleReportRemindersService', () => {
  let service: StaleReportRemindersService;
  beforeEach(() => { service = new StaleReportRemindersService(); });

  describe('detectStaleReports', () => {
    it('flags all reports as stale when no reminders exist', () => {
      const stale = service.detectStaleReports(['r-1', 'r-2'], 7);
      expect(stale).toEqual(['r-1', 'r-2']);
    });

    it('excludes a report that already has a recent non-dismissed reminder', () => {
      service.createReminder('r-1', 'user-1');
      // The reminder was just created (lastSentAtIso is null, createdAtIso is now)
      // so elapsed time < threshold → not stale
      const stale = service.detectStaleReports(['r-1'], 7);
      expect(stale).toHaveLength(0);
    });
  });

  describe('createReminder', () => {
    it('creates a reminder with correct fields', () => {
      const r = service.createReminder('report-1', 'user-1');
      expect(r.reportId).toBe('report-1');
      expect(r.recipientId).toBe('user-1');
      expect(r.dismissed).toBe(false);
      expect(r.reminderId).toMatch(/^reminder_/);
    });

    it('uses the config default frequency when none provided', () => {
      const r = service.createReminder('report-1', 'user-1');
      expect(r.frequency).toBe('weekly');
    });
  });

  describe('snoozeReminder / acknowledgeReminder / dismissReminder', () => {
    it('snooze sets a future snoozedUntilIso', () => {
      const r = service.createReminder('r-1', 'u-1');
      const snoozed = service.snoozeReminder(r.reminderId, 3);
      expect(new Date(snoozed!.snoozedUntilIso!).getTime()).toBeGreaterThan(Date.now());
    });

    it('acknowledge sets acknowledgedAtIso', () => {
      const r = service.createReminder('r-1', 'u-1');
      const acked = service.acknowledgeReminder(r.reminderId);
      expect(acked!.acknowledgedAtIso).not.toBeNull();
    });

    it('dismiss sets dismissed to true', () => {
      const r = service.createReminder('r-1', 'u-1');
      expect(service.dismissReminder(r.reminderId)).toBe(true);
      expect(service.getPendingReminders('u-1')).toHaveLength(0);
    });

    it('returns null/false for unknown ids', () => {
      expect(service.snoozeReminder('no-id', 1)).toBeNull();
      expect(service.acknowledgeReminder('no-id')).toBeNull();
      expect(service.dismissReminder('no-id')).toBe(false);
    });
  });

  describe('getPendingReminders', () => {
    it('returns only pending (non-dismissed, non-acknowledged) reminders', () => {
      service.createReminder('r-1', 'u-1');
      service.createReminder('r-2', 'u-1');
      expect(service.getPendingReminders('u-1')).toHaveLength(2);
    });

    it('excludes dismissed reminders', () => {
      const r = service.createReminder('r-1', 'u-1');
      service.dismissReminder(r.reminderId);
      expect(service.getPendingReminders('u-1')).toHaveLength(0);
    });
  });

  describe('updateConfig / getConfig', () => {
    it('updates and retrieves config fields', () => {
      service.updateConfig({ staleAfterDays: 14 });
      expect(service.getConfig().staleAfterDays).toBe(14);
    });
  });
});
