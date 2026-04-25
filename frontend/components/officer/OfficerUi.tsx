import Link from 'next/link';
import { ReactNode } from 'react';

type Tone = 'neutral' | 'success' | 'error' | 'warning' | 'info';

export function OfficerPageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle: string;
  actions?: ReactNode;
}) {
  return (
    <header className="officer-page-header">
      <div>
        <h1>{title}</h1>
        <p className="muted">{subtitle}</p>
      </div>
      {actions ? <div className="toolbar">{actions}</div> : null}
    </header>
  );
}

export function OfficerStatusNotice({
  tone = 'neutral',
  children,
}: {
  tone?: Tone;
  children: ReactNode;
}) {
  return <div className={`officer-notice officer-notice-${tone}`}>{children}</div>;
}

export function OfficerCard({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children?: ReactNode;
}) {
  return (
    <article className="officer-card">
      <h3>{title}</h3>
      {description ? <p className="muted">{description}</p> : null}
      {children}
    </article>
  );
}

export function OfficerTaskLink({
  href,
  title,
  description,
  cta,
}: {
  href: string;
  title: string;
  description?: string;
  cta?: string;
}) {
  return (
    <Link href={href} className="officer-task-link">
      <strong>{title}</strong>
      {description ? <span>{description}</span> : null}
      {cta ? <em>{cta}</em> : null}
    </Link>
  );
}
