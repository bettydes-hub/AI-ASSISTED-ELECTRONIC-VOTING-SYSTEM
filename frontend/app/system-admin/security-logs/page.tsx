'use client';

import Link from 'next/link';
import { useState } from 'react';
import { CSSProperties } from 'react';

import { apiDelete, apiGet } from '../../../lib/apiClient';
import { getApiBase } from '../../../lib/apiBase';

export default function SecurityLogsPage() {
  const [logs, setLogs] = useState<
    Array<{
      id: number;
      user_id: number | null;
      event_type: string;
      action: string;
      ip_address?: string;
      previous_hash?: string;
      record_hash?: string;
      created_at: string;
    }>
  >([]);
  const [query, setQuery] = useState('');
  const [severity, setSeverity] = useState('');
  const [keepLatest, setKeepLatest] = useState('20');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [auditChainStatus, setAuditChainStatus] = useState<string>('');

  async function loadLogs() {
    setError('');
    setMessage('');
    try {
      const params = new URLSearchParams();
      if (query.trim()) params.set('q', query.trim());
      if (severity) params.set('severity', severity);
      params.set('limit', '200');
      const data = await apiGet(`/system/security-logs?${params.toString()}`, 'SystemAdmin');
      setLogs(data.items ?? []);
      const status = await apiGet('/system/status', 'SystemAdmin');
      const chain = status?.audit_chain;
      if (chain?.ok) {
        setAuditChainStatus(`Audit chain verified (${chain.checked_records} records checked).`);
      } else if (chain) {
        setAuditChainStatus(`Audit chain issue at record #${chain.failed_record_id}.`);
      } else {
        setAuditChainStatus('');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed');
    }
  }

  async function clearLogs() {
    setError('');
    setMessage('');
    const keep = Number(keepLatest);
    if (!Number.isFinite(keep) || keep < 0) {
      setError('Keep latest value must be 0 or more.');
      return;
    }
    const confirmed = window.confirm(
      `Clear old logs and keep latest ${keep} record(s)? This action cannot be undone.`
    );
    if (!confirmed) return;
    try {
      const data = await apiDelete('/system/security-logs', 'SystemAdmin', {
        keep_latest: keep,
      });
      setMessage(`Cleared logs. Deleted ${data.deleted_count ?? 0} record(s).`);
      await loadLogs();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed');
    }
  }

  async function exportLogs() {
    const params = new URLSearchParams();
    if (query.trim()) params.set('q', query.trim());
    if (severity) params.set('severity', severity);
    const url = `${getApiBase()}/system/security-logs/export?${params.toString()}`;
    try {
      setError('');
      const raw = localStorage.getItem('evoting.user');
      const user = raw ? (JSON.parse(raw) as { id?: number }) : null;
      const res = await fetch(url, {
        headers: {
          'X-Role': 'SystemAdmin',
          ...(user?.id ? { 'X-User-Id': String(user.id) } : {}),
        },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? 'Export failed');
      }
      const blob = await res.blob();
      const downloadUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = `security_logs_${new Date().toISOString().replace(/[:.]/g, '-')}.csv`;
      a.click();
      URL.revokeObjectURL(downloadUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export failed');
    }
  }

  return (
    <section style={styles.page}>
      <header style={styles.header}>
        <div>
          <h1 style={styles.title}>Security Logs</h1>
          <p style={styles.subtitle}>Search, review, export, and manage security-related log events.</p>
        </div>
        <Link href="/system-admin/dashboard" style={styles.backLink}>
          Back to Dashboard
        </Link>
      </header>

      <div style={styles.toolbar}>
        <input style={styles.input} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search text" />
        <select style={styles.input} value={severity} onChange={(e) => setSeverity(e.target.value)}>
          <option value="">All severities</option>
          <option value="warning">warning</option>
          <option value="high">high</option>
          <option value="critical">critical</option>
        </select>
        <button type="button" onClick={loadLogs} style={styles.primaryBtn}>
          Load Logs
        </button>
        <button type="button" onClick={exportLogs} style={styles.secondaryBtn}>
          Export CSV
        </button>
      </div>
      <div style={styles.toolbar}>
        <input
          style={{ ...styles.input, maxWidth: 220 }}
          value={keepLatest}
          onChange={(e) => setKeepLatest(e.target.value)}
          placeholder="Keep latest N logs"
        />
        <button type="button" onClick={clearLogs} style={styles.dangerBtn}>
          Clear Old Logs
        </button>
      </div>
      {error ? <p style={styles.error}>{error}</p> : null}
      {message ? <p style={styles.success}>{message}</p> : null}
      {auditChainStatus ? <p style={styles.auditStatus}>{auditChainStatus}</p> : null}
      <div style={{ marginTop: 12, border: '1px solid #e5e7eb', borderRadius: 10, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#f9fafb' }}>
              <th style={cellHead}>Time</th>
              <th style={cellHead}>Event</th>
              <th style={cellHead}>User ID</th>
              <th style={cellHead}>IP</th>
              <th style={cellHead}>Hash</th>
              <th style={cellHead}>Action</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((log) => (
              <tr key={log.id}>
                <td style={cell}>{new Date(log.created_at).toLocaleString()}</td>
                <td style={cell}>{log.event_type}</td>
                <td style={cell}>{log.user_id ?? '-'}</td>
                <td style={cell}>{log.ip_address ?? '-'}</td>
                <td style={cell}>{log.record_hash ? `${log.record_hash.slice(0, 12)}...` : '-'}</td>
                <td style={cell}>{log.action}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

const cellHead: CSSProperties = {
  textAlign: 'left',
  padding: '10px 8px',
  borderBottom: '1px solid #e5e7eb',
  fontSize: '0.85rem',
  color: '#374151',
};

const cell: CSSProperties = {
  padding: '10px 8px',
  borderBottom: '1px solid #f3f4f6',
  verticalAlign: 'top',
  fontSize: '0.9rem',
};

const styles: Record<string, CSSProperties> = {
  page: { maxWidth: 1100, margin: '0 auto', padding: 20 },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 12,
  },
  title: { margin: 0, fontSize: '1.6rem', color: '#111827' },
  subtitle: { margin: '6px 0 0 0', color: '#6b7280' },
  backLink: {
    textDecoration: 'none',
    border: '1px solid #d1d5db',
    borderRadius: 8,
    padding: '8px 12px',
    color: '#111827',
    background: '#fff',
    fontWeight: 600,
  },
  toolbar: { display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10, alignItems: 'center' },
  input: {
    padding: '8px 10px',
    border: '1px solid #cbd5e1',
    borderRadius: 8,
    background: '#fff',
    minWidth: 180,
  },
  primaryBtn: {
    padding: '8px 12px',
    borderRadius: 8,
    border: '1px solid #1d4ed8',
    background: '#1d4ed8',
    color: '#fff',
    fontWeight: 600,
    cursor: 'pointer',
  },
  secondaryBtn: {
    padding: '8px 12px',
    borderRadius: 8,
    border: '1px solid #475569',
    background: '#334155',
    color: '#fff',
    fontWeight: 600,
    cursor: 'pointer',
  },
  dangerBtn: {
    padding: '8px 12px',
    borderRadius: 8,
    border: '1px solid #991b1b',
    background: '#991b1b',
    color: '#fff',
    fontWeight: 600,
    cursor: 'pointer',
  },
  error: {
    color: '#991b1b',
    background: '#fef2f2',
    border: '1px solid #fecaca',
    borderRadius: 8,
    padding: '8px 10px',
    marginTop: 10,
  },
  success: {
    color: '#065f46',
    background: '#ecfdf5',
    border: '1px solid #a7f3d0',
    borderRadius: 8,
    padding: '8px 10px',
    marginTop: 10,
  },
  auditStatus: {
    color: '#1f2937',
    background: '#f8fafc',
    border: '1px solid #e2e8f0',
    borderRadius: 8,
    padding: '8px 10px',
    marginTop: 10,
  },
};
