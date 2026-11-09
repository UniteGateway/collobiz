'use client';
import Link from 'next/link';
import { useState } from 'react';
import { COMPANY_CATEGORY_LABELS, sectorName } from '@collabiz/types';
import { Card, EmptyState, Icon, LoadingState, Segmented } from '@collabiz/ui';
import { ApiErrorView } from '@/components/Screen';
import { Hero, WorkspaceNav, inr } from '@/components/Workspace';
import { useQuery } from '@/lib/hooks';

interface Company { id: string; name: string; legalName: string; category: string; country: string; countryName: string; city: string | null; sectors: string[]; description: string | null; parent: string | null; people: number; liveProjects: number; projectValue: number; businesses: number; products: number; openOffers: number; wonSales: number }
interface Res { companies: Company[]; totals: { companies: number; countries: number; people: number; liveProjects: number; projectPortfolio: number; businesses: number; sectors: number } }
const CAT_TINT: Record<string, string> = { parent: 'navy', operating: 'green', manufacturing: 'violet', infra: 'teal', projects: 'blue', jv: 'violet', international: 'blue', media: 'red', business: 'navy', trade: 'amber', fintech: 'slate', allied: 'slate' };

/** Unite Group companies — the whole group in one view, with what each company is doing on the platform. */
export default function WorkspaceCompanies() {
  const q = useQuery<Res>('/admin/workspace/companies');
  const [f, setF] = useState('all');
  const ORDER = ['parent', 'operating', 'manufacturing', 'projects', 'infra', 'international', 'jv', 'business', 'trade', 'media', 'fintech', 'allied'];
  const list = [...(q.data?.companies ?? [])].sort((a, b) => ORDER.indexOf(a.category) - ORDER.indexOf(b.category) || a.name.localeCompare(b.name)).filter((c) => f === 'all' || (f === 'india' ? c.country === 'IN' : f === 'intl' ? c.country !== 'IN' : c.category === f));
  const count = (fn: (c: Company) => boolean) => (q.data?.companies ?? []).filter(fn).length;
  const t = q.data?.totals;
  return (
    <div className="cz-ws">
      <WorkspaceNav />
      <Hero eyebrow="Unite Group" title="Our group of" accent="companies" sub="Diversified businesses, one vision — every company on the same platform, with the same partners, people and records." chips={['Renewable energy', 'Manufacturing', 'Infrastructure', 'Real estate', 'Global trade', 'Digital and services']} />
      {q.error ? <ApiErrorView error={q.error} onRetry={q.reload} /> : !q.data || !t ? <LoadingState /> : (
        <>
          <div className="cz-ws-kpis">
            {([['building', t.companies, 'Group companies', `${t.sectors} sectors`], ['map', t.countries, 'Countries', 'with a registered company'], ['users', t.people, 'People', 'on the platform'], ['projects', t.liveProjects, 'Live projects', inr(t.projectPortfolio)], ['sector', t.businesses, 'Unite businesses', 'operated by these companies']] as const).map(([icon, v, l, sub]) => (
              <div key={l} className="cz-ws-kpi"><span className="cz-app-icon cz-tint-navy"><Icon name={icon} size={20} /></span><div><strong>{v}</strong><span>{l}</span><small>{sub}</small></div></div>
            ))}
          </div>
          <Card>
            <div className="cz-ws-section-head" style={{ flexWrap: 'wrap' }}>
              <h2>Our companies</h2>
              <div className="cz-ws-scroll"><Segmented label="Filter companies" value={f} onChange={setF} options={[
                { value: 'all', label: `All ${t.companies}` }, { value: 'india', label: `India ${count((c) => c.country === 'IN')}` }, { value: 'intl', label: `International ${count((c) => c.country !== 'IN')}` },
                { value: 'manufacturing', label: `Manufacturing ${count((c) => c.category === 'manufacturing')}` }, { value: 'business', label: `Businesses ${count((c) => c.category === 'business')}` },
              ]} /></div>
            </div>
            {!list.length ? <EmptyState icon="building" title="No companies match" /> : (
              <div className="cz-company-grid">
                {list.map((c) => (
                  <article key={c.id} className="cz-company" data-company={c.name}>
                    <div className="cz-company-head"><strong>{c.name}</strong><span className={`cz-company-cat cz-tint-${CAT_TINT[c.category] ?? 'navy'}`}>{COMPANY_CATEGORY_LABELS[c.category] ?? c.category}</span></div>
                    <span className="cz-muted" style={{ fontSize: 13 }}><Icon name="location" size={13} /> {[c.city, c.countryName].filter(Boolean).join(', ')}{c.parent ? ` · part of ${c.parent}` : ''}</span>
                    {c.description && <span style={{ fontSize: 13.5 }}>{c.description}</span>}
                    {c.sectors.length > 0 && <span className="cz-muted" style={{ fontSize: 12.5 }}>{c.sectors.map(sectorName).join(' · ')}</span>}
                    <div className="cz-company-stats">
                      <span><b>{c.people}</b> people</span><span><b>{c.liveProjects}</b> live projects</span>
                      {c.businesses > 0 && <span><b>{c.businesses}</b> businesses</span>}{c.products > 0 && <span><b>{c.products}</b> products</span>}
                      {c.openOffers > 0 && <span><b>{c.openOffers}</b> open offers</span>}{c.wonSales > 0 && <span><b>{inr(c.wonSales)}</b> won</span>}
                    </div>
                  </article>
                ))}
              </div>
            )}
          </Card>
          <Card title="Manage the group">
            <ul className="cz-ws-list">
              <li><Link href="/group-companies">Add a company or edit details</Link><Icon name="next" size={16} /></li>
              <li><Link href="/ventures">Unite businesses and their promoters</Link><Icon name="next" size={16} /></li>
              <li><Link href="/users">People and roles</Link><Icon name="next" size={16} /></li>
              <li><Link href="/analytics">Group analytics</Link><Icon name="next" size={16} /></li>
            </ul>
            <p className="cz-muted" style={{ margin: '10px 0 0', fontSize: 12.5 }}>Figures count only what is recorded on the platform. Group revenue and ownership come with Finance (Phase C).</p>
          </Card>
        </>
      )}
    </div>
  );
}
