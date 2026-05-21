'use client';

import { CSSProperties, useEffect, useState } from 'react';
import Link from 'next/link';
import { apiGet } from '../../../lib/apiClient';

type DashboardCard = {
  title: string;
  description: string;
  href: string;
  action: string;
  tone: 'blue' | 'indigo' | 'orange' | 'green' | 'red';
};

const DASHBOARD_CARDS: DashboardCard[] = [
  {
    title: 'User Management',
    description: 'Create user accounts, edit details, assign roles, and deactivate accounts safely.',
    href: '/system-admin/user-management',
    action: 'Manage Users',
    tone: 'blue',
  },
  {
    title: 'Security Logs',
    description: 'Review recent admin actions and system events for auditing and incident tracking.',
    href: '/system-admin/security-logs',
    action: 'View Logs',
    tone: 'indigo',
  },
  {
    title: 'Maintenance',
    description: 'Run maintenance operations, monitor service status, and keep the platform stable.',
    href: '/system-admin/maintenance',
    action: 'Open Maintenance',
    tone: 'orange',
  },
  {
    title: 'System Settings',
    description: 'Configure platform behavior and core settings used across the voting system.',
    href: '/system-admin/system-settings',
    action: 'Configure Settings',
    tone: 'green',
  },
  {
    title: 'Monitoring Dashboard',
    description: 'Track system health, uptime, active sessions, failures, and suspicious security attempts.',
    href: '/system-admin/monitoring',
    action: 'Open Monitoring',
    tone: 'red',
  },
  {
    title: 'Logout',
    description: 'End your System Admin session securely and return to the login page.',
    href: '/system-admin/logout',
    action: 'Logout',
    tone: 'indigo',
  },
];

export default function SystemAdminDashboardPage() {
  const [overview, setOverview] = useState<{
    users?: {
      total: number;
      active: number;
      disabled: number;
      pending_password_change: number;
    };
    recent_credential_resets?: Array<{
      id: number;
      action: string;
      created_at: string;
    }>;
  } | null>(null);

  useEffect(() => {
    apiGet('/admin/monitoring/overview', 'SystemAdmin')
      .then((data) => setOverview(data))
      .catch(() => setOverview(null));
  }, []);

  return (
    <section style={styles.page}>
      <header style={styles.header}>
        <h1 style={styles.title}>System Admin Dashboard</h1>
        <p style={styles.subtitle}>
          Welcome. Choose an area below to manage users, security, maintenance, and platform settings.
        </p>
      </header>

      <div style={styles.quickInfo}>
        <div style={styles.infoCard}>
          <strong style={styles.infoLabel}>Role</strong>
          <span>System Administrator</span>
        </div>
        <div style={styles.infoCard}>
          <strong style={styles.infoLabel}>Main Responsibility</strong>
          <span>Securely manage accounts and system operations</span>
        </div>
        <div style={styles.infoCard}>
          <strong style={styles.infoLabel}>Total Users</strong>
          <span>{overview?.users?.total ?? '-'}</span>
        </div>
        <div style={styles.infoCard}>
          <strong style={styles.infoLabel}>Pending Password Change</strong>
          <span>{overview?.users?.pending_password_change ?? '-'}</span>
        </div>
      </div>

      <div style={styles.grid}>
        {DASHBOARD_CARDS.map((card) => (
          <article key={card.href} style={{ ...styles.card, ...toneStyles[card.tone] }}>
            <h2 style={styles.cardTitle}>{card.title}</h2>
            <p style={styles.cardDescription}>{card.description}</p>
            <Link href={card.href} style={styles.cardLink}>
              {card.action}
            </Link>
          </article>
        ))}
      </div>

      <section style={styles.monitoringCard}>
        <h2 style={styles.cardTitle}>Monitoring Dashboard - Recent Credential Resets</h2>
        {!overview?.recent_credential_resets?.length ? (
          <p style={styles.cardDescription}>No credential reset events yet.</p>
        ) : (
          <ul style={styles.resetList}>
            {overview.recent_credential_resets.map((item) => (
              <li key={item.id} style={styles.resetItem}>
                <strong>{new Date(item.created_at).toLocaleString()}</strong> - {item.action}
              </li>
            ))}
          </ul>
        )}
      </section>
    </section>
  );
}

const styles: Record<string, CSSProperties> = {
  page: {
    maxWidth: '1100px',
    margin: '0 auto',
    padding: '24px 20px',
  },
  header: {
    marginBottom: '18px',
  },
  title: {
    margin: 0,
    fontSize: '1.8rem',
    color: '#111827',
  },
  subtitle: {
    margin: '8px 0 0 0',
    color: '#6b7280',
    fontSize: '1rem',
    maxWidth: '760px',
  },
  quickInfo: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
    gap: '12px',
    marginBottom: '16px',
  },
  infoCard: {
    border: '1px solid #e5e7eb',
    borderRadius: '10px',
    background: '#fff',
    padding: '12px',
    display: 'grid',
    gap: '4px',
  },
  infoLabel: {
    fontSize: '0.78rem',
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    color: '#6b7280',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
    gap: '14px',
  },
  card: {
    borderRadius: '12px',
    border: '1px solid #e5e7eb',
    background: '#fff',
    padding: '14px',
    boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
    display: 'grid',
    gap: '10px',
  },
  cardTitle: {
    margin: 0,
    fontSize: '1.05rem',
    color: '#111827',
  },
  cardDescription: {
    margin: 0,
    color: '#4b5563',
    fontSize: '0.92rem',
    lineHeight: 1.4,
    minHeight: '58px',
  },
  cardLink: {
    display: 'inline-block',
    textDecoration: 'none',
    borderRadius: '8px',
    border: '1px solid #d1d5db',
    background: '#fff',
    color: '#111827',
    padding: '8px 10px',
    fontWeight: 600,
    width: 'fit-content',
  },
  monitoringCard: {
    marginTop: '18px',
    borderRadius: '12px',
    border: '1px solid #e5e7eb',
    background: '#fff',
    padding: '14px',
  },
  resetList: {
    margin: 0,
    paddingLeft: '18px',
    display: 'grid',
    gap: '6px',
  },
  resetItem: {
    color: '#1f2937',
    fontSize: '0.92rem',
  },
};

const toneStyles: Record<DashboardCard['tone'], CSSProperties> = {
  blue: {
    borderTop: '4px solid #2563eb',
  },
  indigo: {
    borderTop: '4px solid #4f46e5',
  },
  orange: {
    borderTop: '4px solid #ea580c',
  },
  green: {
    borderTop: '4px solid #16a34a',
  },
  red: {
    borderTop: '4px solid #dc2626',
  },
};
