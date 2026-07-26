import { describe, it, expect } from 'vitest';
import {
  quietHoursScheduleSchema,
  type QuietHoursScheduleInput,
} from '@sidewalk/shared';
import { QuietHoursEvaluatorService } from '../quiet-hours-evaluator.service';
import { DigestSchedulerService } from '../digest-scheduler.service';

// ---------------------------------------------------------------------------
// QuietHoursEvaluatorService
// ---------------------------------------------------------------------------

describe('QuietHoursEvaluatorService — quiet window suppression', () => {
  const evaluator = new QuietHoursEvaluatorService();

  const schedule: QuietHoursScheduleInput = quietHoursScheduleSchema.parse({
    isEnabled: true,
    startTimeWindow: '22:00',
    endTimeWindow: '07:00',
    userTimezone: 'America/New_York',
  });

  it('returns true when current hour is inside the quiet window', () => {
    expect(evaluator.isCurrentlyInQuietHours(schedule, 23)).toBe(true);
    expect(evaluator.isCurrentlyInQuietHours(schedule, 0)).toBe(true);
    expect(evaluator.isCurrentlyInQuietHours(schedule, 6)).toBe(true);
  });

  it('returns false when current hour is outside the quiet window', () => {
    expect(evaluator.isCurrentlyInQuietHours(schedule, 8)).toBe(false);
    expect(evaluator.isCurrentlyInQuietHours(schedule, 12)).toBe(false);
    expect(evaluator.isCurrentlyInQuietHours(schedule, 21)).toBe(false);
  });

  it('returns false when quiet hours are disabled', () => {
    const disabled: QuietHoursScheduleInput = quietHoursScheduleSchema.parse({
      isEnabled: false,
      startTimeWindow: '22:00',
      endTimeWindow: '07:00',
      userTimezone: 'UTC',
    });
    expect(evaluator.isCurrentlyInQuietHours(disabled, 23)).toBe(false);
  });

  it('handles overnight window where start > end', () => {
    expect(evaluator.isCurrentlyInQuietHours(schedule, 22)).toBe(true);
    expect(evaluator.isCurrentlyInQuietHours(schedule, 2)).toBe(true);
    expect(evaluator.isCurrentlyInQuietHours(schedule, 7)).toBe(false);
  });

  it('handles same-day window where start < end', () => {
    const daytimeSchedule: QuietHoursScheduleInput = quietHoursScheduleSchema.parse({
      isEnabled: true,
      startTimeWindow: '12:00',
      endTimeWindow: '14:00',
      userTimezone: 'UTC',
    });
    expect(evaluator.isCurrentlyInQuietHours(daytimeSchedule, 11)).toBe(false);
    expect(evaluator.isCurrentlyInQuietHours(daytimeSchedule, 12)).toBe(true);
    expect(evaluator.isCurrentlyInQuietHours(daytimeSchedule, 13)).toBe(true);
    expect(evaluator.isCurrentlyInQuietHours(daytimeSchedule, 14)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// QuietHoursEvaluatorService — timezone-aware behavior
// ---------------------------------------------------------------------------

describe('QuietHoursEvaluatorService — respects user timezone in schedule', () => {
  const evaluator = new QuietHoursEvaluatorService();

  it('stores the user timezone from the validated schedule', () => {
    const schedule = quietHoursScheduleSchema.parse({
      isEnabled: true,
      startTimeWindow: '23:00',
      endTimeWindow: '06:00',
      userTimezone: 'Asia/Tokyo',
    });
    // The evaluator parses start/end from the validated schedule; timezone is available
    // for the caller to use when converting current hour to the user's local time.
    expect(schedule.userTimezone).toBe('Asia/Tokyo');
  });

  it('defaults timezone to UTC when not specified', () => {
    const schedule = quietHoursScheduleSchema.parse({
      isEnabled: true,
      startTimeWindow: '22:00',
      endTimeWindow: '07:00',
    });
    expect(schedule.userTimezone).toBe('UTC');
  });
});

// ---------------------------------------------------------------------------
// DigestSchedulerService — batching during quiet hours
// ---------------------------------------------------------------------------

describe('DigestSchedulerService — batching during quiet hours', () => {
  const scheduler = new DigestSchedulerService();

  const rawNotifications = [
    { id: 'n1', title: 'Report resolved', body: 'Your pothole report was resolved.', type: 'status_change' },
    { id: 'n2', title: 'New comment', body: 'A neighbor commented on your report.', type: 'comment_reply' },
    { id: 'n3', title: 'Moderation action', body: 'Your comment was flagged for review.', type: 'moderation' },
    { id: 'n4', title: 'Status update', body: 'Your report moved to under investigation.', type: 'status_change' },
    { id: 'n5', title: 'System alert', body: 'Scheduled maintenance tonight.', type: 'system' },
    { id: 'n6', title: 'Another update', body: 'Additional report updated.', type: 'status_change' },
  ];

  it('returns null when frequency is none', () => {
    expect(scheduler.generateDigest('user-1', 'none', rawNotifications)).toBeNull();
  });

  it('returns null when there are no notifications', () => {
    expect(scheduler.generateDigest('user-1', 'daily', [])).toBeNull();
  });

  it('generates a digest with up to 5 items', () => {
    const digest = scheduler.generateDigest('user-1', 'daily', rawNotifications);
    expect(digest).not.toBeNull();
    expect(digest!.items).toHaveLength(5);
    expect(digest!.totalUnreadCount).toBe(6);
  });

  it('includes all notifications in totalUnreadCount even when capped at 5 items', () => {
    const digest = scheduler.generateDigest('user-1', 'weekly', rawNotifications);
    expect(digest!.totalUnreadCount).toBe(rawNotifications.length);
  });

  it('sets the recipientId correctly', () => {
    const digest = scheduler.generateDigest('user-42', 'daily', rawNotifications);
    expect(digest!.recipientId).toBe('user-42');
  });

  it('generates a valid ISO timestamp', () => {
    const digest = scheduler.generateDigest('user-1', 'daily', rawNotifications);
    expect(() => new Date(digest!.generatedAtIso)).not.toThrow();
    expect(new Date(digest!.generatedAtIso).toISOString()).toBe(digest!.generatedAtIso);
  });

  it('snippets are truncated to 50 characters', () => {
    const longBody = [
      { id: 'n-long', title: 'Update', body: 'A'.repeat(100), type: 'status_change' },
    ];
    const digest = scheduler.generateDigest('user-1', 'daily', longBody);
    expect(digest!.items[0].snippet).toHaveLength(50);
  });

  it('digest frequency is preserved in payload', () => {
    const daily = scheduler.generateDigest('user-1', 'daily', rawNotifications);
    const weekly = scheduler.generateDigest('user-1', 'weekly', rawNotifications);

    expect(daily!.frequency).toBe('daily');
    expect(weekly!.frequency).toBe('weekly');
  });
});
