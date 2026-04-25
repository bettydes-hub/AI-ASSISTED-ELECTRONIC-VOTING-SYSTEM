'use client';

import Link from 'next/link';

export default function RolePortalsPage() {
  return (
    <section>
      <h1>Choose Role Portal</h1>
      <p className="muted">
        Select your authorized role to continue to the correct workspace.
      </p>

      <div className="quick-grid">
        <div className="quick-card">
          <h3>Election Board</h3>
          <p>Election setup, activation, closure, and result approval.</p>
          <Link href="/election-board/dashboard">Open Election Board</Link>
        </div>
        <div className="quick-card">
          <h3>Election Officer</h3>
          <p>Voter registration with OTP and station operation support.</p>
          <Link href="/election-officer/dashboard">Open Election Officer</Link>
        </div>
        <div className="quick-card">
          <h3>Voter</h3>
          <p>Check status, access ballot, and cast vote in active elections.</p>
          <Link href="/voter/dashboard">Open Voter Portal</Link>
        </div>
        <div className="quick-card">
          <h3>System Admin</h3>
          <p>Manage users, security logs, and maintenance settings.</p>
          <Link href="/system-admin/dashboard">Open System Admin</Link>
        </div>
        <div className="quick-card">
          <h3>Audit Authority</h3>
          <p>Read-only monitoring and election audit report workflow.</p>
          <Link href="/audit/dashboard">Open Audit Portal</Link>
        </div>
      </div>
    </section>
  );
}
