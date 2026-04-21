'use client';

import Link from 'next/link';

export default function ElectionOfficerDashboardPage() {
  return (
    <section>
      <h1>Election Officer Dashboard</h1>
      <ul>
        <li>
          <Link href="/election-officer/voter-registration">Voter Registration</Link>
        </li>
        <li>
          <Link href="/election-officer/voters">View Voters</Link>
        </li>
        <li>
          <Link href="/election-officer/station-status">Station Status</Link>
        </li>
        <li>
          <Link href="/election-officer/results">Result Viewing & Verification</Link>
        </li>
      </ul>
    </section>
  );
}
