import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'AI-Assisted E-Voting System',
  description: 'Secure and transparent electronic voting platform.',
};

export default function RootLayout(props: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header>AI-Assisted E-Voting System</header>
        <main>{props.children}</main>
        <footer>University Final Year Project</footer>
      </body>
    </html>
  );
}
