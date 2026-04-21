'use client';

import Link from 'next/link';

export default function SystemAdminDashboardPage() {
  return (
    <section>
      <h1>System Admin Dashboard</h1>
      <ul>
        <li>
          <Link href="/system-admin/user-management">User Management</Link>
        </li>
        <li>
          <Link href="/system-admin/security-logs">Security Logs</Link>
        </li>
        <li>
          <Link href="/system-admin/maintenance">Maintenance</Link>
        </li>
        <li>
          <Link href="/system-admin/system-settings">System Settings</Link>
        </li>
      </ul>
    </section>
  );
}
