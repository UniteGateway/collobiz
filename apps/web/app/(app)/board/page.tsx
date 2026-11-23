'use client';
import Link from 'next/link';
import { useState } from 'react';
import { ApiError } from '@collabiz/types';
import { Alert, Button, Icon, LoadingState, type IconName } from '@collabiz/ui';
import { ApiErrorView, Screen } from '@/components/Screen';
import { JoinWizard } from '@/components/Join';
import { useQuery } from '@/lib/hooks';

interface Stat { label: string; value: number | null; note?: string }
interface Card { code: string; label: string; blurb: string; icon: string; links: { href: string; label: string }[]; stats: Stat[] }
interface Board {
  profile: { sector: string; sectorName: string; intents: string[]; about: string | null; city: string | null; updatedAt: string };
  cards: Card[];
  ventures: { slug: string; name: string; tagline: string; open: boolean; reasons: { label: string }[] }[];
  offers: { id: string; title: string; category: string; owner: string; city: string | null; reasons: string[] }[];
  peers: number; note: string;
}

/** My collaboration board — what this business can do with Unite Group, live. */
export default function BoardPage() {
  const b = useQuery<Board>('/join/board');
  const [editing, setEditing] = useState(false);
  const none = b.error instanceof ApiError && b.error.status === 404;
  const d = b.data;
  return (
    <Screen page={{ key: 'board', title: 'My collaboration board', access: 'partner' }} eyebrow="YOUR BOARD"
      description="Everything your business can do with Unite Group, in one place. Each card is live from the module behind it.">
      {none || editing ? (
        <div className="cz-card">
          {none && <Alert tone="info">Tell us your industry and how you want to collaborate. Your board appears as soon as you save.</Alert>}
          <JoinWizard initial={d && editing ? { sector: d.profile.sector as never, intents: d.profile.intents as never, city: d.profile.city ?? undefined } : undefined}
            onSaved={() => { setEditing(false); b.reload(); }} />
        </div>
      ) : b.error ? <ApiErrorView error={b.error} onRetry={b.reload} /> : !d ? <LoadingState /> : (
        <div className="cz-stack" style={{ gap: 24 }}>
          <section className="cz-board-head">
            <div>
              <p className="cz-muted" style={{ margin: 0 }}>Your industry</p>
              <h2 style={{ margin: '2px 0 0' }}>{d.profile.sectorName}{d.profile.city ? ` · ${d.profile.city}` : ''}</h2>
              <p className="cz-muted" style={{ margin: '6px 0 0' }}>
                {d.peers > 0 ? `${d.peers} other business${d.peers === 1 ? '' : 'es'} in your industry ${d.peers === 1 ? 'has' : 'have'} joined.` : 'You are the first business from your industry on the board.'}
              </p>
            </div>
            <Button variant="secondary" onClick={() => setEditing(true)}>Change what I want</Button>
          </section>

          <section aria-labelledby="board-cards">
            <h2 id="board-cards" className="cz-sr-only">Your collaborations</h2>
            <div className="cz-board-grid">
              {d.cards.map((c) => (
                <article key={c.code} className="cz-card cz-board-card" data-board-card={c.code}>
                  <span className="cz-join-ic"><Icon name={c.icon as IconName} size={20} /></span>
                  <h3>{c.label}</h3>
                  <p className="cz-muted">{c.blurb}</p>
                  {c.stats.map((s) => (
                    <p key={s.label} className="cz-board-stat">
                      {s.value == null ? <span className="cz-muted">{s.note}</span> : <><strong>{s.value.toLocaleString('en-IN')}</strong> {s.label}</>}
                    </p>
                  ))}
                  <div className="cz-board-links">{c.links.map((l, i) => <Link key={l.href} href={l.href} className={i === 0 ? 'cz-btn cz-btn-primary cz-btn-sm' : 'cz-btn cz-btn-ghost cz-btn-sm'}>{l.label}</Link>)}</div>
                </article>
              ))}
            </div>
          </section>

          <section className="cz-card" aria-labelledby="board-ventures">
            <h2 id="board-ventures">Unite businesses for you</h2>
            {d.ventures.length ? (
              <ul className="cz-board-list">
                {d.ventures.map((v) => (
                  <li key={v.slug} data-board-venture={v.slug}>
                    <Link href={`/businesses/${v.slug}`}><strong>{v.name}</strong></Link> — {v.tagline}
                    <div className="cz-board-why">{v.reasons.map((r) => <span key={r.label} className="cz-chip">{r.label}</span>)}</div>
                  </li>
                ))}
              </ul>
            ) : <p className="cz-muted">No Unite business matches your choices yet. <Link href="/businesses">See all businesses</Link>.</p>}
          </section>

          <section className="cz-card" aria-labelledby="board-offers">
            <h2 id="board-offers">Business offers from members</h2>
            {d.offers.length ? (
              <ul className="cz-board-list">
                {d.offers.map((o) => (
                  <li key={o.id}>
                    <Link href={`/business-offers/${o.id}`}><strong>{o.title}</strong></Link> — {o.category} · {o.owner}{o.city ? `, ${o.city}` : ''}
                    <div className="cz-board-why">{o.reasons.map((r) => <span key={r} className="cz-chip">{r}</span>)}</div>
                  </li>
                ))}
              </ul>
            ) : <p className="cz-muted">No open offers in your industry right now. <Link href="/business-offers/new">Publish one</Link> so others can find you.</p>}
          </section>

          <p className="cz-muted" style={{ fontSize: 14 }}>{d.note} For deeper matching on what you have and need, use <Link href="/collab">Collab</Link>.</p>
        </div>
      )}
    </Screen>
  );
}
