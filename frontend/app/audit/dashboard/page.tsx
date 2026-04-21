'use client';

import Link from 'next/link';

export default function AuditDashboardPage() {
  return (
    <section>
      <h1>Audit Authority Dashboard</h1>
      <ul>
        <li>
          <Link href="/audit/audit-logs">View Audit Logs</Link>
        </li>
        <li>
          <Link href="/audit/audit-report">Generate Audit Report</Link>
        </li>
      </ul>
    </section>
  );
}
