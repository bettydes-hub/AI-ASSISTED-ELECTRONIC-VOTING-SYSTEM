'use client';

import { useState } from 'react';

import { getApiBase } from '../../../lib/apiBase';

export default function StationStatusPage() {
  const [status, setStatus] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState('');

  async function checkHealth() {
    setError('');
    try {
      const res = await fetch(`${getApiBase()}/health`);
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Health check failed');
        return;
      }
      setStatus(data);
    } catch {
      setError('Cannot connect to backend');
    }
  }

  return (
    <section>
      <h1>Station Status</h1>
      <p>Election Officer can monitor API health and local terminal readiness.</p>
      <button type="button" onClick={checkHealth}>
        Check Backend Health
      </button>
      {error ? <p>{error}</p> : null}
      {status ? <pre>{JSON.stringify(status, null, 2)}</pre> : null}
    </section>
  );
}
