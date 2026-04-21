import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import './globals.css';

export const metadata: Metadata = {
  title: 'AI-Assisted E-Voting System',
  description: 'Secure and transparent electronic voting platform.',
};

export default function RootLayout(props: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="site-header">
          <div className="gov-strip">
            <span className="gov-pill">Official Election Portal</span>
            <span className="gov-text">Secure service • HTTPS-enabled</span>
          </div>
          <div className="top-strip">
            <span>National Election Board of Ethiopia</span>
            <span>Amharic | English</span>
          </div>
          <div className="nav-shell">
            <div className="brand">
              <Image
                src="/nebe-logo.png"
                alt="National Election Board of Ethiopia logo"
                width={210}
                height={92}
                className="brand-logo"
                priority
              />
              <div className="brand-text">
                <strong>National Election Board of Ethiopia</strong>
                <span>E-Voting Project Portal</span>
              </div>
            </div>
            <nav className="main-nav">
              <Link href="/" className="nav-link">Home</Link>
              <Link href="/login" className="nav-link">Login</Link>
              <Link href="/election-board/dashboard" className="nav-link">Election Board</Link>
              <Link href="/election-officer/dashboard" className="nav-link">Election Officer</Link>
              <Link href="/voter/dashboard" className="nav-link">Voter</Link>
              <Link href="/system-admin/dashboard" className="nav-link">System Admin</Link>
              <Link href="/audit/dashboard" className="nav-link">Audit</Link>
            </nav>
          </div>
        </header>
        <main>{props.children}</main>
        <footer className="site-footer">University Final Year Project</footer>
      </body>
    </html>
  );
}
