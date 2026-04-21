'use client';

import { useState } from 'react';

import { apiGet, apiPost } from '../../../lib/apiClient';

export default function AuditReportPage() {
  const [electionId, setElectionId] = useState('');
  const [summary, setSummary] = useState('');
  const [issues, setIssues] = useState('');
  const [overview, setOverview] = useState<Record<string, unknown> | null>(null);
  const [report, setReport] = useState<Record<string, unknown> | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function loadOverview() {
    setError('');
    setMessage('');
    setOverview(null);
    try {
      const data = await apiGet(`/audit/overview/${Number(electionId)}`, 'AuditAuthority');
      setOverview(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed');
    }
  }

  async function generateReport() {
    setError('');
    setMessage('');
    setReport(null);
    try {
      const data = await apiPost('/audit/reports/generate', 'AuditAuthority', {
        election_id: Number(electionId),
      });
      setReport(data.report ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed');
    }
  }

  async function submitReport() {
    setError('');
    setMessage('');
    try {
      const issuesList = issues
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
      const data = await apiPost('/audit/reports/submit', 'AuditAuthority', {
        election_id: Number(electionId),
        summary,
        issues: issuesList,
      });
      setMessage(data.message ?? 'Report submitted');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed');
    }
  }

  return (
    <section>
      <h1>Generate Audit Report</h1>
      <p>Read-only review mode for integrity and transparency checks.</p>
      <input
        value={electionId}
        onChange={(e) => setElectionId(e.target.value)}
        placeholder="Election ID"
      />
      <button type="button" onClick={loadOverview} style={{ marginLeft: 8 }}>
        Load Integrity Overview
      </button>
      <button type="button" onClick={generateReport}>
        Generate
      </button>
      <div style={{ marginTop: 12 }}>
        <input
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          placeholder="Audit summary for submission"
        />
        <input
          value={issues}
          onChange={(e) => setIssues(e.target.value)}
          placeholder="Issues (comma separated)"
        />
        <button type="button" onClick={submitReport}>
          Submit Audit Report
        </button>
      </div>
      {error ? <p>{error}</p> : null}
      {message ? <p>{message}</p> : null}
      {overview ? <pre>{JSON.stringify(overview, null, 2)}</pre> : null}
      {report ? <pre>{JSON.stringify(report, null, 2)}</pre> : null}
    </section>
  );
}
