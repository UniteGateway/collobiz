'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ErrorState, LoadingState } from '@collabiz/ui';
import { PageHero } from '@/components/PageHero';
import { UcApply, type UcPublicChapter } from '@/components/UniteClub';
import { useQuery } from '@/lib/hooks';

/** A Unite Club chapter's public page: schedule, filled business categories, upcoming events, apply to join. */
export default function ChapterPage() {
  const { slug } = useParams<{ slug: string }>();
  const q = useQuery<UcPublicChapter & { events: { title: string; kind: string; startsAt: string }[] }>(`/public/unite-club/chapters/${slug}`);
  if (q.error) return <div className="cz-container cz-section"><ErrorState error={q.error} onRetry={q.reload} /></div>;
  if (!q.data) return <div className="cz-container cz-section"><LoadingState /></div>;
  const c = q.data;
  return (
    <div className="cz-page" data-screen="unite-club-chapter">
      <PageHero layout="split" tone="ocean" image="team-meeting" second="team-handshake" eyebrow={`Unite Club · ${c.city}`} title={c.name} lead={c.about}
        stats={[[c.members, 'members'], [c.meetingSchedule, 'meets'], [c.meetsOnline ? 'In person and online' : 'In person', 'where']]} />
      <div className="cz-container">
        <div className="cz-grid cz-grid-2 cz-page-block" style={{ alignItems: 'start' }}>
          <section className="cz-card">
            <h2 style={{ marginTop: 0 }}>Business categories in this chapter</h2>
            {c.exclusiveCategories && <p className="cz-muted">One member per category. These seats are taken:</p>}
            <div className="cz-chips">{c.categories.map((x) => <span key={x} className="cz-chip">{x}</span>)}</div>
            {c.events.length > 0 && <>
              <h2>Coming up</h2>
              <ul className="cz-umeet-list">{c.events.map((e) => <li key={e.startsAt + e.title}><div><strong>{e.title}</strong><span>{new Date(e.startsAt).toLocaleString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}</span></div></li>)}</ul>
            </>}
          </section>
          <section className="cz-card" id="apply"><h2 style={{ marginTop: 0 }}>Apply to join</h2><UcApply slug={c.slug} taken={c.exclusiveCategories ? c.categories : []} /></section>
        </div>
        <p className="cz-muted" style={{ marginTop: 24 }}><Link href="/unite-club">All Unite Club chapters</Link></p>
      </div>
    </div>
  );
}
