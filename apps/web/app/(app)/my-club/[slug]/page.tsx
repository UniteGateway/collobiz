'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Icon, Skeleton } from '@collabiz/ui';
import { Screen, ApiErrorView } from '@/components/Screen';
import { UcDashboard, type UcView } from '@/components/UniteClub';
import { useQuery } from '@/lib/hooks';

/** A Unite Club chapter for its members: meetings and events, members, referrals, officer tools. */
export default function ChapterHome() {
  const { slug } = useParams<{ slug: string }>();
  const q = useQuery<UcView>(`/unite-club/chapters/${slug}`);
  const c = q.data?.chapter;
  return (
    <Screen page={{ key: 'my-club-chapter', title: c?.name ?? 'Chapter', access: 'partner' }} header={false}>
      <Link href="/my-club" className="cz-od-back"><Icon name="prev" size={16} />Unite Club</Link>
      {q.error ? <ApiErrorView error={q.error} onRetry={q.reload} /> : !q.data ? <Skeleton height={300} /> : (
        <>
          <header className="cz-uc-head" data-screen="my-club-chapter">
            <div><p className="cz-ph-eyebrow">{c!.city} · {c!.meetingSchedule}{c!.venue ? ` · ${c!.venue}` : ''}</p><h1>{c!.name}</h1><p>{c!.about}</p></div>
            <Link href={`/unite-club/${c!.slug}`} className="cz-btn cz-btn-secondary cz-btn-sm">Public page</Link>
          </header>
          <UcDashboard v={q.data} reload={q.reload} />
        </>
      )}
    </Screen>
  );
}
