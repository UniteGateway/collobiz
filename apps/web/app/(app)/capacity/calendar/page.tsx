'use client';
import { useState } from 'react';
import { Button, Skeleton } from '@collabiz/ui';
import { Screen, ApiErrorView } from '@/components/Screen';
import { useQuery } from '@/lib/hooks';

interface Cal { month: string; start: string; end: string; entries: { kind: 'capacity' | 'booking' | 'requested'; id: string; title: string; from: string; to: string; units: number; direction?: string }[] }
const iso = (d: Date) => d.toISOString().slice(0, 10);
const LABEL = { capacity: 'My capacity', booking: 'Accepted booking', requested: 'Requested' } as const;

/** Month view of my published capacity and every booking — to me and from me. */
export default function CapacityCalendar() {
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const q = useQuery<Cal>('/capacity/calendar', { month });
  const shift = (n: number) => { const d = new Date(`${month}-01T00:00:00Z`); d.setUTCMonth(d.getUTCMonth() + n); setMonth(iso(d).slice(0, 7)); };
  const first = new Date(`${month}-01T00:00:00Z`); const lead = (first.getUTCDay() + 6) % 7;
  const days: string[] = []; for (let i = -lead; i < 42 - lead; i++) days.push(iso(new Date(first.getTime() + i * 86_400_000)));
  const today = iso(new Date());
  return (
    <Screen page={{ key: 'capacity-calendar', title: 'Capacity calendar', access: 'partner' }} eyebrow="Capacity" description="Your published capacity and every booking — to you and from you — by day.">
      <div className="cz-row" style={{ gap: 8, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
        <Button size="sm" variant="ghost" onClick={() => shift(-1)} aria-label="Previous month">‹</Button>
        <h2 style={{ margin: 0, fontSize: 18, minWidth: 160 }}>{first.toLocaleDateString('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' })}</h2>
        <Button size="sm" variant="ghost" onClick={() => shift(1)} aria-label="Next month">›</Button>
        <Button size="sm" variant="secondary" onClick={() => setMonth(today.slice(0, 7))}>Today</Button>
        <span className="cz-cal-legend">{(Object.keys(LABEL) as (keyof typeof LABEL)[]).map((k) => <span key={k}><i className={`cz-cal-${k}`} />{LABEL[k]}</span>)}</span>
      </div>
      {q.error ? <ApiErrorView error={q.error} onRetry={q.reload} /> : !q.data ? <Skeleton height={420} /> : (
        <div className="cz-cal" aria-label="Capacity calendar" role="group">
          {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => <div key={d} className="cz-cal-dow" aria-hidden>{d}</div>)}
          {days.map((d) => {
            const items = q.data!.entries.filter((e) => e.from <= d && e.to >= d);
            return (
              <div key={d} role="group" className={`cz-cal-day${d.slice(0, 7) !== month ? ' cz-cal-out' : ''}${d === today ? ' cz-cal-today' : ''}`} aria-label={`${d}: ${items.length} entries`}>
                <span className="cz-cal-num">{Number(d.slice(8))}</span>
                {items.slice(0, 3).map((e) => <span key={e.kind + e.id} className={`cz-cal-item cz-cal-${e.kind}`} title={`${LABEL[e.kind]}: ${e.title} (${e.units})`}>{e.title}</span>)}
                {items.length > 3 && <span className="cz-cal-more">+{items.length - 3} more</span>}
              </div>
            );
          })}
        </div>
      )}
    </Screen>
  );
}
