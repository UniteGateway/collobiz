'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Card, Icon, Skeleton } from '@collabiz/ui';
import { Screen, ApiErrorView } from '@/components/Screen';
import { BAND, appLabel, dueText, inr } from '@/components/ActionOS';
import { useQuery } from '@/lib/hooks';

interface Item { id: string; title: string; kindLabel: string; sourceApp: string; organization: string; recordUrl: string; dueAt: string | null; valuePaise: number | null; band: string; why: string[]; rule: string | null; verification: string; nextStep: string; confidentiality: string }
interface Plan { id: string; kind: string; periodKey: string; timeZone: string; summary: string; counts: Record<string, number>; sections: { key: string; title: string; items: string[] }[]; items: Item[]; generatedAt: string; deliveries: { channel: string; status: string; detail: string | null }[]; currentStatus: Record<string, string> }
const VER: Record<string, string> = { confirmed: 'Confirmed', reported: 'Reported / not verified', missing: 'Missing information', ai: 'AI recommendation' };
const STATUS: Record<string, string> = { sent: 'In your inbox', queued: 'Queued', delivered: 'Delivered', not_configured: 'Not configured — nothing sent', no_consent: 'No consent — nothing sent', quiet_hours: 'Held for quiet hours', failed: 'Failed', duplicate_skipped: 'Already sent' };
const CH: Record<string, string> = { inapp: 'Notice board & inbox', push: 'Mobile push', email: 'E-mail', whatsapp: 'WhatsApp' };

/** One action plan: executive summary, sections with source-linked items, and how it was delivered. */
export default function PlanPage() {
  const { id } = useParams<{ id: string }>();
  const q = useQuery<Plan>(`/action-os/plans/${id}`);
  const p = q.data;
  const byId = new Map((p?.items ?? []).map((i) => [i.id, i]));
  return (
    <Screen page={{ key: 'action-os-plan', title: p ? (p.kind === 'weekly' ? `Weekly action plan · ${p.periodKey}` : p.kind === 'daily' ? `Daily brief · ${p.periodKey}` : 'Action plan') : 'Action plan', access: 'partner' }} eyebrow="COLLABIZ ACTION OS"
      description={p ? `Prepared ${new Date(p.generatedAt).toLocaleString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit' })} (${p.timeZone})` : undefined}>
      <p style={{ marginTop: -6 }}><Link href="/action-os/plans" className="cz-back"><Icon name="prev" size={14} />All plans</Link></p>
      {q.error ? <ApiErrorView error={q.error} onRetry={q.reload} /> : !p ? <Skeleton height={300} /> : (
        <div className="cz-stack" style={{ gap: 16 }}>
          <section className="cz-aos-exec"><span>Executive summary</span><p>{p.summary}</p></section>
          {p.sections.map((s) => (
            <Card key={s.key} title={s.title}>
              <ul className="cz-aos-plan-items">{s.items.map((iid) => { const i = byId.get(iid); if (!i) return null; const now = p.currentStatus[iid]; return (
                <li key={iid}>
                  <span className={`cz-band ${BAND[i.band]?.cls}`}>{BAND[i.band]?.label}</span>
                  <div>
                    <Link href={i.recordUrl}><strong>{i.title}</strong></Link>{now && now !== 'open' && <span className="cz-done-tag"> · now {now}</span>}
                    <div className="cz-muted" style={{ fontSize: 12.5 }}>{appLabel(i.sourceApp)} · {i.kindLabel} · {i.organization} · {dueText(i.dueAt)}{i.valuePaise != null ? ` · ${inr(i.valuePaise)}` : ''} · <em>{VER[i.verification] ?? i.verification}</em></div>
                    {s.key === 'top' && <div style={{ fontSize: 13 }}>{i.why.length > 0 && <>{i.why.join(' · ')}. </>}<span className="cz-suggest-inline">Suggested: {i.nextStep}</span></div>}
                  </div>
                </li>); })}</ul>
            </Card>
          ))}
          <Card title="How this plan was delivered">
            <ul className="cz-ws-list">{p.deliveries.map((d) => <li key={d.channel}><span>{CH[d.channel] ?? d.channel}</span><span className="cz-muted">{STATUS[d.status] ?? d.status}{d.detail ? ` — ${d.detail}` : ''}</span></li>)}</ul>
          </Card>
        </div>
      )}
    </Screen>
  );
}
