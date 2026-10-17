import React, { useState, useMemo } from 'react';
import type { NotificationAuditLogItem, NotificationDeliveryChannel, DispatchStatus } from '@qyou/shared';

interface NotificationAuditHistoryTableProps {
  logs?: NotificationAuditLogItem[];
  pageSize?: number;
}

type SortDirection = 'asc' | 'desc';

export function NotificationAuditHistoryTable({ logs = [], pageSize = 10 }: NotificationAuditHistoryTableProps) {
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [channelFilter, setChannelFilter] = useState<NotificationDeliveryChannel | ''>('');
  const [statusFilter, setStatusFilter] = useState<DispatchStatus | ''>('');
  const [page, setPage] = useState(0);
  const [selectedLog, setSelectedLog] = useState<NotificationAuditLogItem | null>(null);

  const filtered = useMemo(() => {
    let result = logs;
    if (dateFrom) result = result.filter((l) => l.sentAtIso >= dateFrom);
    if (dateTo) result = result.filter((l) => l.sentAtIso <= dateTo);
    if (channelFilter) result = result.filter((l) => l.channel === channelFilter);
    if (statusFilter) result = result.filter((l) => l.status === statusFilter);
    return result;
  }, [logs, dateFrom, dateTo, channelFilter, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageData = filtered.slice(page * pageSize, (page + 1) * pageSize);

  const exportCsv = () => {
    const headers = ['Date', 'Channel', 'Title', 'Status', 'Audit ID'];
    const rows = filtered.map((l) => [l.sentAtIso, l.channel, `"${l.title}"`, l.status, l.auditId]);
    const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'notification-audit-history.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const th: React.CSSProperties = { padding: '10px 14px', textAlign: 'left', fontSize: '12px', color: '#64748b', fontWeight: 'bold' };
  const td: React.CSSProperties = { padding: '10px 14px', fontSize: '13px' };
  const inputStyle: React.CSSProperties = { padding: '6px 8px', border: '1px solid #e2e8f0', borderRadius: '4px', fontSize: '12px' };
  const btnStyle: React.CSSProperties = { padding: '6px 12px', borderRadius: '4px', border: 'none', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer', background: '#f1f5f9', color: '#475569' };
  const activeBtn: React.CSSProperties = { ...btnStyle, background: '#3b82f6', color: '#ffffff' };

  return (
    <div>
      <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap' }}>
        <label style={{ fontSize: '12px', color: '#64748b' }}>From:</label>
        <input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setPage(0); }} style={inputStyle} />
        <label style={{ fontSize: '12px', color: '#64748b' }}>To:</label>
        <input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setPage(0); }} style={inputStyle} />
        <label style={{ fontSize: '12px', color: '#64748b' }}>Channel:</label>
        <select value={channelFilter} onChange={(e) => { setChannelFilter(e.target.value as NotificationDeliveryChannel | ''); setPage(0); }} style={inputStyle}>
          <option value="">All</option>
          <option value="email">Email</option>
          <option value="push">Push</option>
          <option value="in_app">In-App</option>
          <option value="sms">SMS</option>
        </select>
        <label style={{ fontSize: '12px', color: '#64748b' }}>Status:</label>
        <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value as DispatchStatus | ''); setPage(0); }} style={inputStyle}>
          <option value="">All</option>
          <option value="sent">Sent</option>
          <option value="failed">Failed</option>
          <option value="suppressed_quiet_hours">Suppressed</option>
        </select>
        <button style={{ ...btnStyle, background: '#dcfce7', color: '#166534', marginLeft: 'auto' }} onClick={exportCsv}>
          Export CSV
        </button>
      </div>

      <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: '8px' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
          <thead>
            <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
              <th style={th}>Sent Date</th>
              <th style={th}>Channel</th>
              <th style={th}>Title</th>
              <th style={th}>Status</th>
            </tr>
          </thead>
          <tbody>
            {pageData.length === 0 ? (
              <tr>
                <td colSpan={4} style={{ ...td, color: '#64748b', textAlign: 'center' }}>No notification audit logs recorded.</td>
              </tr>
            ) : (
              pageData.map((log) => (
                <tr
                  key={log.auditId}
                  style={{ borderBottom: '1px solid #f1f5f9', cursor: 'pointer', transition: 'background 0.15s' }}
                  onClick={() => setSelectedLog(selectedLog?.auditId === log.auditId ? null : log)}
                  onMouseEnter={(e) => (e.currentTarget.style.background = '#f8fafc')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = '')}
                >
                  <td style={td}>{new Date(log.sentAtIso).toLocaleString()}</td>
                  <td style={{ ...td, textTransform: 'uppercase' }}>{log.channel}</td>
                  <td style={{ ...td, fontWeight: 'bold' }}>{log.title}</td>
                  <td style={td}>
                    <span style={{ padding: '2px 8px', borderRadius: '4px', background: log.status === 'sent' ? '#dcfce7' : log.status === 'failed' ? '#fee2e2' : '#fef3c7', color: log.status === 'sent' ? '#166534' : log.status === 'failed' ? '#991b1b' : '#92400e' }}>
                      {log.status}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '10px', fontSize: '12px', color: '#64748b' }}>
        <span>Showing {page * pageSize + 1}-{Math.min((page + 1) * pageSize, filtered.length)} of {filtered.length}</span>
        <div style={{ display: 'flex', gap: '6px' }}>
          <button style={btnStyle} disabled={page === 0} onClick={() => setPage(page - 1)}>Prev</button>
          <span style={{ padding: '6px 8px' }}>Page {page + 1} of {totalPages}</span>
          <button style={btnStyle} disabled={page >= totalPages - 1} onClick={() => setPage(page + 1)}>Next</button>
        </div>
      </div>

      {selectedLog && (
        <div style={{ marginTop: '12px', padding: '16px', border: '1px solid #e2e8f0', borderRadius: '8px', background: '#f8fafc' }}>
          <h4 style={{ margin: '0 0 8px 0', fontSize: '14px' }}>Notification Detail</h4>
          <div style={{ fontSize: '13px', lineHeight: 1.6 }}>
            <div><strong>Audit ID:</strong> {selectedLog.auditId}</div>
            <div><strong>Recipient:</strong> {selectedLog.recipientId}</div>
            <div><strong>Channel:</strong> {selectedLog.channel}</div>
            <div><strong>Title:</strong> {selectedLog.title}</div>
            <div><strong>Body:</strong> {selectedLog.bodySnippet}</div>
            <div><strong>Status:</strong> {selectedLog.status}</div>
            <div><strong>Sent:</strong> {new Date(selectedLog.sentAtIso).toLocaleString()}</div>
          </div>
          <button style={{ ...btnStyle, marginTop: '10px' }} onClick={() => setSelectedLog(null)}>Close</button>
        </div>
      )}
    </div>
  );
}
