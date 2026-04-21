'use client';

import Link from 'next/link';

export default function HomePage() {
  return (
    <>
      <section className="hero">
        <h1>Secure Election Management Portal</h1>
        <p>
          Browse election modules, manage operational roles, and move directly to the full workflow
          for setup, registration, voting, and auditing.
        </p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <Link href="/login">Start Login</Link>
          <Link href="/election-board/dashboard">Open Election Board</Link>
        </div>
      </section>

      <section>
        <h2>Role Portals</h2>
        <div className="quick-grid">
          <div className="quick-card">
            <h3>Election Board</h3>
            <p>Election setup, activation, closure, and result approval.</p>
            <Link href="/election-board/dashboard">Go to module</Link>
          </div>
          <div className="quick-card">
            <h3>Election Officer</h3>
            <p>Voter registration with OTP and operational station support.</p>
            <Link href="/election-officer/dashboard">Go to module</Link>
          </div>
          <div className="quick-card">
            <h3>Voter</h3>
            <p>Status check, ballot access, and vote submission flow.</p>
            <Link href="/voter/dashboard">Go to module</Link>
          </div>
          <div className="quick-card">
            <h3>System Admin</h3>
            <p>User roles, security logs, and system maintenance controls.</p>
            <Link href="/system-admin/dashboard">Go to module</Link>
          </div>
          <div className="quick-card">
            <h3>Audit Authority</h3>
            <p>Read-only log review and election audit report generation.</p>
            <Link href="/audit/dashboard">Go to module</Link>
          </div>
        </div>
      </section>
    </>
  );
}
