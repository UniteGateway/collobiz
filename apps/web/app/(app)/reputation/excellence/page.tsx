'use client';
import { Icon, Skeleton } from '@collabiz/ui';
import { Screen, ApiErrorView } from '@/components/Screen';
import { useQuery } from '@/lib/hooks';

interface Ex { level: string; levelName: string; next: string | null; nextName: string | null; criteria: { key: string; label: string; met: boolean; detail: string; progress?: number }[]; ready: boolean; note: string }
const LADDER = [['registered', 'Registered'], ['verified', 'Verified'], ['certified', 'Certified'], ['strategic', 'Strategic'], ['country_partner', 'Country partner']];

/** Screen 165 — Partner excellence & certification: where you are on the membership ladder and what the next level needs. */
export default function Excellence() {
  const q = useQuery<Ex>('/reputation/excellence');
  const d = q.data;
  const at = d ? LADDER.findIndex(([k]) => k === d.level) : -1;
  return (
    <Screen id="165" title="Next level" description="Membership levels unlock more opportunities and commercial terms. Each level is earned through verified delivery, reputation and certification.">
      {q.error ? <ApiErrorView error={q.error} onRetry={q.reload} /> : !d ? <Skeleton height={300} /> : (
        <>
          <ol className="cz-ladder" aria-label="Membership levels">
            {LADDER.map(([k, l], i) => <li key={k} data-state={i < at ? 'done' : i === at ? 'current' : i === at + 1 ? 'next' : 'todo'}><span>{i < at ? <Icon name="check" size={14} /> : i + 1}</span>{l}</li>)}
          </ol>
          {d.next ? (
            <section className="cz-card" aria-labelledby="crit-h">
              <h2 id="crit-h" className="cz-help-h">{d.ready ? `You meet every criterion for ${d.nextName}` : `What ${d.nextName} needs`}</h2>
              <ul className="cz-criteria">
                {d.criteria.map((c) => (
                  <li key={c.key} data-met={c.met || undefined}>
                    <span className="cz-crit-icon"><Icon name={c.met ? 'check' : 'clock'} size={16} /></span>
                    <span className="cz-crit-text"><strong>{c.label}</strong><span className="cz-muted">{c.detail}</span></span>
                    {c.progress != null && <span className="cz-crit-bar" aria-label={`${Math.round(c.progress * 100)}% complete`}><span style={{ width: `${Math.round(c.progress * 100)}%` }} /></span>}
                  </li>
                ))}
              </ul>
              <p className="cz-muted" style={{ fontSize: 13, marginTop: 14 }}><Icon name="info" size={13} /> {d.note}</p>
            </section>
          ) : <div className="cz-card"><h2 className="cz-help-h">You’re at the highest level</h2><p className="cz-muted">Keep delivering verified work to maintain it.</p></div>}
        </>
      )}
    </Screen>
  );
}
