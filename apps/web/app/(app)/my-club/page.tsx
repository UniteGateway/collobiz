'use client';
import Link from 'next/link';
import { useState } from 'react';
import { Button, Skeleton, StatusBadge } from '@collabiz/ui';
import { Screen, ApiErrorView } from '@/components/Screen';
import { UcChapterList, UcPropose } from '@/components/UniteClub';
import { useQuery } from '@/lib/hooks';

interface Mine { slug: string; name: string; city: string; chapterStatus: string; role: string; status: string; category: string; decisionNote: string | null }
const LABEL: Record<string, [string, string]> = { active: ['Member', 'success'], applied: ['Waiting for approval', 'warning'], declined: ['Not accepted', 'danger'] };

/** Unite Club for members: my chapters, find a chapter, start a chapter. */
export default function MyClub() {
  const q = useQuery<{ items: Mine[] }>('/unite-club/me');
  const [proposing, setProposing] = useState(false);
  const [sent, setSent] = useState(false);
  return (
    <Screen page={{ key: 'my-club', title: 'Unite Club', access: 'partner' }} header={false}>
      <div className="cz-umeet-hero" style={{ background: 'linear-gradient(135deg, #032A4A, #0F6CBD)' }} data-screen="my-club">
        <div>
          <p className="cz-ph-eyebrow" style={{ color: '#8FD3FF' }}>Unite Club</p>
          <h1>Your business club.</h1>
          <p style={{ fontSize: 17, opacity: .9, margin: 0 }}>Meet your chapter every week, pass referrals, serve your city. <Link href="/unite-club" style={{ color: '#fff' }}>About Unite Club</Link></p>
        </div>
        <img src="/photos/team-success.webp" alt="Business people at a club meeting" />
      </div>
      <section style={{ marginTop: 24 }} aria-labelledby="mine-h">
        <h2 id="mine-h">My chapters</h2>
        {q.error ? <ApiErrorView error={q.error} onRetry={q.reload} /> : !q.data ? <Skeleton height={80} /> : !q.data.items.length ? <p className="cz-muted">You haven’t joined a chapter yet. Pick one below or start one for your city.</p> : (
          <ul className="cz-umeet-list">{q.data.items.map((m) => (
            <li key={m.slug} data-my-chapter={m.slug}>
              <div><strong>{m.name}</strong><span>{m.city} · {m.category}{m.role !== 'member' ? ` · ${m.role[0].toUpperCase()}${m.role.slice(1)}` : ''}{m.chapterStatus === 'proposed' ? ' · chapter waiting for Unite approval' : ''}</span></div>
              <div className="cz-row" style={{ gap: 8, flexWrap: 'nowrap' }}>
                <StatusBadge status={m.status} tone={LABEL[m.status]?.[1] as never} label={m.chapterStatus === 'proposed' ? 'Proposed' : LABEL[m.status]?.[0] ?? m.status} />
                {m.status === 'active' && <Link href={`/my-club/${m.slug}`} className="cz-btn cz-btn-accent cz-btn-sm">Open</Link>}
              </div>
            </li>
          ))}</ul>
        )}
      </section>
      <section style={{ marginTop: 28 }} aria-labelledby="find-h"><h2 id="find-h">Find a chapter</h2><UcChapterList /></section>
      <section className="cz-card" style={{ marginTop: 28 }} id="start" aria-labelledby="start-h">
        <h2 id="start-h" style={{ marginTop: 0 }}>Start a chapter</h2>
        {sent ? <p className="cz-alert cz-alert-success">Your chapter is proposed. The Unite team will review it; you’ll become its president once approved.</p>
          : proposing ? <UcPropose onDone={() => { setProposing(false); setSent(true); q.reload(); }} />
          : <><p>No chapter in your city? Propose one. You become its first president once the Unite team approves it.</p><Button variant="secondary" onClick={() => setProposing(true)}>Propose a chapter</Button></>}
      </section>
    </Screen>
  );
}
