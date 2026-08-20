import type { ReactNode } from 'react';

export function Bar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  return (
    <div className="bar" title={`${value}/${max}`}>
      <div style={{ width: `${pct}%`, background: color }} />
    </div>
  );
}

export function Tag({ children, tone }: { children: ReactNode; tone?: 'gold' | 'red' | 'green' }) {
  return <span className={`tag${tone ? ' ' + tone : ''}`}>{children}</span>;
}

export function RelBar({ label, value }: { label: string; value: number }) {
  const pct = ((value + 10) / 20) * 100;
  const color = value >= 0 ? 'var(--accent2)' : 'var(--danger)';
  return (
    <div style={{ marginBottom: 4 }}>
      <div className="row small" style={{ justifyContent: 'space-between' }}>
        <span className="dim">{label}</span>
        <span className="mono">{value > 0 ? '+' : ''}{value}</span>
      </div>
      <div className="bar">
        <div style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  );
}
