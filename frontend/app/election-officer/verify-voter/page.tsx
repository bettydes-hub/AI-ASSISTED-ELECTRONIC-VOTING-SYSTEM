'use client';

import { FormEvent, useState } from 'react';

import { apiGet, apiPatch } from '../../../lib/apiClient';
import { OfficerPageHeader, OfficerStatusNotice } from '../../../components/officer/OfficerUi';
import { mapOfficerApiError, normalizeVerificationStatus, VerificationState } from '../../../lib/electionOfficerApi';

type VoterItem = {
  user_id: number;
  full_name: string;
  national_id: string;
  contact_info: string;
  username: string;
  voter_id: string;
  verification_status: string;
  has_voted: boolean;
};

export default function VerifyVoterPage() {
  const [query, setQuery] = useState('');
  const [result, setResult] = useState<VoterItem | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);

  async function verify(event: FormEvent) {
    event.preventDefault();
    const needle = query.trim().toLowerCase();
    if (!needle) {
      setError('Enter voter ID, national ID, username, or user ID.');
      setMessage('');
      setResult(null);
      return;
    }

    setIsVerifying(true);
    setError('');
    setMessage('');
    setResult(null);
    try {
      const data = await apiGet(`/voters/lookup?q=${encodeURIComponent(needle)}&limit=25`, 'ElectionOfficer');
      const items = ((data.items ?? []) as VoterItem[]).find((item) => {
        return (
          item.voter_id.toLowerCase() === needle ||
          item.national_id.toLowerCase() === needle ||
          item.username.toLowerCase() === needle ||
          String(item.user_id) === needle
        );
      });
      if (!items) {
        setError('No voter matches the provided identifier.');
        return;
      }
      setResult(items);
      setMessage('Voter record loaded successfully.');
    } catch (err) {
      setError(mapOfficerApiError(err));
    } finally {
      setIsVerifying(false);
    }
  }

  async function updateVerificationStatus(nextStatus: VerificationState) {
    if (!result) return;
    setError('');
    setMessage('');
    setIsUpdating(true);
    try {
      const data = await apiPatch(`/voters/${result.user_id}/verification`, 'ElectionOfficer', {
        verification_status: nextStatus,
      });
      const updatedStatus = String(data.verification_status ?? nextStatus);
      setResult((current) =>
        current
          ? {
              ...current,
              verification_status: updatedStatus,
            }
          : current,
      );
      setMessage(`Verification status updated to ${normalizeVerificationStatus(updatedStatus)}.`);
    } catch (err) {
      setError(mapOfficerApiError(err));
    } finally {
      setIsUpdating(false);
    }
  }

  function clearSearch() {
    setQuery('');
    setError('');
    setMessage('');
    setResult(null);
  }

  return (
    <section>
      <OfficerPageHeader
        title="Verify Voter ID"
        subtitle="Election officers can validate voter identity and registration status before further actions."
      />

      <form onSubmit={verify} className="panel verify-search-panel">
        <h3>Find Voter</h3>
        <p className="small muted">Search by voter ID, national ID, username, or user ID.</p>
        <div className="verify-search-row">
          <input
            id="verifyQuery"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Example: VOT-000001 or user123"
          />
          <button type="submit" disabled={isVerifying}>
            {isVerifying ? 'Verifying...' : 'Verify'}
          </button>
          <button type="button" onClick={clearSearch} disabled={isVerifying && !result}>
            Clear
          </button>
        </div>
        <div className="verify-chip-row">
          <button type="button" className="verify-chip" onClick={() => setQuery('VOT-000001')}>
            VOT-000001
          </button>
          <button type="button" className="verify-chip" onClick={() => setQuery('1001')}>
            1001
          </button>
          <button type="button" className="verify-chip" onClick={() => setQuery('demo_user')}>
            demo_user
          </button>
        </div>
      </form>

      {error ? <OfficerStatusNotice tone="error">{error}</OfficerStatusNotice> : null}
      {message ? <OfficerStatusNotice tone="success">{message}</OfficerStatusNotice> : null}

      {result ? (
        <div className="panel verify-result-panel">
          <div className="verify-result-header">
            <div>
              <h3>{result.full_name}</h3>
              <p className="small muted">Voter ID: {result.voter_id}</p>
            </div>
            <div className="toolbar">
              <span
                className={`pill ${
                  normalizeVerificationStatus(result.verification_status) === 'VERIFIED' ? 'pill-approved' : 'pill-pending'
                }`}
              >
                {normalizeVerificationStatus(result.verification_status)}
              </span>
              <span className={`pill ${result.has_voted ? 'pill-active' : 'pill-draft'}`}>
                {result.has_voted ? 'VOTED' : 'NOT VOTED'}
              </span>
            </div>
          </div>

          <div className="verify-detail-grid">
            <div className="verify-detail-item">
              <span className="small muted">National ID</span>
              <strong>{result.national_id}</strong>
            </div>
            <div className="verify-detail-item">
              <span className="small muted">Username</span>
              <strong>{result.username}</strong>
            </div>
            <div className="verify-detail-item">
              <span className="small muted">Contact</span>
              <strong>{result.contact_info || '-'}</strong>
            </div>
            <div className="verify-detail-item">
              <span className="small muted">User ID</span>
              <strong>{result.user_id}</strong>
            </div>
          </div>

          <div className="toolbar">
            <button
              type="button"
              onClick={() => updateVerificationStatus('VERIFIED')}
              disabled={isUpdating || normalizeVerificationStatus(result.verification_status) === 'VERIFIED'}
            >
              {isUpdating ? 'Updating...' : 'Mark VERIFIED'}
            </button>
            <button
              type="button"
              onClick={() => updateVerificationStatus('NOT_VERIFIED')}
              disabled={isUpdating || normalizeVerificationStatus(result.verification_status) === 'NOT_VERIFIED'}
            >
              {isUpdating ? 'Updating...' : 'Mark NOT_VERIFIED'}
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
