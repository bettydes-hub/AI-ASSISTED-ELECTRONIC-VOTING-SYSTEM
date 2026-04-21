'use client';

import { FormEvent, useState } from 'react';

import { apiPatch } from '../../../lib/apiClient';

export default function SystemSettingsPage() {
  const [accessLevels, setAccessLevels] = useState(
    JSON.stringify(
      {
        SystemAdmin: ['system_config', 'maintenance', 'security_logs', 'user_management'],
        ElectionBoard: ['election_setup', 'results_review'],
        ElectionOfficer: ['voter_registration', 'station_operations'],
        AuditAuthority: ['audit_logs', 'audit_reports'],
        Voter: ['vote', 'status'],
      },
      null,
      2,
    ),
  );
  const [systemParameters, setSystemParameters] = useState(
    JSON.stringify(
      {
        max_login_attempts: 5,
        session_timeout_minutes: 30,
        api_rate_limit_per_minute: 120,
      },
      null,
      2,
    ),
  );
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function saveSettings(event: FormEvent) {
    event.preventDefault();
    setError('');
    setMessage('');
    try {
      const payload = {
        access_levels: JSON.parse(accessLevels),
        system_parameters: JSON.parse(systemParameters),
      };
      const data = await apiPatch('/system/settings', 'SystemAdmin', payload);
      setMessage(data.message ?? 'Settings updated');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed');
    }
  }

  return (
    <section>
      <h1>System Settings</h1>
      <p>Configure access levels and system parameters for maintenance operations.</p>
      {error ? <p>{error}</p> : null}
      {message ? <p>{message}</p> : null}
      <form onSubmit={saveSettings}>
        <label htmlFor="access-levels">Access Levels JSON</label>
        <textarea
          id="access-levels"
          value={accessLevels}
          onChange={(e) => setAccessLevels(e.target.value)}
          rows={10}
        />
        <label htmlFor="system-parameters">System Parameters JSON</label>
        <textarea
          id="system-parameters"
          value={systemParameters}
          onChange={(e) => setSystemParameters(e.target.value)}
          rows={8}
        />
        <button type="submit">Save Settings</button>
      </form>
    </section>
  );
}
