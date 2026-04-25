'use client';

import { useEffect, useState } from 'react';

import { apiGet, apiPost } from '../../../lib/apiClient';
import { OfficerPageHeader, OfficerStatusNotice } from '../../../components/officer/OfficerUi';
import { mapOfficerApiError } from '../../../lib/electionOfficerApi';

type Election = { id: number; title: string; status: 'DRAFT' | 'ACTIVE' | 'COMPLETED' };
type ResultRow = {
  candidate_id: number;
  candidate_name: string;
  party_name: string;
  total_votes: number;
};
type ResultPayload = {
  election_id: number;
  election_title: string;
  election_status: string;
  fetched_at?: string;
  rows: ResultRow[];
  total_votes_cast: number;
  abstentions: number;
  counted_candidate_votes: number;
};
type PrintActionPayload = {
  error?: string;
  message?: string;
  print_result?: { status?: string; printed_at?: string };
  export_fallback?: { exported_at?: string };
};

export default function ElectionOfficerResultsPage() {
  const [elections, setElections] = useState<Election[]>([]);
  const [selectedElectionId, setSelectedElectionId] = useState<number | null>(null);
  const [result, setResult] = useState<ResultPayload | null>(null);
  const [signedBy, setSignedBy] = useState('');
  const [discrepancyReason, setDiscrepancyReason] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [isLoadingElections, setIsLoadingElections] = useState(false);
  const [isLoadingResult, setIsLoadingResult] = useState(false);
  const [activeAction, setActiveAction] = useState('');
  const [signedAt, setSignedAt] = useState('');
  const [submittedAt, setSubmittedAt] = useState('');
  const [discrepancyCategory, setDiscrepancyCategory] = useState<'COUNT_MISMATCH' | 'INVALID_RECORD' | 'OTHER'>('COUNT_MISMATCH');
  const [discrepancySeverity, setDiscrepancySeverity] = useState<'LOW' | 'MEDIUM' | 'HIGH'>('MEDIUM');

  async function loadElections() {
    setIsLoadingElections(true);
    try {
      const data = (await apiGet('/results/elections/closed', 'ElectionOfficer')) as { items?: Election[] };
      const items: Election[] = (data.items as Election[]) ?? [];
      setElections(items);
      if (!selectedElectionId && items.length > 0) setSelectedElectionId(items[0].id);
    } catch (err) {
      setError(mapOfficerApiError(err));
    } finally {
      setIsLoadingElections(false);
    }
  }

  async function loadResult(electionId: number) {
    setMessage('');
    setError('');
    setIsLoadingResult(true);
    try {
      const data = (await apiGet(`/results/${electionId}`, 'ElectionOfficer')) as ResultPayload;
      setResult(data as ResultPayload);
      setSignedAt('');
      setSubmittedAt('');
    } catch (err) {
      setResult(null);
      setError(mapOfficerApiError(err));
    } finally {
      setIsLoadingResult(false);
    }
  }

  useEffect(() => {
    loadElections().catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!selectedElectionId) return;
    loadResult(selectedElectionId).catch(() => undefined);
  }, [selectedElectionId]);

  async function printResults(forceFail = false) {
    if (!selectedElectionId) return;
    setMessage('');
    setError('');
    setActiveAction(forceFail ? 'simulate-print-failure' : 'print');
    try {
      const data = (await apiPost(`/results/${selectedElectionId}/print`, 'ElectionOfficer', {
        force_fail: forceFail,
      })) as PrintActionPayload;
      if (data.print_result?.status === 'print_failed') {
        setMessage(
          `Print failed. Export fallback generated at ${String(data.export_fallback?.exported_at ?? 'unknown time')}.`,
        );
        return;
      }
      setMessage(`Printed successfully at ${String(data.print_result?.printed_at ?? 'unknown time')}.`);
    } catch (err) {
      setError(mapOfficerApiError(err));
    } finally {
      setActiveAction('');
    }
  }

  async function signResults() {
    if (!selectedElectionId) return;
    if (!signedBy.trim()) {
      setError('Officer signature name is required before signing.');
      setMessage('');
      return;
    }
    setMessage('');
    setError('');
    setActiveAction('sign');
    try {
      const data = await apiPost(`/results/${selectedElectionId}/sign`, 'ElectionOfficer', { signed_by: signedBy });
      setMessage(String(data.message ?? 'Results signed.'));
      setSignedAt(new Date().toLocaleString());
    } catch (err) {
      setError(mapOfficerApiError(err));
    } finally {
      setActiveAction('');
    }
  }

  async function submitToBoard() {
    if (!selectedElectionId) return;
    if (!signedBy.trim()) {
      setError('Officer signature name is required before submitting to board.');
      setMessage('');
      return;
    }
    if (!signedAt) {
      setError('Sign results first before submitting to Election Board.');
      setMessage('');
      return;
    }
    if (!window.confirm('Submit signed results to Election Board now?')) {
      return;
    }
    setMessage('');
    setError('');
    setActiveAction('submit');
    try {
      const data = await apiPost(`/results/${selectedElectionId}/submit-to-board`, 'ElectionOfficer', {
        signed_by: signedBy,
      });
      setMessage(String(data.message ?? 'Signed results submitted to Election Board.'));
      setSubmittedAt(new Date().toLocaleString());
    } catch (err) {
      setError(mapOfficerApiError(err));
    } finally {
      setActiveAction('');
    }
  }

  async function reportDiscrepancy() {
    if (!selectedElectionId) return;
    if (!discrepancyReason.trim()) {
      setError('Discrepancy reason is required.');
      setMessage('');
      return;
    }
    if (!window.confirm('Report this discrepancy and trigger audit process?')) {
      return;
    }
    setMessage('');
    setError('');
    setActiveAction('report');
    try {
      const reason = `[${discrepancyCategory}/${discrepancySeverity}] ${discrepancyReason.trim()}`;
      const data = await apiPost(`/results/${selectedElectionId}/report-discrepancy`, 'ElectionOfficer', {
        reason,
      });
      setMessage(String(data.message ?? 'Discrepancy reported. Audit process triggered.'));
      setDiscrepancyReason('');
    } catch (err) {
      setError(mapOfficerApiError(err));
    } finally {
      setActiveAction('');
    }
  }

  const totalCountedWithAbstentions = (result?.counted_candidate_votes ?? 0) + (result?.abstentions ?? 0);
  const isCountConsistent = result ? totalCountedWithAbstentions === result.total_votes_cast : true;
  const topCandidate = result?.rows.length
    ? [...result.rows].sort((a, b) => b.total_votes - a.total_votes)[0]
    : null;

  return (
    <section>
      <OfficerPageHeader
        title="Result Viewing and Verification"
        subtitle="Review final tallies, print/export records, sign reports, and submit verified outcomes."
      />
      {error ? <OfficerStatusNotice tone="error">{error}</OfficerStatusNotice> : null}
      {message ? <OfficerStatusNotice tone="success">{message}</OfficerStatusNotice> : null}

      <div className="panel">
        <h3>1) Choose Completed Election</h3>
        <div className="panel-grid">
          <div className="form-row">
            <label htmlFor="selectedElection">Select Election</label>
            <select
              id="selectedElection"
              value={selectedElectionId ?? ''}
              onChange={(e) => setSelectedElectionId(Number(e.target.value))}
              disabled={isLoadingElections}
            >
              <option value="" disabled>
                Select
              </option>
              {elections.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.title} ({item.status})
                </option>
              ))}
            </select>
          </div>
          <div className="toolbar">
            <button type="button" onClick={() => loadElections().catch(() => undefined)}>
              {isLoadingElections ? 'Refreshing...' : 'Refresh Elections'}
            </button>
            <button
              type="button"
              onClick={() => selectedElectionId && loadResult(selectedElectionId).catch(() => undefined)}
              disabled={!selectedElectionId || isLoadingResult}
            >
              {isLoadingResult ? 'Loading Result...' : 'Reload Result'}
            </button>
          </div>
        </div>
      </div>

      <div className="panel results-command-bar">
        <h3>2) Verification Actions</h3>
        <div className="panel-grid">
          <div className="panel">
            <h4>Print & Archive</h4>
            <div className="toolbar">
              <button type="button" onClick={() => printResults(false)} disabled={!selectedElectionId || activeAction !== ''}>
                {activeAction === 'print' ? 'Printing...' : 'Print Results'}
              </button>
              <button
                type="button"
                onClick={() => printResults(true)}
                disabled={!selectedElectionId || activeAction !== ''}
              >
                {activeAction === 'simulate-print-failure' ? 'Running...' : 'Test Print Fallback'}
              </button>
            </div>
          </div>
          <div className="panel">
            <h4>Sign & Submit</h4>
            <div className="form-row">
              <label htmlFor="signedBy">Officer Name / Signature</label>
              <input
                id="signedBy"
                value={signedBy}
                onChange={(e) => setSignedBy(e.target.value)}
                placeholder="Enter signing officer name"
              />
            </div>
            <div className="toolbar">
              <button type="button" onClick={signResults} disabled={!selectedElectionId || activeAction !== ''}>
                {activeAction === 'sign' ? 'Signing...' : 'Sign Results'}
              </button>
              <button
                type="button"
                onClick={submitToBoard}
                disabled={!selectedElectionId || !signedAt || activeAction !== ''}
              >
                {activeAction === 'submit' ? 'Submitting...' : 'Submit to Election Board'}
              </button>
            </div>
            <p className="small muted">
              {signedAt ? `Signed at ${signedAt}` : 'Sign is required before board submission.'}
            </p>
            {submittedAt ? <p className="small muted">Submitted at {submittedAt}</p> : null}
          </div>
        </div>
      </div>

      <div className="panel">
        <h3>3) Report Discrepancy</h3>
        <div className="panel-grid">
          <div className="form-row">
            <label htmlFor="discrepancyCategory">Category</label>
            <select
              id="discrepancyCategory"
              value={discrepancyCategory}
              onChange={(e) => setDiscrepancyCategory(e.target.value as 'COUNT_MISMATCH' | 'INVALID_RECORD' | 'OTHER')}
            >
              <option value="COUNT_MISMATCH">Count Mismatch</option>
              <option value="INVALID_RECORD">Invalid Record</option>
              <option value="OTHER">Other</option>
            </select>
          </div>
          <div className="form-row">
            <label htmlFor="discrepancySeverity">Severity</label>
            <select
              id="discrepancySeverity"
              value={discrepancySeverity}
              onChange={(e) => setDiscrepancySeverity(e.target.value as 'LOW' | 'MEDIUM' | 'HIGH')}
            >
              <option value="LOW">Low</option>
              <option value="MEDIUM">Medium</option>
              <option value="HIGH">High</option>
            </select>
          </div>
        </div>
        <div className="form-row">
          <label htmlFor="discrepancyReason">Reason</label>
          <textarea
            id="discrepancyReason"
            value={discrepancyReason}
            onChange={(e) => setDiscrepancyReason(e.target.value)}
            placeholder="Describe mismatch, anomaly, or verification issue"
            rows={3}
          />
        </div>
        <button type="button" onClick={reportDiscrepancy} disabled={!selectedElectionId || activeAction !== ''}>
          {activeAction === 'report' ? 'Reporting...' : 'Report Discrepancy'}
        </button>
      </div>

      {result ? (
        <div className="panel">
          <h2>Result Summary</h2>
          <div className="panel-grid">
            <div className="officer-card">
              <h3>Election</h3>
              <p className="small muted">Title: {result.election_title}</p>
              <p className="small muted">Status: {result.election_status}</p>
              <p className="small muted">Fetched: {result.fetched_at ? new Date(result.fetched_at).toLocaleString() : 'N/A'}</p>
            </div>
            <div className="officer-card">
              <h3>Consistency Check</h3>
              <p className="small muted">
                Counted + Abstentions: {totalCountedWithAbstentions} / Cast: {result.total_votes_cast}
              </p>
              <span className={`pill ${isCountConsistent ? 'pill-approved' : 'pill-rejected'}`}>
                {isCountConsistent ? 'CONSISTENT' : 'MISMATCH'}
              </span>
            </div>
            <div className="officer-card">
              <h3>Leading Candidate</h3>
              <p className="small muted">
                {topCandidate ? `${topCandidate.candidate_name} (${topCandidate.party_name})` : 'No candidate data'}
              </p>
              <p className="small muted">
                {topCandidate
                  ? `Vote share: ${result.total_votes_cast ? ((topCandidate.total_votes / result.total_votes_cast) * 100).toFixed(2) : '0.00'}%`
                  : 'Vote share: N/A'}
              </p>
            </div>
          </div>
          <div className="officer-kpi-grid">
            <div className="officer-kpi">
              <strong>{result.total_votes_cast}</strong>
              <span>Total Votes Cast</span>
            </div>
            <div className="officer-kpi">
              <strong>{result.counted_candidate_votes}</strong>
              <span>Candidate Votes Counted</span>
            </div>
            <div className="officer-kpi">
              <strong>{result.abstentions}</strong>
              <span>Abstentions</span>
            </div>
          </div>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Candidate</th>
                  <th>Party</th>
                  <th>Votes</th>
                </tr>
              </thead>
              <tbody>
                {result.rows.map((row) => (
                  <tr key={row.candidate_id}>
                    <td>{row.candidate_name}</td>
                    <td>{row.party_name}</td>
                    <td>{row.total_votes}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </section>
  );
}
