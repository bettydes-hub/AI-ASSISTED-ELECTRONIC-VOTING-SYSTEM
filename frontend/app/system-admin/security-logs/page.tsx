'use client';

import { useState } from 'react';

import { apiGet } from '../../../lib/apiClient';

export default function SecurityLogsPage() {
  const [logs, setLogs] = useState<Record<string, unknown>[]>([]);
  const [error, setError] = useState('');

  async function loadLogs() {
    setError('');
    try {
      const data = await apiGet('/admin/security-logs', 'SystemAdmin');
      setLogs(data.items ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed');
    }
  }

  return (
    <section>
      <h1>Security Logs</h1>
      <button type="button" onClick={loadLogs}>
        Load Logs
      </button>
      {error ? <p>{error}</p> : null}
      <pre>{JSON.stringify(logs, null, 2)}</pre>
    </section>
  );
}
