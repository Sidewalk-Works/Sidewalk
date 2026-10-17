import React, { useState } from 'react';
import type { NotificationFilter, UrgencyLevel, FilterOptions } from '@qyou/shared';
import { UrgencyLevel as Urgency } from '@qyou/shared';

interface NotificationFiltersPanelProps {
  filters: NotificationFilter[];
  activeFilter?: NotificationFilter;
  onApplyFilter: (options: FilterOptions) => void;
  onSaveFilter: (filter: Omit<NotificationFilter, 'id' | 'createdAt'>) => void;
  onDeleteFilter: (id: string) => void;
  onToggleFilter: (id: string) => void;
}

const URGENCY_OPTIONS: { value: UrgencyLevel; label: string; color: string }[] = [
  { value: Urgency.LOW, label: 'Low', color: '#94a3b8' },
  { value: Urgency.MEDIUM, label: 'Medium', color: '#f59e0b' },
  { value: Urgency.HIGH, label: 'High', color: '#f97316' },
  { value: Urgency.CRITICAL, label: 'Critical', color: '#ef4444' },
];

export function NotificationFiltersPanel({
  filters,
  activeFilter,
  onApplyFilter,
  onSaveFilter,
  onDeleteFilter,
  onToggleFilter,
}: NotificationFiltersPanelProps) {
  const [selectedUrgency, setSelectedUrgency] = useState<UrgencyLevel[]>(activeFilter?.urgency ?? []);
  const [selectedCategories, setSelectedCategories] = useState<string[]>(activeFilter?.categories ?? []);
  const [proximityRadius, setProximityRadius] = useState(activeFilter?.proximity?.radiusKm ?? 5);
  const [filterName, setFilterName] = useState('');

  const toggleUrgency = (level: UrgencyLevel) => {
    setSelectedUrgency((prev) =>
      prev.includes(level) ? prev.filter((u) => u !== level) : [...prev, level],
    );
  };

  const toggleCategory = (cat: string) => {
    setSelectedCategories((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat],
    );
  };

  const applyCurrentFilters = () => {
    onApplyFilter({
      urgency: selectedUrgency,
      categories: selectedCategories,
      proximity: proximityRadius > 0 ? { latitude: 0, longitude: 0, radiusKm: proximityRadius } : null,
      timeRange: null,
    });
  };

  const saveCurrentFilter = () => {
    if (!filterName.trim()) return;
    onSaveFilter({
      name: filterName.trim(),
      urgency: selectedUrgency,
      categories: selectedCategories,
      proximity: proximityRadius > 0 ? { latitude: 0, longitude: 0, radiusKm: proximityRadius } : null,
      timeRange: null,
      isActive: true,
    });
    setFilterName('');
  };

  return (
    <div style={{ padding: '20px', background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px' }}>
      <h3 style={{ margin: '0 0 16px 0', fontSize: '16px', color: '#0f172a' }}>Notification Filters</h3>

      <div style={{ marginBottom: '16px' }}>
        <label style={{ fontSize: '13px', fontWeight: '600', color: '#334155', display: 'block', marginBottom: '8px' }}>
          Urgency
        </label>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {URGENCY_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => toggleUrgency(opt.value)}
              style={{
                padding: '6px 12px',
                background: selectedUrgency.includes(opt.value) ? opt.color : '#f1f5f9',
                color: selectedUrgency.includes(opt.value) ? '#ffffff' : '#64748b',
                border: `1px solid ${selectedUrgency.includes(opt.value) ? opt.color : '#e2e8f0'}`,
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '12px',
                fontWeight: '600',
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ marginBottom: '16px' }}>
        <label style={{ fontSize: '13px', fontWeight: '600', color: '#334155', display: 'block', marginBottom: '8px' }}>
          Categories
        </label>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {['infrastructure', 'safety', 'sanitation', 'noise', 'other'].map((cat) => (
            <button
              key={cat}
              onClick={() => toggleCategory(cat)}
              style={{
                padding: '6px 12px',
                background: selectedCategories.includes(cat) ? '#3b82f6' : '#f1f5f9',
                color: selectedCategories.includes(cat) ? '#ffffff' : '#64748b',
                border: `1px solid ${selectedCategories.includes(cat) ? '#3b82f6' : '#e2e8f0'}`,
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '12px',
                fontWeight: '600',
              }}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      <div style={{ marginBottom: '16px' }}>
        <label style={{ fontSize: '13px', fontWeight: '600', color: '#334155', display: 'block', marginBottom: '8px' }}>
          Proximity Radius: {proximityRadius} km
        </label>
        <input
          type="range"
          min={0.5}
          max={100}
          step={0.5}
          value={proximityRadius}
          onChange={(e) => setProximityRadius(Number(e.target.value))}
          style={{ width: '100%', accentColor: '#3b82f6' }}
        />
      </div>

      <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
        <button
          onClick={applyCurrentFilters}
          style={{
            padding: '8px 16px',
            background: '#3b82f6',
            color: '#ffffff',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '13px',
            fontWeight: '600',
          }}
        >
          Apply Filters
        </button>
        <button
          onClick={() => {
            setSelectedUrgency([]);
            setSelectedCategories([]);
            setProximityRadius(5);
            onApplyFilter({ urgency: [], categories: [], proximity: null, timeRange: null });
          }}
          style={{
            padding: '8px 16px',
            background: '#f1f5f9',
            color: '#64748b',
            border: '1px solid #e2e8f0',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '13px',
          }}
        >
          Reset
        </button>
      </div>

      <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '16px' }}>
        <div style={{ fontSize: '13px', fontWeight: '600', color: '#334155', marginBottom: '8px' }}>
          Save as Preset
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <input
            type="text"
            placeholder="Filter name..."
            value={filterName}
            onChange={(e) => setFilterName(e.target.value)}
            style={{
              flex: 1,
              padding: '8px 12px',
              border: '1px solid #e2e8f0',
              borderRadius: '6px',
              fontSize: '13px',
              outline: 'none',
            }}
          />
          <button
            onClick={saveCurrentFilter}
            disabled={!filterName.trim()}
            style={{
              padding: '8px 12px',
              background: filterName.trim() ? '#10b981' : '#e2e8f0',
              color: filterName.trim() ? '#ffffff' : '#94a3b8',
              border: 'none',
              borderRadius: '6px',
              cursor: filterName.trim() ? 'pointer' : 'not-allowed',
              fontSize: '13px',
              fontWeight: '600',
            }}
          >
            Save
          </button>
        </div>
      </div>

      {filters.length > 0 && (
        <div style={{ marginTop: '16px' }}>
          <div style={{ fontSize: '13px', fontWeight: '600', color: '#334155', marginBottom: '8px' }}>
            Saved Filters
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {filters.map((f) => (
              <div
                key={f.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '8px 12px',
                  background: f.isActive ? '#eff6ff' : '#f8fafc',
                  borderRadius: '6px',
                  border: `1px solid ${f.isActive ? '#3b82f6' : '#e2e8f0'}`,
                }}
              >
                <span style={{ fontSize: '13px', color: '#1e293b' }}>{f.name}</span>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button
                    onClick={() => onToggleFilter(f.id)}
                    style={{
                      padding: '2px 8px',
                      background: f.isActive ? '#3b82f6' : '#f1f5f9',
                      color: f.isActive ? '#fff' : '#64748b',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontSize: '11px',
                    }}
                  >
                    {f.isActive ? 'On' : 'Off'}
                  </button>
                  <button
                    onClick={() => onDeleteFilter(f.id)}
                    style={{
                      padding: '2px 8px',
                      background: '#fee2e2',
                      color: '#991b1b',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontSize: '11px',
                    }}
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
