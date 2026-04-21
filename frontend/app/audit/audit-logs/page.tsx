'use client';

import { useState } from 'react';

import { apiGet, apiPost } from '../../../lib/apiClient';

export default function AuditLogsPage() {
  const [electionId, setElectionId] = useState('');
  const [requestNote, setRequestNote] = useState('');
  const [logs, setLogs] = useState<Record<string, unknown>[]>([]);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function loadLogs() {
    setError('');
    setMessage('');
    try {
      const suffix = electionId ? `?election_id=${electionId}` : '';
      const data = await apiGet(`/audit/logs${suffix}`, 'AuditAuthority');
      setLogs(data.items ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed');
    }
  }

  async function requestAdditionalLogs() {
    setError('');
    setMessage('');
    try {
      const data = await apiPost('/audit/logs/request-additional', 'AuditAuthority', {
        election_id: Number(electionId),
        note: requestNote,
      });
      setMessage(data.message ?? 'Additional logs requested');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed');
    }
  }

  return (
    <section>
      <h1>Audit Logs</h1>
      <p>Read-only mode: review logs and request additional records.</p>
      <input
        value={electionId}
        onChange={(e) => setElectionId(e.target.value)}
        placeholder="Optional election id"
      />
      <button type="button" onClick={loadLogs}>
        Load Logs
      </button>
      <div style={{ marginTop: 12 }}>
        <input
          value={requestNote}
          onChange={(e) => setRequestNote(e.target.value)}
          placeholder="Reason for requesting additional logs"
        />
        <button type="button" onClick={requestAdditionalLogs} style={{ marginLeft: 8 }}>
          Request Additional Logs
        </button>
      </div>
      {error ? <p>{error}</p> : null}
      {message ? <p>{message}</p> : null}
      <pre>{JSON.stringify(logs, null, 2)}</pre>
    </section>
  );
}
