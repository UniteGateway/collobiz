'use client';
/** Shared franchise UI: money, month labels, status tones and a dependency-free bar chart with a target line. */
export const rupees = (p: number | null | undefined) => (p == null ? '—' : `₹${Math.round(p / 100).toLocaleString('en-IN')}`);
export const lakh = (p: number) => (Math.abs(p) >= 1e7 ? `₹${(p / 1e9).toFixed(2)} cr` : `₹${(p / 1e7).toFixed(2)} L`);
export const monthShort = (m: string) => new Date(`${m}-01`).toLocaleDateString('en-IN', { month: 'short', year: '2-digit' });
export const UNIT_TONE: Record<string, 'success' | 'info' | 'warning' | 'neutral' | 'danger'> = { live: 'success', applied: 'info', approved: 'info', agreement_signed: 'info', setup: 'warning', suspended: 'danger', rejected: 'neutral', closed: 'neutral' };
export const ORDER_TONE: Record<string, 'success' | 'info' | 'warning' | 'neutral' | 'danger'> = { confirmed: 'info', placed: 'warning', dispatched: 'info', delivered: 'info', paid: 'success', received: 'success', cancelled: 'neutral' };
export const STATEMENT_TONE: Record<string, 'success' | 'info' | 'warning' | 'neutral' | 'danger'> = { due: 'warning', invoiced: 'info', paid: 'success', disputed: 'danger' };

export function Bars({ data, label }: { data: { key: string; label: string; value: number; target?: number | null; muted?: boolean }[]; label: string }) {
  const max = Math.max(1, ...data.map((d) => Math.max(d.value, d.target ?? 0)));
  return (
    <figure className="cz-fr-bars" aria-label={label}>
      {data.map((d) => (
        <div key={d.key} className="cz-fr-bar" title={`${d.label}: ${rupees(d.value)}${d.target ? ` (target ${rupees(d.target)})` : ''}`}>
          <div className="cz-fr-bar-track">
            {d.target ? <span className="cz-fr-target" style={{ bottom: `${(d.target / max) * 100}%` }} /> : null}
            <span className="cz-fr-fill" data-muted={d.muted || undefined} style={{ height: `${(d.value / max) * 100}%` }} />
          </div>
          <span className="cz-fr-bar-label">{d.label}</span>
        </div>
      ))}
    </figure>
  );
}
