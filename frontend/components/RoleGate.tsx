'use client';

import { ReactNode, useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';

import { getApiBase } from '../lib/apiBase';

type Role = 'Voter' | 'ElectionOfficer' | 'ElectionBoard' | 'SystemAdmin' | 'AuditAuthority';

type SessionUser = {
  id: number;
  role: Role;
  account_status?: string;
  full_name?: string;
  username?: string;
  must_change_password?: boolean;
};

export default function RoleGate(props: { allowedRoles: Role[]; children: ReactNode }) {
  const { allowedRoles, children } = props;
  const router = useRouter();
  const pathname = usePathname();
  const [status, setStatus] = useState<'checking' | 'allowed' | 'denied'>('checking');
  const [message, setMessage] = useState('Checking permission...');

  useEffect(() => {
    async function validateRole() {
      const raw = localStorage.getItem('evoting.user');
      if (!raw) {
        setStatus('denied');
        setMessage('Login required.');
        router.replace('/login');
        return;
      }

      let user: SessionUser | null = null;
      try {
        user = JSON.parse(raw) as SessionUser;
      } catch {
        localStorage.removeItem('evoting.user');
        localStorage.removeItem('evoting.role');
        setStatus('denied');
        setMessage('Session is invalid. Please login again.');
        router.replace('/login');
        return;
      }

      if (!user?.id || !user?.role) {
        localStorage.removeItem('evoting.user');
        localStorage.removeItem('evoting.role');
        setStatus('denied');
        setMessage('Session is missing user data. Please login again.');
        router.replace('/login');
        return;
      }

      try {
        const res = await fetch(`${getApiBase()}/auth/me`, {
          headers: {
            'X-User-Id': String(user.id),
            'X-Role': user.role,
          },
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          localStorage.removeItem('evoting.user');
          localStorage.removeItem('evoting.role');
          setStatus('denied');
          setMessage(data.error ?? 'Session expired. Please login again.');
          router.replace('/login');
          return;
        }

        const freshUser = data as SessionUser;
        localStorage.setItem('evoting.user', JSON.stringify(freshUser));
        localStorage.setItem('evoting.role', freshUser.role);
        if (freshUser.must_change_password) {
          setStatus('denied');
          setMessage('Password reset detected. Please change your password first.');
          router.replace('/change-password');
          return;
        }

        if (!allowedRoles.includes(freshUser.role)) {
          setStatus('denied');
          setMessage(`Access denied. ${freshUser.role} role cannot open ${pathname}.`);
          return;
        }

        setStatus('allowed');
      } catch {
        setStatus('denied');
        setMessage('Cannot verify permission with backend.');
      }
    }

    validateRole();
  }, [allowedRoles, pathname, router]);

  if (status === 'checking') {
    return (
      <section>
        <h1>Authorizing</h1>
        <p>{message}</p>
      </section>
    );
  }

  if (status === 'denied') {
    return (
      <section>
        <h1>Access Denied</h1>
        <p>{message}</p>
        <p>
          <Link href="/login">Go to login</Link>
        </p>
      </section>
    );
  }

  return <>{children}</>;
}
