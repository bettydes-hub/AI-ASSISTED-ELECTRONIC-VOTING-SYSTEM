'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getApiBase } from '../../../lib/apiBase';
import { boardLogout } from '../../../lib/electionBoardSession';

export default function ElectionBoardLogoutPage() {
  const router = useRouter();

  useEffect(() => {
    async function runLogout() {
      await boardLogout(getApiBase());
      localStorage.removeItem('evoting.user');
      localStorage.removeItem('evoting.role');
      router.replace('/login');
    }
    runLogout();
  }, [router]);

  return (
    <section>
      <h1>Logging out...</h1>
      <p>Your Election Board session is being cleared.</p>
    </section>
  );
}
