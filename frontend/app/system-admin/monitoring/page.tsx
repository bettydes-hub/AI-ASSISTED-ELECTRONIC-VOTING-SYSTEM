'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { CSSProperties } from 'react';

import { apiGet } from '../../../lib/apiClient';

type MonitoringData = {
  health: {
    status: string;
    suspended: boolean;
    last_integrity_check: string | null;
    last_backup_restore: string | null;
  };
  performance_metrics: {
    server_time: string;
    uptime_seconds: number;
    active_users: number;
    failure_count: number;
    alerts_count: number;
  };
  security_events: Array<{ message: string; severity: string; source: string; created_at: string }>;
  suspicious_attempts: Array<{
    id: number;
    event_type: string;
    action: string;
    ip_address?: string;
    created_at: string;
  }>;
};

export default function MonitoringPage() {
  const [data, setData] = useState<MonitoringData | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);

  async function load() {
    setError('');
    setLoading(true);
    try {
      const res = await apiGet('/system/monitoring/overview', 'SystemAdmin');
      setData(res as MonitoringData);
      setLastUpdatedAt(new Date().toLocaleTimeString());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (!autoRefresh) return;
    const timer = setInterval(() => {
      load();
    }, 10000);
    return () => clearInterval(timer);
  }, [autoRefresh]);

  return (
    <section style={styles.page}>
      <header style={styles.header}>
        <div>
          <h1 style={styles.title}>Monitoring Dashboard</h1>
          <p style={styles.subtitle}>View system health, performance metrics, and security activity in one place.</p>
        </div>
        <Link href="/system-admin/dashboard" style={styles.backLink}>
          Back to Dashboard
        </Link>
      </header>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
      <button type="button" onClick={load} style={styles.refreshBtn}>
        {loading ? 'Refreshing...' : 'Refresh'}
      </button>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <input type="checkbox" checked={autoRefresh} onChange={(e) => setAutoRefresh(e.target.checked)} />
          Auto-refresh every 10 seconds
        </label>
        <span style={{ color: '#4b5563', fontSize: '0.9rem' }}>
          Last updated: {lastUpdatedAt ?? 'Not yet'}
        </span>
      </div>
      {error ? <p style={styles.error}>{error}</p> : null}
      {!data ? null : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 12, marginTop: 12 }}>
            <InfoCard label="Health Status" value={data.health.status} />
            <InfoCard label="Suspended" value={String(data.health.suspended)} />
            <InfoCard label="Uptime (seconds)" value={String(data.performance_metrics.uptime_seconds)} />
            <InfoCard label="Active Sessions/Users" value={String(data.performance_metrics.active_users)} />
            <InfoCard label="Failures" value={String(data.performance_metrics.failure_count)} />
            <InfoCard label="Security Alerts" value={String(data.performance_metrics.alerts_count)} />
          </div>

          <h2 style={{ marginTop: 18 }}>Security Events</h2>
          {data.security_events.length === 0 ? (
            <p>No security events.</p>
          ) : (
            <ul>
              {data.security_events.slice(0, 20).map((event, idx) => (
                <li key={`${event.created_at}-${idx}`}>
                  <strong>{new Date(event.created_at).toLocaleString()}</strong> [{event.severity}] {event.message}
                </li>
              ))}
            </ul>
          )}

          <h2 style={{ marginTop: 18 }}>Suspicious Attempts</h2>
          {data.suspicious_attempts.length === 0 ? (
            <p>No suspicious attempts detected.</p>
          ) : (
            <ul>
              {data.suspicious_attempts.map((item) => (
                <li key={item.id}>
                  <strong>{new Date(item.created_at).toLocaleString()}</strong> ({item.event_type}) {item.action}
                  {item.ip_address ? ` [${item.ip_address}]` : ''}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}

function InfoCard(props: { label: string; value: string }) {
  return (
    <div style={{ border: '1px solid #e5e7eb', borderRadius: 10, padding: 12, background: '#fff' }}>
      <div style={{ fontSize: 12, color: '#6b7280', textTransform: 'uppercase' }}>{props.label}</div>
      <div style={{ marginTop: 6, fontWeight: 700 }}>{props.value}</div>
    </div>
  );
}

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
  refreshBtn: {
    border: '1px solid #1d4ed8',
    background: '#1d4ed8',
    color: '#fff',
    borderRadius: 8,
    padding: '8px 12px',
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
};
