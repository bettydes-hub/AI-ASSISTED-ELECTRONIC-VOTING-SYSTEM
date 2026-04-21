'use client';

import { useState } from 'react';

import { apiGet } from '../../../lib/apiClient';

export default function ElectionOfficerVotersPage() {
  const [items, setItems] = useState<Record<string, unknown>[]>([]);
  const [error, setError] = useState('');

  async function loadVoters() {
    setError('');
    try {
      const data = await apiGet('/voters', 'ElectionOfficer');
      setItems(data.items ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed');
    }
  }

  return (
    <section>
      <h1>Registered Voters</h1>
      <button type="button" onClick={loadVoters}>
        Load Voters
      </button>
      {error ? <p>{error}</p> : null}
      <pre>{JSON.stringify(items, null, 2)}</pre>
    </section>
  );
}
