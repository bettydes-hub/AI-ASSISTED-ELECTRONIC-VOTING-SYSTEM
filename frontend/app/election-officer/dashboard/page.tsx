'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

import { apiGet } from '../../../lib/apiClient';
import { mapOfficerApiError } from '../../../lib/electionOfficerApi';
import {
  OfficerCard,
  OfficerPageHeader,
  OfficerStatusNotice,
} from '../../../components/officer/OfficerUi';

type RegistrationSummary = {
  total_voters?: number;
  verified_voters?: number;
  not_verified_voters?: number;
  voted_voters?: number;
  not_voted_voters?: number;
  turnout_percent?: number;
};

const OFFICER_FUNCTIONS = [
  { href: '/election-officer/voter-registration', title: 'Voter Registration' },
  { href: '/election-officer/verify-voter', title: 'Verify Voter ID' },
  { href: '/election-officer/voters', title: 'Registered Voters' },
  { href: '/election-officer/station-status', title: 'Station Status' },
  { href: '/election-officer/results', title: 'Result Verification' },
  { href: '/election-officer/logout', title: 'Secure Logout' },
] as const;

export default function ElectionOfficerDashboardPage() {
  const router = useRouter();
  const [summary, setSummary] = useState<RegistrationSummary | null>(null);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [selectedFunction, setSelectedFunction] = useState('');

  useEffect(() => {
    async function loadSummary() {
      setError('');
      setIsLoading(true);
      try {
        const data = (await apiGet('/voters/registration/summary', 'ElectionOfficer')) as RegistrationSummary;
        setSummary(data);
      } catch (err) {
        setError(mapOfficerApiError(err));
      } finally {
        setIsLoading(false);
      }
    }

    loadSummary().catch(() => undefined);
  }, []);

  const kpi = useMemo(
    () => ({
      totalVoters: summary?.total_voters ?? 0,
      verifiedVoters: summary?.verified_voters ?? 0,
      turnout: summary?.turnout_percent ?? 0,
    }),
    [summary],
  );

  function goToSelectedFunction() {
    if (!selectedFunction) return;
    router.push(selectedFunction);
  }

  return (
    <section>
      <OfficerPageHeader
        title="Election Officer Dashboard"
        subtitle="Simple control center for registration, verification, and station operations."
      />
      {error ? <OfficerStatusNotice tone="error">{error}</OfficerStatusNotice> : null}

      <div className="officer-hero">
        <div>
          <h2>Quick Access</h2>
          <p>Choose a function and continue instantly.</p>
        </div>
        <div className="officer-hero-actions">
          <select
            id="functionSelect"
            value={selectedFunction}
            onChange={(event) => setSelectedFunction(event.target.value)}
          >
            <option value="">Select a function</option>
            {OFFICER_FUNCTIONS.map((item) => (
              <option key={item.href} value={item.href}>
                {item.title}
              </option>
            ))}
          </select>
          <button type="button" onClick={goToSelectedFunction} disabled={!selectedFunction}>
            Open
          </button>
        </div>
      </div>

      <div className="officer-kpi-grid">
        <div className="officer-kpi">
          <strong>{isLoading ? '...' : kpi.totalVoters}</strong>
          <span>Total registered voters</span>
        </div>
        <div className="officer-kpi">
          <strong>{isLoading ? '...' : kpi.verifiedVoters}</strong>
          <span>Verified voters</span>
        </div>
        <div className="officer-kpi">
          <strong>{isLoading ? '...' : `${kpi.turnout}%`}</strong>
          <span>Current turnout</span>
        </div>
      </div>

      <div className="officer-quick-grid">
        {OFFICER_FUNCTIONS.map((item) => (
          <Link key={item.href} href={item.href} className="officer-quick-link">
            {item.title}
          </Link>
        ))}
      </div>

      <div className="panel-grid">
        <OfficerCard title="Recommended Flow" description="Keep operations smooth in this order.">
          <ol className="small muted">
            <li>Register voter and issue OTP.</li>
            <li>Verify identity and update status.</li>
            <li>Check station health before final actions.</li>
            <li>Review and submit result verification.</li>
          </ol>
        </OfficerCard>

        <OfficerCard title="Today" description="Focus on unresolved records and station readiness.">
          <div className="check-grid">
            <p>Pending verification: {Math.max(0, kpi.totalVoters - kpi.verifiedVoters)}</p>
            <p>Turnout trend: {isLoading ? '...' : `${kpi.turnout}%`}</p>
            <p>Status check: Run before critical actions.</p>
          </div>
        </OfficerCard>
      </div>

      <div className="panel">
        <OfficerStatusNotice tone="info">
          Tip: use the dropdown or quick links for fastest navigation, and keep this page as your daily start point.
        </OfficerStatusNotice>
      </div>
    </section>
  );
}
