'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { EmptyState, Icon, SearchInput, Skeleton, type IconName } from '@collabiz/ui';
import { Screen, ApiErrorView } from '@/components/Screen';
import { useQuery } from '@/lib/hooks';

interface Res { q: string; groups: { key: string; label: string; items: { id: string; title: string; subtitle: string; href: string }[] }[] }
const ICON: Record<string, IconName> = { opportunities: 'opportunities', products: 'package', apps: 'building', documents: 'documents', invest: 'value', community: 'messages' };

/** Search everything: opportunities, products, Unite apps, documents, investment offers and community posts. */
export default function Search() {
  const [q, setQ] = useState('');
  const [term, setTerm] = useState('');
  useEffect(() => { const v = new URLSearchParams(window.location.search).get('q') ?? ''; setQ(v); setTerm(v); }, []);
  useEffect(() => { const t = setTimeout(() => { setTerm(q.trim()); const u = new URL(window.location.href); if (q.trim()) u.searchParams.set('q', q.trim()); else u.searchParams.delete('q'); window.history.replaceState(null, '', u); }, 300); return () => clearTimeout(t); }, [q]);
  const r = useQuery<Res>(term.length >= 2 ? '/search' : null, { q: term });
  return (
    <Screen page={{ key: 'search', title: 'Search', access: 'partner' }} description="Opportunities, products, Unite apps, catalogues and documents, investment offers and community posts.">
      <div style={{ maxWidth: 720, marginBottom: 18 }}><SearchInput label="Search COLLABIZ" placeholder="Try “solar”, “transformer”, “Pune”…" value={q} onChange={(e) => setQ(e.target.value)} autoFocus /></div>
      {term.length < 2 ? <p className="cz-muted">Type at least two letters. For filters by sector, value and deadline use <Link href="/marketplace/search">advanced opportunity search</Link>.</p>
        : r.error ? <ApiErrorView error={r.error} onRetry={r.reload} /> : !r.data ? <Skeleton height={240} /> : !r.data.groups.length ? <div className="cz-card"><EmptyState icon="search" title={`Nothing found for “${term}”`}>Check the spelling or try a broader word.</EmptyState></div> : (
          <div className="cz-search-groups">{r.data.groups.map((g) => (
            <section key={g.key} className="cz-card" aria-labelledby={`sg-${g.key}`}>
              <h2 id={`sg-${g.key}`} className="cz-search-h"><Icon name={ICON[g.key] ?? 'search'} size={18} />{g.label}<span className="cz-muted">{g.items.length}</span></h2>
              <ul className="cz-latest-list">{g.items.map((i) => <li key={i.id}><Link href={i.href}><span className="cz-latest-dot" style={{ ['--hue' as string]: '#1E6BFF' }} aria-hidden /><span><strong>{i.title}</strong><span className="cz-muted">{i.subtitle}</span></span><Icon name="next" size={16} /></Link></li>)}</ul>
            </section>
          ))}</div>
        )}
    </Screen>
  );
}
