'use client';

import { useState } from 'react';

import { apiGet } from '../../../lib/apiClient';

export default function VoterStatusPage() {
  const [voterId, setVoterId] = useState('');
  const [status, setStatus] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState('');

  async function loadStatus() {
    setError('');
    setStatus(null);
    try {
      const data = await apiGet(`/voters/${voterId}/status`, 'Voter');
      setStatus(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed');
    }
  }

  return (
    <section>
      <h1>Voter Status</h1>
      <input value={voterId} onChange={(e) => setVoterId(e.target.value)} placeholder="Voter User ID" />
      <button type="button" onClick={loadStatus}>
        Load
      </button>
      {error ? <p>{error}</p> : null}
      {status ? <pre>{JSON.stringify(status, null, 2)}</pre> : null}
    </section>
  );
}
