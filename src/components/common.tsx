import type { ReactNode } from 'react';
import { ArrowUpRight, ChevronRight, Circle, SearchX } from 'lucide-react';
import { Link } from 'react-router-dom';
import { StatusLabel } from '../vendor/headlamp/StatusLabel';
import { runtimeLabel } from '../../shared/types';
export const money = (value: number) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  }).format(value);
export function relative(value: string) {
  const sec = Math.max(0, Math.floor((Date.now() - Date.parse(value)) / 1000));
  return sec < 5
    ? 'just now'
    : sec < 60
      ? `${sec}s ago`
      : sec < 3600
        ? `${Math.floor(sec / 60)}m ago`
        : sec < 86400
          ? `${Math.floor(sec / 3600)}h ago`
          : `${Math.floor(sec / 86400)}d ago`;
}
export const timestamp = (value: string) => new Date(value).toLocaleString();
export function Time({ value }: { value: string }) {
  return (
    <time dateTime={value} title={timestamp(value)}>
      {relative(value)}
    </time>
  );
}
export function Badge({ value }: { value: string }) {
  const status = [
    'healthy',
    'running',
    'completed',
    'validated_pass',
    'resolved',
    'approved',
    'passed',
  ].includes(value)
    ? 'success'
    : [
          'paused',
          'pausing',
          'resuming',
          'degraded',
          'awaiting_approval',
          'investigating',
          'pending',
          'warning',
          'acknowledged',
        ].includes(value)
      ? 'warning'
      : ['critical', 'failed', 'validated_fail', 'rejected'].includes(value)
        ? 'error'
        : '';
  const labels: Record<string, string> = {
    awaiting_approval: 'Needs approval',
    not_evaluated: 'Not evaluated',
    validated_pass: 'Validated pass',
    validated_fail: 'Validated fail',
    observe_only: 'Observe only',
  };
  return (
    <StatusLabel status={status}>
      {labels[value] ?? value.replaceAll('_', ' ').replace(/^./, (s) => s.toUpperCase())}
    </StatusLabel>
  );
}
export function Panel({
  title,
  eyebrow,
  action,
  children,
  className = '',
}: {
  title: string;
  eyebrow?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`panel ${className}`}>
      <div className="panel-head">
        <div>
          {eyebrow && <span className="eyebrow">{eyebrow}</span>}
          <h2>{title}</h2>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}
export function PageTitle({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="page-title">
      <div>
        <span className="eyebrow">{eyebrow}</span>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {action && <div className="page-actions">{action}</div>}
    </div>
  );
}
export function ViewLink({ to, children = 'View all' }: { to: string; children?: ReactNode }) {
  return (
    <Link className="view-link" to={to}>
      {children}
      <ArrowUpRight size={14} />
    </Link>
  );
}
export function Empty({
  title = 'Nothing here yet',
  description = 'Try adjusting your filters.',
  action,
}: {
  title?: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <SearchX size={30} />
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </div>
  );
}
export function RuntimeIcon({ runtime, size = 28 }: { runtime: string; size?: number }) {
  return (
    <span
      className={`runtime-icon runtime-${runtime}`}
      style={{ width: size, height: size, fontSize: size * 0.46 }}
      aria-label={runtimeLabel(runtime)}
    >
      {runtime === 'codex'
        ? '◎'
        : runtime === 'claude-code'
          ? '✳'
          : runtime === 'deterministic'
            ? '⌘'
            : runtime === 'atbot'
              ? 'A'
              : '◇'}
    </span>
  );
}
export function Progress({ value, total }: { value: number | null; total: number | null }) {
  if (value === null || !total) return <span className="muted">Progress unknown</span>;
  const percent = Math.round((value / total) * 100);
  return (
    <div className="progress-group">
      <div className="progress-track">
        <div style={{ width: `${percent}%` }} />
      </div>
      <span>{percent}%</span>
    </div>
  );
}
export function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="detail-row">
      <span>{label}</span>
      <div>{children}</div>
    </div>
  );
}
export function Kicker({ children }: { children: ReactNode }) {
  return (
    <span className="kicker">
      <Circle size={6} fill="currentColor" />
      {children}
      <ChevronRight size={12} />
    </span>
  );
}
