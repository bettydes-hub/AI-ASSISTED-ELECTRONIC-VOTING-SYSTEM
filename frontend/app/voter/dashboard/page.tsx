'use client';

import Link from 'next/link';
import { useState } from 'react';

import { apiGet } from '../../../lib/apiClient';

export default function VoterDashboardPage() {
  const [voterId, setVoterId] = useState('');
  const [status, setStatus] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState('');

  async function checkStatus() {
    setError('');
    setStatus(null);
    if (!voterId) return;
    try {
      const data = await apiGet(`/voters/${voterId}/status`, 'Voter');
      setStatus(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed');
    }
  }

  return (
    <section>
      <h1>Voter Dashboard</h1>
      <div>
        <Link href="/voter/vote">Go to Vote</Link> | <Link href="/voter/status">View Status</Link> |{' '}
        <Link href="/voter/logout">Logout</Link>
      </div>
      <p>Check your registration and vote status.</p>
      <input value={voterId} onChange={(e) => setVoterId(e.target.value)} placeholder="Voter User ID" />
      <button type="button" onClick={checkStatus}>
        Check
      </button>
      {error ? <p>{error}</p> : null}
      {status ? <pre>{JSON.stringify(status, null, 2)}</pre> : null}
    </section>
  );
}
