'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function SystemAdminLogoutPage() {
  const router = useRouter();

  useEffect(() => {
    localStorage.removeItem('evoting.user');
    localStorage.removeItem('evoting.role');
    router.replace('/login');
  }, [router]);

  return (
    <section>
      <h1>Logging out...</h1>
      <p>Your System Admin session is being cleared.</p>
    </section>
  );
}
