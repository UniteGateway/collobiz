'use client';
import Link from 'next/link';
import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Card, EmptyState, LoadingState } from '@collabiz/ui';
import { ApiErrorView } from '@/components/Screen';
import { WorkspaceNav, resolveHref } from '@/components/Workspace';
import { useQuery } from '@/lib/hooks';

interface Res { q: string; groups: { key: string; label: string; items: { id: string; title: string; subtitle: string; href: string | null }[] }[] }

function Results() {
  const term = useSearchParams().get('q') ?? '';
  const q = useQuery<Res>(term.length >= 2 ? `/admin/workspace/search?q=${encodeURIComponent(term)}` : null);
  return (
    <div className="cz-ws">
      <WorkspaceNav />
      <h1 style={{ margin: 0, fontSize: 24, color: 'var(--cz-navy-900)' }}>Results for “{term}”</h1>
      {term.length < 2 ? <Card><EmptyState icon="search" title="Type at least two letters" /></Card> : q.error ? <ApiErrorView error={q.error} onRetry={q.reload} /> : !q.data ? <LoadingState /> : !q.data.groups.length ? (
        <Card><EmptyState icon="search" title="Nothing found">Try a company, partner, project code, business or person’s name.</EmptyState></Card>
      ) : q.data.groups.map((g) => (
        <Card key={g.key} title={g.label}>
          <ul className="cz-ws-list" data-group={g.key}>
            {g.items.map((i) => (
              <li key={i.id} style={{ alignItems: 'flex-start' }}>
                <span>{i.href ? (i.href.startsWith('web:') ? <a href={resolveHref(i.href)}>{i.title}</a> : <Link href={i.href}>{i.title}</Link>) : <strong>{i.title}</strong>}<br /><span className="cz-muted" style={{ fontSize: 12.5 }}>{i.subtitle}</span></span>
              </li>
            ))}
          </ul>
        </Card>
      ))}
    </div>
  );
}

export default function WorkspaceSearch() {
  return <Suspense><Results /></Suspense>;
}
