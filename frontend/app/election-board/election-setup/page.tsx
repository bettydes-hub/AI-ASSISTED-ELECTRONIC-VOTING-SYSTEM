'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { getApiBase } from '../../../lib/apiBase';
import { boardLogout, getStoredUser, isElectionBoardUser } from '../../../lib/electionBoardSession';

export default function ElectionSetupPage() {
  const router = useRouter();
  const [sessionChecked, setSessionChecked] = useState(false);
  const [authorized, setAuthorized] = useState(false);

  useEffect(() => {
    const user = getStoredUser();
    const isBoard = isElectionBoardUser(user);
    setAuthorized(isBoard);
    setSessionChecked(true);
    if (isBoard) router.replace('/election-board/schedule');
  }, []);

  async function onLogout() {
    await boardLogout(getApiBase());
    localStorage.removeItem('evoting.user');
    localStorage.removeItem('evoting.role');
    router.push('/login');
  }

  if (!sessionChecked) {
    return (
      <section>
        <p>Checking session...</p>
      </section>
    );
  }
  if (!authorized) {
    return (
      <section>
        <h1>Election Setup</h1>
        <p>This page is for Election Board members only.</p>
        <p>
          <Link href="/login">Login as Election Board</Link>
        </p>
      </section>
    );
  }

  return (
    <section>
      <div className="page-header">
        <div>
          <h1>Election Setup</h1>
          <p className="muted">This page has been split into dedicated modules for easier workflow.</p>
        </div>
        <div className="toolbar">
          <button type="button" onClick={onLogout}>
            Logout
          </button>
        </div>
      </div>

      <div className="board-nav-tabs">
        <Link href="/election-board/dashboard">Dashboard</Link>
        <Link href="/election-board/parties/list">Political Parties</Link>
        <Link href="/election-board/candidates/list">Candidates</Link>
        <Link href="/election-board/schedule">Schedule & Activate</Link>
        <Link href="/election-board/election-results">Election Results</Link>
      </div>

      <div className="board-card-grid">
        <article className="board-action-card">
          <h3>Political Parties</h3>
          <p>Register and manage political parties for elections.</p>
          <Link href="/election-board/parties/list">Open Parties</Link>
        </article>
        <article className="board-action-card">
          <h3>Candidates</h3>
          <p>Add candidates, edit profiles, and assign parties by election.</p>
          <Link href="/election-board/candidates/list">Open Candidates</Link>
        </article>
        <article className="board-action-card">
          <h3>Schedule & Activate</h3>
          <p>Create elections, define rules and schedule, and activate voting.</p>
          <Link href="/election-board/schedule">Open Scheduling</Link>
        </article>
        <article className="board-action-card">
          <h3>Election Results</h3>
          <p>Close elections, print, verify and approve final results.</p>
          <Link href="/election-board/election-results">Open Results</Link>
        </article>
      </div>
    </section>
  );
}
