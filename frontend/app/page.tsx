'use client';

import { useState } from 'react';
import Link from 'next/link';

export default function HomePage() {
  const [isRoleMenuOpen, setIsRoleMenuOpen] = useState(false);

  return (
    <>
      <section className="home-hero">
        <p className="home-kicker">National Election Board of Ethiopia</p>
        <h1>Secure Election Management Portal</h1>
        <p className="home-subtitle">
          Manage election setup, voter registration, voting, and auditing through a secure,
          role-based, and nationally aligned workflow.
        </p>
        <div className="home-actions">
          <Link href="/login" className="home-primary-link">
            Start Login
          </Link>
          <button
            type="button"
            className="home-secondary-link home-role-trigger"
            onClick={() => setIsRoleMenuOpen((prev) => !prev)}
            aria-expanded={isRoleMenuOpen}
            aria-controls="role-portals-menu"
          >
            Role Portals
          </button>
        </div>
        {isRoleMenuOpen ? (
          <div id="role-portals-menu" className="home-role-dropdown">
            <Link href="/election-board/dashboard">
              <strong>Election Board</strong>
              <span>Setup election, candidates, parties, and schedules.</span>
            </Link>
            <Link href="/election-officer/dashboard">
              <strong>Election Officer</strong>
              <span>Register voters, issue OTP, and verify identity records.</span>
            </Link>
            <Link href="/voter/dashboard">
              <strong>Voter</strong>
              <span>View ballot, vote securely, and check voting status.</span>
            </Link>
            <Link href="/system-admin/dashboard">
              <strong>System Admin</strong>
              <span>Manage users, logs, and core system configuration.</span>
            </Link>
            <Link href="/audit/dashboard">
              <strong>Audit Authority</strong>
              <span>Review logs and verify election transparency.</span>
            </Link>
          </div>
        ) : null}
      </section>

      <section>
        <h2>Election Workflow Overview</h2>
        <div className="quick-grid">
          <div className="quick-card">
            <h3>1. Setup</h3>
            <p>Election Board prepares election details, schedule, candidates, and parties.</p>
          </div>
          <div className="quick-card">
            <h3>2. Register & Verify</h3>
            <p>Election Officers register voters, issue OTP, and verify voter identity records.</p>
          </div>
          <div className="quick-card">
            <h3>3. Vote & Result</h3>
            <p>Voters cast ballots securely, and authorized roles verify and publish outcomes.</p>
          </div>
          <div className="quick-card">
            <h3>4. Audit & Trust</h3>
            <p>Audit Authority reviews logs and reports to support transparency and fairness.</p>
          </div>
        </div>
      </section>
    </>
  );
}
