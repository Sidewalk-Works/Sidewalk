import React, { useState, useMemo } from 'react';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

interface QuietHoursSettingsCardProps {
  initialEnabled?: boolean;
  initialStartTime?: string;
  initialEndTime?: string;
  initialActiveDays?: string[];
  initialUrgentOverride?: boolean;
  onSave?: (settings: QuietHoursSettings) => void;
}

interface QuietHoursSettings {
  enabled: boolean;
  startTime: string;
  endTime: string;
  activeDays: string[];
  urgentOverride: boolean;
}

function getNextQuietPeriod(activeDays: string[], startTime: string, endTime: string): string {
  const now = new Date();
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const today = dayNames[now.getDay()] as (typeof DAYS)[number];
  const todayIdx = DAYS.indexOf(today);
  const startHour = parseInt(startTime.split(':')[0], 10);
  const endHour = parseInt(endTime.split(':')[0], 10);
  const currentHour = now.getHours();

  if (activeDays.includes(today)) {
    if (currentHour >= startHour && currentHour < endHour) {
      return `Ongoing — ends at ${endTime} today`;
    }
    if (currentHour < startHour) {
      return `Today at ${startTime}`;
    }
  }

  for (let offset = 1; offset <= 7; offset++) {
    const nextIdx = (todayIdx + offset) % 7;
    const nextDay = DAYS[nextIdx];
    if (activeDays.includes(nextDay)) {
      const label = nextIdx === 0 ? 'Sunday' : nextIdx === 6 ? 'Saturday' : nextDay;
      return `${label} at ${startTime}`;
    }
  }
  return 'No upcoming quiet period';
}

export function QuietHoursSettingsCard({
  initialEnabled = true,
  initialStartTime = '22:00',
  initialEndTime = '07:00',
  initialActiveDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
  initialUrgentOverride = false,
  onSave,
}: QuietHoursSettingsCardProps) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [startTime, setStartTime] = useState(initialStartTime);
  const [endTime, setEndTime] = useState(initialEndTime);
  const [activeDays, setActiveDays] = useState<string[]>(initialActiveDays);
  const [urgentOverride, setUrgentOverride] = useState(initialUrgentOverride);

  const isDirty = useMemo(
    () =>
      enabled !== initialEnabled ||
      startTime !== initialStartTime ||
      endTime !== initialEndTime ||
      urgentOverride !== initialUrgentOverride ||
      JSON.stringify(activeDays) !== JSON.stringify(initialActiveDays),
    [enabled, startTime, endTime, urgentOverride, activeDays, initialEnabled, initialStartTime, initialEndTime, initialUrgentOverride, initialActiveDays],
  );

  const nextPeriod = useMemo(() => getNextQuietPeriod(activeDays, startTime, endTime), [activeDays, startTime, endTime]);

  const toggleDay = (day: string) => {
    setActiveDays((prev) => (prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]));
  };

  const handleSave = () => {
    onSave?.({ enabled, startTime, endTime, activeDays, urgentOverride });
  };

  return (
    <div style={{ padding: '20px', background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px' }}>
      <h3 style={{ margin: '0 0 12px 0', fontSize: '16px', color: '#0f172a' }}>Quiet Hours Preferences</h3>
      <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', marginBottom: '16px' }}>
        <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
        <span style={{ fontSize: '14px', color: '#334155' }}>Pause non-urgent community alerts during quiet hours</span>
      </label>
      {enabled && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ display: 'flex', gap: '16px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '12px', color: '#64748b' }}>Start Time</label>
              <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid #cbd5e1' }} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '12px', color: '#64748b' }}>End Time</label>
              <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid #cbd5e1' }} />
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '12px', color: '#64748b', marginBottom: '8px' }}>Active Days</label>
            <div style={{ display: 'flex', gap: '6px' }}>
              {DAYS.map((day) => (
                <button
                  key={day}
                  type="button"
                  onClick={() => toggleDay(day)}
                  style={{
                    padding: '6px 10px',
                    borderRadius: '6px',
                    border: '1px solid',
                    borderColor: activeDays.includes(day) ? '#2563eb' : '#cbd5e1',
                    background: activeDays.includes(day) ? '#2563eb' : '#f8fafc',
                    color: activeDays.includes(day) ? '#ffffff' : '#475569',
                    fontSize: '12px',
                    fontWeight: activeDays.includes(day) ? 600 : 400,
                    cursor: 'pointer',
                  }}
                >
                  {day}
                </button>
              ))}
            </div>
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
            <input type="checkbox" checked={urgentOverride} onChange={(e) => setUrgentOverride(e.target.checked)} />
            <span style={{ fontSize: '14px', color: '#334155' }}>Allow urgent alerts to bypass quiet hours</span>
          </label>

          <div style={{ padding: '10px 14px', background: '#f1f5f9', borderRadius: '8px', fontSize: '13px', color: '#475569' }}>
            <span style={{ fontWeight: 600, color: '#0f172a' }}>Next quiet period: </span>{nextPeriod}
          </div>

          <button
            type="button"
            disabled={!isDirty}
            onClick={handleSave}
            style={{
              alignSelf: 'flex-end',
              padding: '8px 20px',
              borderRadius: '8px',
              border: 'none',
              background: isDirty ? '#2563eb' : '#94a3b8',
              color: '#ffffff',
              fontSize: '14px',
              fontWeight: 600,
              cursor: isDirty ? 'pointer' : 'not-allowed',
            }}
          >
            Save Changes
          </button>
        </div>
      )}
    </div>
  );
}
