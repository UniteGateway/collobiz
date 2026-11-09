'use client';
import { useState } from 'react';
import { APP_CATEGORIES, APP_CATEGORY_LABELS, WORKSPACE_APPS } from '@collabiz/types';
import { Card, Segmented, StatusBadge } from '@collabiz/ui';
import { AppTile, Hero, WorkspaceNav } from '@/components/Workspace';
import { useQuery } from '@/lib/hooks';

interface Integration { key: string; name: string; purpose: string; connected: boolean; needs: string }

/** Every business app on the platform, grouped like the business itself. Planned apps say which phase brings them. */
export default function WorkspaceApps() {
  const [cat, setCat] = useState('all');
  const integrations = useQuery<Integration[]>('/admin/workspace/integrations');
  const live = WORKSPACE_APPS.filter((a) => a.status === 'live').length;
  const partial = WORKSPACE_APPS.filter((a) => a.status === 'partial').length;
  const shown = WORKSPACE_APPS.filter((a) => cat === 'all' || a.category === cat || (cat === 'soon' && a.status !== 'live'));
  return (
    <div className="cz-ws">
      <WorkspaceNav />
      <Hero title="Business" accent="apps" sub="Every Unite business application on one platform — one sign-in, one database, one set of permissions."
        chips={[`${live} apps live`, `${partial} partly live`, `${WORKSPACE_APPS.length - live - partial} planned`, 'Shared security and audit trail']} />
      <div className="cz-ws-scroll"><Segmented label="Show" value={cat} onChange={setCat} options={[{ value: 'all', label: `All ${WORKSPACE_APPS.length}` }, ...APP_CATEGORIES.filter((c) => c !== 'integrations').map((c) => ({ value: c, label: APP_CATEGORY_LABELS[c] })), { value: 'soon', label: 'Coming next' }]} /></div>
      {APP_CATEGORIES.filter((c) => c !== 'integrations').map((c) => {
        const apps = shown.filter((a) => a.category === c);
        if (!apps.length) return null;
        return (
          <Card key={c}>
            <div className="cz-ws-section-head"><h2>{APP_CATEGORY_LABELS[c]}</h2><span className="cz-muted" style={{ fontSize: 13 }}>{apps.length} apps</span></div>
            <div className="cz-app-grid">{apps.map((a) => <AppTile key={a.key} app={a} />)}</div>
            {apps.some((a) => a.note && a.status !== 'live') && (
              <ul style={{ margin: '12px 0 0', paddingLeft: 18, fontSize: 13, color: 'var(--cz-grey-600)' }}>{apps.filter((a) => a.note && a.status !== 'live').map((a) => <li key={a.key}><strong>{a.name}:</strong> {a.note}</li>)}</ul>
            )}
          </Card>
        );
      })}
      {(cat === 'all' || cat === 'soon') && (
        <Card title="Integrations" subtitle="Outside systems the apps connect to. Nothing is connected without your account and approval.">
          <ul className="cz-stack" style={{ gap: 10, listStyle: 'none', margin: 0, padding: 0 }}>
            {(integrations.data ?? []).map((i) => (
              <li key={i.key} className="cz-row" style={{ gap: 12, alignItems: 'flex-start' }} data-integration={i.key}>
                <div style={{ flex: 1, minWidth: 220 }}><strong style={{ color: 'var(--cz-navy-900)' }}>{i.name}</strong><div className="cz-muted" style={{ fontSize: 13 }}>{i.purpose}{i.connected ? '' : ` · Needs: ${i.needs}`}</div></div>
                <StatusBadge status={i.connected ? 'active' : 'pending'} tone={i.connected ? 'success' : 'neutral'} label={i.connected ? 'Connected' : 'Not connected'} />
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
