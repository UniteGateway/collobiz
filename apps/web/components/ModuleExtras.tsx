'use client';
/** Module home extras: a gradient hero with a light animated illustration, and the module's catalogues & documents. */
import { useRouter } from 'next/navigation';
import { DOCUMENT_MODULE_LABELS } from '@collabiz/types';
import { Icon, Skeleton, type IconName } from '@collabiz/ui';
import { api } from '@/lib/api';
import { useMutation, useQuery } from '@/lib/hooks';

/** Navigation module → [document module key, hero palette]. Modules not listed get no hero / documents section. */
export const MODULE_EXTRAS: Record<string, { docs: string; palette: 'navy' | 'green' | 'sun' | 'violet' | 'teal'; icon: IconName }> = {
  collab: { docs: 'collab', palette: 'green', icon: 'teams' }, 'business-offers': { docs: 'business-offers', palette: 'violet', icon: 'briefcase' },
  opportunities: { docs: 'opportunities', palette: 'navy', icon: 'opportunities' }, leads: { docs: 'leads', palette: 'teal', icon: 'leads' },
  collaboration: { docs: 'collaboration', palette: 'green', icon: 'teams' }, 'unite-solar': { docs: 'unite-solar', palette: 'sun', icon: 'value' },
  powertek: { docs: 'powertek', palette: 'navy', icon: 'package' }, ventures: { docs: 'ventures', palette: 'violet', icon: 'building' },
  tenders: { docs: 'tenders', palette: 'teal', icon: 'tenders' }, projects: { docs: 'projects', palette: 'navy', icon: 'projects' },
  trading: { docs: 'trading', palette: 'sun', icon: 'trading' }, earnings: { docs: 'earnings', palette: 'green', icon: 'earnings' },
  global: { docs: 'global', palette: 'teal', icon: 'map' }, growth: { docs: 'growth', palette: 'violet', icon: 'award' }, help: { docs: 'help', palette: 'navy', icon: 'help' },
};

/** Decorative scene behind the page title: soft gradient orbs, a flowing network line and the module's glyph. Hidden from screen readers; still when the user prefers reduced motion. */
export function HeroArt({ icon }: { icon: IconName }) {
  return (
    <div className="cz-hero-art" aria-hidden>
      <span className="cz-orb cz-orb-a" /><span className="cz-orb cz-orb-b" /><span className="cz-orb cz-orb-c" />
      <svg className="cz-hero-lines" viewBox="0 0 600 200" preserveAspectRatio="none">
        <path d="M0 150 C 120 60, 220 190, 340 110 S 520 40, 600 90" />
        <path d="M0 180 C 140 120, 260 200, 380 150 S 540 90, 600 130" />
        {[[120, 96], [260, 158], [340, 110], [470, 70]].map(([x, y], i) => <circle key={i} cx={x} cy={y} r="4" style={{ animationDelay: `${i * 0.6}s` }} />)}
      </svg>
      <span className="cz-hero-glyph"><Icon name={icon} size={92} /></span>
    </div>
  );
}

interface Doc { id: string; title: string; kind: string; kindLabel: string; description: string | null; source: 'file' | 'link'; fileName: string | null; size: number | null; version: number; updatedAt: string; module: string; moduleKey: string }
const sizeOf = (b: number | null) => (b == null ? '' : b > 1e6 ? `${(b / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1e3))} KB`);
const KIND_ICON: Record<string, IconName> = { catalogue: 'package', brochure: 'documents', dpr: 'projects', datasheet: 'documents', presentation: 'opportunities', policy: 'verify', template: 'edit', guide: 'learning', other: 'documents' };

/** Catalogues, brochures, DPRs and other documents for a module (plus COLLABIZ-wide ones). */
export function ModuleDocuments({ moduleKey, title, kind }: { moduleKey: string; title?: string; kind?: string }) {
  const router = useRouter();
  const q = useQuery<Doc[]>('/documents', { module: moduleKey, kind });
  const open = useMutation(async (d: Doc) => {
    const r = await api.post<{ url: string }>(`/documents/${d.id}/open`);
    if (r.url.startsWith('/v1/')) window.open(`/api${r.url}`, '_blank', 'noopener');
    else if (r.url.startsWith('/')) router.push(r.url);
    else window.open(r.url, '_blank', 'noopener,noreferrer');
  });
  const label = moduleKey === 'all' ? 'COLLABIZ' : DOCUMENT_MODULE_LABELS[moduleKey] ?? moduleKey;
  return (
    <section className="cz-card cz-docs" aria-label={title ?? `${label} catalogues and documents`} data-module-docs={moduleKey}>
      <div className="cz-row" style={{ justifyContent: 'space-between', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0, fontSize: 17 }}>{title ?? 'Catalogues, brochures & documents'}</h2>
        {moduleKey !== 'all' && <a href="/library" style={{ fontSize: 13 }}>All documents</a>}
      </div>
      {q.loading && !q.data ? <Skeleton height={60} /> : !q.data?.length ? (
        <p className="cz-muted" style={{ fontSize: 13.5, margin: '8px 0 0' }}>Catalogues, brochures, DPRs and datasheets for {label} appear here as soon as Unite publishes them.</p>
      ) : (
        <ul className="cz-docs-list">
          {q.data.map((d) => (
            <li key={d.id}>
              <button type="button" onClick={() => open.run(d)} aria-label={`Open ${d.title}`}>
                <span className={`cz-doc-ic cz-doc-${d.kind}`}><Icon name={KIND_ICON[d.kind] ?? 'documents'} size={20} /></span>
                <span className="cz-doc-text"><strong>{d.title}</strong>
                  <span className="cz-muted">{d.kindLabel}{moduleKey === 'all' || d.moduleKey === 'general' ? ` · ${d.module}` : ''}{d.source === 'file' ? ` · PDF${d.size ? ` · ${sizeOf(d.size)}` : ''}${d.version > 1 ? ` · v${d.version}` : ''}` : ' · Link'}</span>
                  {d.description && <span className="cz-doc-desc">{d.description}</span>}
                </span>
                <Icon name={d.source === 'file' ? 'download' : 'external'} size={18} />
              </button>
            </li>
          ))}
        </ul>
      )}
      {open.error && <p role="alert" className="cz-error-text">{open.error}</p>}
    </section>
  );
}
