import React, { useState, useCallback } from 'react';
import type { TopicCategory, SubscriptionFrequency, TopicSubscription } from '@qyou/shared';

const FREQUENCY_OPTIONS: { value: SubscriptionFrequency; label: string }[] = [
  { value: 'realtime', label: 'Real-time' },
  { value: 'daily_digest', label: 'Daily digest' },
  { value: 'weekly_digest', label: 'Weekly digest' },
  { value: 'off', label: 'Off' },
];

interface TopicSubscriptionManagerProps {
  initialSubscriptions?: TopicSubscription[];
  onAdd?: (topicId: string, category: TopicCategory, label: string, frequency: SubscriptionFrequency) => void;
  onRemove?: (subscriptionId: string) => void;
  onUpdateFrequency?: (subscriptionId: string, frequency: SubscriptionFrequency) => void;
  availableTopics?: { id: string; label: string; category: TopicCategory }[];
}

export function TopicSubscriptionManager({
  initialSubscriptions = [],
  onAdd,
  onRemove,
  onUpdateFrequency,
  availableTopics = [],
}: TopicSubscriptionManagerProps) {
  const [subscriptions, setSubscriptions] = useState<TopicSubscription[]>(initialSubscriptions);
  const [selectedTopic, setSelectedTopic] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<TopicCategory>('neighborhood');
  const [newLabel, setNewLabel] = useState('');
  const [defaultFrequency, setDefaultFrequency] = useState<SubscriptionFrequency>('realtime');
  const [filterCategory, setFilterCategory] = useState<TopicCategory | 'all'>('all');

  const handleAdd = useCallback(() => {
    const topicId = selectedTopic || `topic_${Date.now()}`;
    const label = newLabel || topicId;
    onAdd?.(topicId, selectedCategory, label, defaultFrequency);
  }, [selectedTopic, newLabel, selectedCategory, defaultFrequency, onAdd]);

  const handleRemove = useCallback(
    (id: string) => {
      setSubscriptions((prev) => prev.filter((s) => s.id !== id));
      onRemove?.(id);
    },
    [onRemove],
  );

  const handleFrequencyChange = useCallback(
    (id: string, freq: SubscriptionFrequency) => {
      setSubscriptions((prev) => prev.map((s) => (s.id === id ? { ...s, frequency: freq } : s)));
      onUpdateFrequency?.(id, freq);
    },
    [onUpdateFrequency],
  );

  const filtered = filterCategory === 'all' ? subscriptions : subscriptions.filter((s) => s.category === filterCategory);

  return (
    <div style={{ padding: '20px', background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px' }}>
      <h3 style={{ margin: '0 0 16px 0', fontSize: '16px', color: '#0f172a' }}>Topic Subscriptions</h3>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '20px', padding: '14px', background: '#f8fafc', borderRadius: '8px' }}>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-end' }}>
          <div style={{ flex: 1 }}>
            <label style={{ display: 'block', fontSize: '12px', color: '#64748b', marginBottom: '4px' }}>Category</label>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value as TopicCategory)}
              style={{ width: '100%', padding: '6px 10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13px' }}
            >
              <option value="neighborhood">Neighborhood</option>
              <option value="issue_type">Issue Type</option>
              <option value="report">Report</option>
            </select>
          </div>
          <div style={{ flex: 1 }}>
            <label style={{ display: 'block', fontSize: '12px', color: '#64748b', marginBottom: '4px' }}>Topic</label>
            <select
              value={selectedTopic}
              onChange={(e) => setSelectedTopic(e.target.value)}
              style={{ width: '100%', padding: '6px 10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13px' }}
            >
              <option value="">Custom topic</option>
              {availableTopics
                .filter((t) => t.category === selectedCategory)
                .map((t) => (
                  <option key={t.id} value={t.id}>{t.label}</option>
                ))}
            </select>
          </div>
          <div style={{ flex: 1 }}>
            <label style={{ display: 'block', fontSize: '12px', color: '#64748b', marginBottom: '4px' }}>Label</label>
            <input
              type="text"
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              placeholder="Topic label"
              style={{ width: '100%', padding: '6px 10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13px' }}
            />
          </div>
          <button
            type="button"
            onClick={handleAdd}
            style={{ padding: '7px 16px', borderRadius: '6px', border: 'none', background: '#2563eb', color: '#ffffff', fontSize: '13px', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}
          >
            + Add
          </button>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '12px', color: '#64748b' }}>Default frequency:</span>
          <select
            value={defaultFrequency}
            onChange={(e) => setDefaultFrequency(e.target.value as SubscriptionFrequency)}
            style={{ padding: '4px 8px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '12px' }}
          >
            {FREQUENCY_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '6px', marginBottom: '14px' }}>
        {(['all', 'neighborhood', 'issue_type', 'report'] as const).map((cat) => (
          <button
            key={cat}
            type="button"
            onClick={() => setFilterCategory(cat)}
            style={{
              padding: '4px 12px',
              borderRadius: '6px',
              border: '1px solid',
              borderColor: filterCategory === cat ? '#2563eb' : '#cbd5e1',
              background: filterCategory === cat ? '#2563eb' : '#f8fafc',
              color: filterCategory === cat ? '#ffffff' : '#475569',
              fontSize: '12px',
              cursor: 'pointer',
            }}
          >
            {cat === 'all' ? 'All' : cat === 'issue_type' ? 'Issue Type' : cat.charAt(0).toUpperCase() + cat.slice(1)}
          </button>
        ))}
      </div>

      {filtered.length === 0 && (
        <p style={{ fontSize: '13px', color: '#94a3b8', textAlign: 'center', padding: '20px 0', margin: 0 }}>No subscriptions yet</p>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {filtered.map((sub) => (
          <div
            key={sub.id}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '10px 14px',
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
              borderRadius: '8px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1 }}>
              <span style={{ padding: '2px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: 600, background: sub.category === 'neighborhood' ? '#dbeafe' : sub.category === 'issue_type' ? '#fef3c7' : '#e0e7ff', color: sub.category === 'neighborhood' ? '#1d4ed8' : sub.category === 'issue_type' ? '#b45309' : '#4338ca' }}>
                {sub.category}
              </span>
              <span style={{ fontSize: '13px', color: '#0f172a', fontWeight: 500 }}>{sub.label}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <select
                value={sub.frequency}
                onChange={(e) => handleFrequencyChange(sub.id, e.target.value as SubscriptionFrequency)}
                style={{ padding: '4px 8px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '12px' }}
              >
                {FREQUENCY_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => handleRemove(sub.id)}
                style={{ padding: '4px 10px', borderRadius: '6px', border: '1px solid #fecaca', background: '#fef2f2', color: '#b91c1c', fontSize: '12px', cursor: 'pointer' }}
              >
                Remove
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
