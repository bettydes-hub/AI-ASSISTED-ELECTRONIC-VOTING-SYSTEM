'use client';

import Link from 'next/link';
import { CSSProperties, FormEvent, useMemo, useState } from 'react';

import { apiPatch } from '../../../lib/apiClient';

type AccessLevels = Record<string, string[]>;
type SystemParameters = {
  max_login_attempts: number;
  session_timeout_minutes: number;
  api_rate_limit_per_minute: number;
};

const DEFAULT_ACCESS_LEVELS: AccessLevels = {
  SystemAdmin: ['system_config', 'maintenance', 'security_logs', 'user_management'],
  ElectionBoard: ['election_setup', 'results_review'],
  ElectionOfficer: ['voter_registration', 'station_operations'],
  AuditAuthority: ['audit_logs', 'audit_reports'],
  Voter: ['vote', 'status'],
};

const DEFAULT_SYSTEM_PARAMETERS: SystemParameters = {
  max_login_attempts: 5,
  session_timeout_minutes: 30,
  api_rate_limit_per_minute: 120,
};

export default function SystemSettingsPage() {
  const [accessLevels, setAccessLevels] = useState<AccessLevels>(DEFAULT_ACCESS_LEVELS);
  const [systemParameters, setSystemParameters] = useState<SystemParameters>(DEFAULT_SYSTEM_PARAMETERS);
  const [advancedMode, setAdvancedMode] = useState(false);
  const [accessLevelsText, setAccessLevelsText] = useState(JSON.stringify(DEFAULT_ACCESS_LEVELS, null, 2));
  const [systemParametersText, setSystemParametersText] = useState(
    JSON.stringify(DEFAULT_SYSTEM_PARAMETERS, null, 2),
  );
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const roleOrder = useMemo(
    () => ['SystemAdmin', 'ElectionBoard', 'ElectionOfficer', 'AuditAuthority', 'Voter'],
    [],
  );

  function updateAccessLevel(role: string, value: string) {
    const tokens = value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
    setAccessLevels((prev) => ({ ...prev, [role]: tokens }));
  }

  function normalizePositiveInt(value: number, fallback: number): number {
    if (!Number.isFinite(value)) return fallback;
    const parsed = Math.round(value);
    return parsed > 0 ? parsed : fallback;
  }

  async function saveSettings(event: FormEvent) {
    event.preventDefault();
    setError('');
    setMessage('');
    setSaving(true);
    try {
      let nextAccessLevels = accessLevels;
      let nextSystemParameters = systemParameters;
      if (advancedMode) {
        nextAccessLevels = JSON.parse(accessLevelsText) as AccessLevels;
        nextSystemParameters = JSON.parse(systemParametersText) as SystemParameters;
      }
      const payload = { access_levels: nextAccessLevels, system_parameters: nextSystemParameters };
      const data = await apiPatch('/system/settings', 'SystemAdmin', payload);
      setAccessLevels(nextAccessLevels);
      setSystemParameters(nextSystemParameters);
      setAccessLevelsText(JSON.stringify(nextAccessLevels, null, 2));
      setSystemParametersText(JSON.stringify(nextSystemParameters, null, 2));
      setMessage(data.message ?? 'Settings updated');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <section style={styles.page}>
      <header style={styles.header}>
        <div>
          <h1 style={styles.title}>System Settings</h1>
          <p style={styles.subtitle}>Set role permissions and key limits without editing raw code.</p>
        </div>
        <Link href="/system-admin/dashboard" style={styles.backLink}>
          Back to Dashboard
        </Link>
      </header>
      {error ? <p style={styles.error}>{error}</p> : null}
      {message ? <p style={styles.success}>{message}</p> : null}
      <form onSubmit={saveSettings} style={styles.form}>
        <section style={styles.card}>
          <h2 style={styles.cardTitle}>System Parameters</h2>
          <div style={styles.grid}>
            <label style={styles.label}>
              <span>Max login attempts</span>
              <input
                type="number"
                min={1}
                value={systemParameters.max_login_attempts}
                onChange={(e) =>
                  setSystemParameters((prev) => ({
                    ...prev,
                    max_login_attempts: normalizePositiveInt(
                      Number(e.target.value),
                      prev.max_login_attempts,
                    ),
                  }))
                }
                style={styles.input}
              />
            </label>
            <label style={styles.label}>
              <span>Session timeout (minutes)</span>
              <input
                type="number"
                min={1}
                value={systemParameters.session_timeout_minutes}
                onChange={(e) =>
                  setSystemParameters((prev) => ({
                    ...prev,
                    session_timeout_minutes: normalizePositiveInt(
                      Number(e.target.value),
                      prev.session_timeout_minutes,
                    ),
                  }))
                }
                style={styles.input}
              />
            </label>
            <label style={styles.label}>
              <span>API rate limit per minute</span>
              <input
                type="number"
                min={1}
                value={systemParameters.api_rate_limit_per_minute}
                onChange={(e) =>
                  setSystemParameters((prev) => ({
                    ...prev,
                    api_rate_limit_per_minute: normalizePositiveInt(
                      Number(e.target.value),
                      prev.api_rate_limit_per_minute,
                    ),
                  }))
                }
                style={styles.input}
              />
            </label>
          </div>
        </section>

        <section style={styles.card}>
          <h2 style={styles.cardTitle}>Role Access Levels</h2>
          <p style={styles.helpText}>
            Enter comma-separated permissions for each role (example: <code>maintenance, security_logs</code>).
          </p>
          <div style={styles.grid}>
            {roleOrder.map((role) => (
              <label key={role} style={styles.label}>
                <span>{role}</span>
                <input
                  value={(accessLevels[role] ?? []).join(', ')}
                  onChange={(e) => updateAccessLevel(role, e.target.value)}
                  style={styles.input}
                />
              </label>
            ))}
          </div>
        </section>

        <section style={styles.card}>
          <label style={styles.toggleLabel}>
            <input
              type="checkbox"
              checked={advancedMode}
              onChange={(e) => {
                const next = e.target.checked;
                setAdvancedMode(next);
                if (next) {
                  setAccessLevelsText(JSON.stringify(accessLevels, null, 2));
                  setSystemParametersText(JSON.stringify(systemParameters, null, 2));
                }
              }}
            />
            <span>Show Advanced JSON</span>
          </label>

          {advancedMode ? (
            <div style={styles.grid}>
              <label style={styles.label}>
                <span>Access Levels JSON</span>
                <textarea
                  value={accessLevelsText}
                  onChange={(e) => setAccessLevelsText(e.target.value)}
                  rows={10}
                  style={styles.textarea}
                />
              </label>
              <label style={styles.label}>
                <span>System Parameters JSON</span>
                <textarea
                  value={systemParametersText}
                  onChange={(e) => setSystemParametersText(e.target.value)}
                  rows={8}
                  style={styles.textarea}
                />
              </label>
            </div>
          ) : (
            <p style={styles.helpText}>Advanced JSON is hidden.</p>
          )}
        </section>

        <button type="submit" style={styles.button} disabled={saving}>
          {saving ? 'Saving...' : 'Save Settings'}
        </button>
      </form>
    </section>
  );
}

const styles: Record<string, CSSProperties> = {
  page: {
    maxWidth: 1000,
    margin: '0 auto',
    padding: 20,
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 10,
  },
  title: {
    margin: 0,
    fontSize: '1.6rem',
    color: '#111827',
  },
  subtitle: {
    color: '#4b5563',
    margin: '6px 0 0 0',
  },
  backLink: {
    textDecoration: 'none',
    border: '1px solid #d1d5db',
    borderRadius: 8,
    padding: '8px 12px',
    color: '#111827',
    background: '#fff',
    fontWeight: 600,
  },
  form: {
    display: 'grid',
    gap: 14,
  },
  card: {
    border: '1px solid #e5e7eb',
    borderRadius: 12,
    padding: 14,
    background: '#fff',
  },
  cardTitle: {
    marginTop: 0,
  },
  grid: {
    display: 'grid',
    gap: 10,
  },
  label: {
    display: 'grid',
    gap: 6,
    color: '#111827',
    fontSize: '0.92rem',
  },
  input: {
    border: '1px solid #cbd5e1',
    borderRadius: 8,
    padding: '8px 10px',
    fontSize: '0.95rem',
  },
  textarea: {
    border: '1px solid #cbd5e1',
    borderRadius: 8,
    padding: '8px 10px',
    fontSize: '0.9rem',
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
  },
  button: {
    width: 'fit-content',
    padding: '9px 14px',
    borderRadius: 8,
    border: '1px solid #1d4ed8',
    background: '#1d4ed8',
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
  },
  success: {
    color: '#065f46',
    background: '#ecfdf5',
    border: '1px solid #a7f3d0',
    borderRadius: 8,
    padding: '8px 10px',
  },
  helpText: {
    color: '#4b5563',
    marginTop: 0,
  },
  toggleLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    fontWeight: 600,
    marginBottom: 8,
  },
};
