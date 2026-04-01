'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

type Election = {
  id: number;
  title: string;
  description: string;
  status: 'DRAFT' | 'ACTIVE' | 'COMPLETED';
};

type Summary = {
  total_elections: number;
  draft_elections: number;
  active_elections: number;
  completed_elections: number;
  total_parties: number;
  total_candidates: number;
};

const API_BASE = 'http://localhost:5000/api';
const roleHeaders = { 'X-Role': 'ElectionBoard' };

export default function ElectionBoardDashboardPage() {
  const [items, setItems] = useState<Election[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function loadElections() {
    setLoading(true);
    setError('');
    try {
      const [electionsRes, summaryRes] = await Promise.all([
        fetch(`${API_BASE}/elections`, { headers: roleHeaders }),
        fetch(`${API_BASE}/dashboard/election-board/summary`, { headers: roleHeaders }),
      ]);

      const electionsData = await electionsRes.json();
      const summaryData = await summaryRes.json();

      if (!electionsRes.ok) {
        setError(electionsData.error ?? 'Failed to load elections');
        return;
      }
      if (!summaryRes.ok) {
        setError(summaryData.error ?? 'Failed to load summary');
        return;
      }

      setItems(electionsData.items ?? []);
      setSummary(summaryData);
    } catch {
      setError('Cannot connect to backend');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadElections();
  }, []);

  return (
    <section>
      <h1>Election Board Dashboard</h1>
      <p>Manage election setup and final result approval.</p>

      <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
        <Link href="/election-board/election-setup">Go to Election Setup</Link>
        <Link href="/election-board/election-results">Go to Election Results</Link>
        <button onClick={loadElections} type="button">
          Refresh
        </button>
      </div>

      {loading ? <p>Loading elections...</p> : null}
      {error ? <p>{error}</p> : null}

      {!loading && items.length === 0 ? <p>No elections yet.</p> : null}

      {summary ? (
        <div style={{ marginBottom: 16 }}>
          <h2>Summary</h2>
          <ul>
            <li>Total elections: {summary.total_elections}</li>
            <li>Draft elections: {summary.draft_elections}</li>
            <li>Active elections: {summary.active_elections}</li>
            <li>Completed elections: {summary.completed_elections}</li>
            <li>Total parties: {summary.total_parties}</li>
            <li>Total candidates: {summary.total_candidates}</li>
          </ul>
        </div>
      ) : null}

      <ul>
        {items.map((item) => (
          <li key={item.id}>
            #{item.id} - {item.title} ({item.status}) - {item.description || 'No description'}
          </li>
        ))}
      </ul>
    </section>
  );
}
