'use client';

import { useMemo, useState } from 'react';

import { apiGet } from '../../../lib/apiClient';
import { OfficerPageHeader, OfficerStatusNotice } from '../../../components/officer/OfficerUi';
import { mapOfficerApiError, normalizeVerificationStatus } from '../../../lib/electionOfficerApi';

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

export default function ElectionOfficerVotersPage() {
  const [items, setItems] = useState<VoterItem[]>([]);
  const [search, setSearch] = useState('');
  const [verificationFilter, setVerificationFilter] = useState<'ALL' | 'VERIFIED' | 'NOT_VERIFIED'>('ALL');
  const [turnoutFilter, setTurnoutFilter] = useState<'ALL' | 'VOTED' | 'NOT_VOTED'>('ALL');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  async function loadVoters() {
    setError('');
    setIsLoading(true);
    try {
      const data = await apiGet('/voters', 'ElectionOfficer');
      setItems((data.items ?? []) as VoterItem[]);
    } catch (err) {
      setError(mapOfficerApiError(err));
    } finally {
      setIsLoading(false);
    }
  }

  const filteredItems = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return items.filter((item) => {
      const matchesText =
        !needle ||
        item.full_name.toLowerCase().includes(needle) ||
        item.voter_id.toLowerCase().includes(needle) ||
        item.national_id.toLowerCase().includes(needle) ||
        item.username.toLowerCase().includes(needle);
      const matchesVerification =
        verificationFilter === 'ALL' || normalizeVerificationStatus(item.verification_status) === verificationFilter;
      const matchesTurnout =
        turnoutFilter === 'ALL' ||
        (turnoutFilter === 'VOTED' ? item.has_voted : !item.has_voted);
      return matchesText && matchesVerification && matchesTurnout;
    });
  }, [items, search, verificationFilter, turnoutFilter]);

  const verifiedCount = items.filter(
    (item) => normalizeVerificationStatus(item.verification_status) === 'VERIFIED',
  ).length;
  const notVerifiedCount = Math.max(0, items.length - verifiedCount);
  const votedCount = items.filter((item) => item.has_voted).length;

  function resetFilters() {
    setSearch('');
    setVerificationFilter('ALL');
    setTurnoutFilter('ALL');
  }

  async function applyFilters() {
    if (items.length === 0) {
      await loadVoters();
    }
    setSearch((current) => current.trimStart());
  }

  return (
    <section>
      <OfficerPageHeader
        title="Registered Voters"
        subtitle="Smart voter directory with quick insights, filters, and status tracking."
        actions={
          <button type="button" onClick={loadVoters} disabled={isLoading}>
            {isLoading ? 'Loading...' : 'Refresh Voters'}
          </button>
        }
      />

      {error ? <OfficerStatusNotice tone="error">{error}</OfficerStatusNotice> : null}

      <div className="voters-hero">
        <div className="voters-hero-head">
          <h2>Voter Directory</h2>
          <p>Find, filter, and monitor voter readiness in one view.</p>
        </div>
        <div className="voters-stat-chips">
          <span className="voters-stat-chip">
            <strong>{items.length}</strong>
            <small>Total</small>
          </span>
          <span className="voters-stat-chip">
            <strong>{verifiedCount}</strong>
            <small>Verified</small>
          </span>
          <span className="voters-stat-chip">
            <strong>{notVerifiedCount}</strong>
            <small>Not Verified</small>
          </span>
          <span className="voters-stat-chip">
            <strong>{votedCount}</strong>
            <small>Voted</small>
          </span>
        </div>
      </div>

      <div className="panel voters-filter-panel">
        <div className="voters-filter-top">
          <h3>Filters</h3>
          <div className="toolbar">
            <button type="button" onClick={applyFilters} disabled={isLoading}>
              {isLoading ? 'Searching...' : 'Search'}
            </button>
            <button type="button" onClick={resetFilters}>
              Reset Filters
            </button>
          </div>
        </div>
        <div className="voters-filter-grid">
          <div className="form-row voters-search">
            <label htmlFor="searchVoter">Search</label>
            <input
              id="searchVoter"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Name, voter ID, national ID, username"
            />
          </div>
          <div className="form-row">
            <label htmlFor="verificationFilter">Verification Status</label>
            <select
              id="verificationFilter"
              value={verificationFilter}
              onChange={(e) =>
                setVerificationFilter(e.target.value as 'ALL' | 'VERIFIED' | 'NOT_VERIFIED')
              }
            >
              <option value="ALL">All</option>
              <option value="VERIFIED">Verified</option>
              <option value="NOT_VERIFIED">Not Verified</option>
            </select>
          </div>
          <div className="form-row">
            <label htmlFor="turnoutFilter">Voting Status</label>
            <select
              id="turnoutFilter"
              value={turnoutFilter}
              onChange={(e) => setTurnoutFilter(e.target.value as 'ALL' | 'VOTED' | 'NOT_VOTED')}
            >
              <option value="ALL">All</option>
              <option value="VOTED">Voted</option>
              <option value="NOT_VOTED">Not Voted</option>
            </select>
          </div>
        </div>
      </div>

      <div className="voters-results-banner">
        <span className="small muted">
          Showing <strong>{filteredItems.length}</strong> of <strong>{items.length}</strong> records
        </span>
      </div>

      {items.length === 0 && !isLoading ? (
        <div className="voters-empty">
          <h3>No voter records loaded yet</h3>
          <p className="small muted">Start by refreshing voter data from backend.</p>
          <button type="button" onClick={loadVoters} disabled={isLoading}>
            {isLoading ? 'Loading...' : 'Refresh Voters'}
          </button>
        </div>
      ) : null}

      {items.length > 0 && filteredItems.length === 0 ? (
        <OfficerStatusNotice tone="warning">No voters match the selected filters.</OfficerStatusNotice>
      ) : null}

      {filteredItems.length > 0 ? (
        <div className="table-wrap voters-table-wrap">
          <table className="data-table voters-table">
            <thead>
              <tr>
                <th>Voter</th>
                <th>National ID</th>
                <th>Username</th>
                <th>Contact</th>
                <th>Verification</th>
                <th>Turnout</th>
              </tr>
            </thead>
            <tbody>
              {filteredItems.map((item) => (
                <tr key={item.user_id}>
                  <td>
                    <strong>{item.full_name}</strong>
                    <div className="small muted">{item.voter_id}</div>
                  </td>
                  <td>{item.national_id}</td>
                  <td>{item.username}</td>
                  <td>{item.contact_info || '-'}</td>
                  <td>
                    <span
                      className={`pill ${
                        normalizeVerificationStatus(item.verification_status) === 'VERIFIED'
                          ? 'pill-approved'
                          : 'pill-pending'
                      }`}
                    >
                      {normalizeVerificationStatus(item.verification_status)}
                    </span>
                  </td>
                  <td>
                    <span className={`pill ${item.has_voted ? 'pill-active' : 'pill-draft'}`}>
                      {item.has_voted ? 'VOTED' : 'NOT VOTED'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}
