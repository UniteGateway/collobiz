'use client';
import { useRef, useState } from 'react';
import { DASHBOARD_THEMES, DASHBOARD_THEME_LABELS } from '@collabiz/types';
import { Alert, Button, DataTable, LoadingState, Segmented, Select, StatusBadge, TextArea, TextInput } from '@collabiz/ui';
import { ApiErrorView } from '@/components/Screen';
import { Hero, WorkspaceNav } from '@/components/Workspace';
import { api } from '@/lib/api';
import { useMutation, useQuery } from '@/lib/hooks';

type R = Record<string, any>;
const blank = { kind: 'ad', title: '', body: '', url: '', ctaLabel: '', theme: '', startsOn: '', endsOn: '', sortOrder: '100' };

/** Dashboard ads & videos — what partners see in the ad slot and the video player on their Home dashboard. */
export default function DashboardContent() {
  const q = useQuery<R[]>('/admin/dashboard-content');
  const [f, setF] = useState(blank);
  const [editing, setEditing] = useState<string | null>(null);
  const img = useRef<HTMLInputElement>(null);
  const save = useMutation(async () => {
    const fd = new FormData();
    Object.entries(f).forEach(([k, v]) => { if (v !== '') fd.append(k, v); });
    const file = img.current?.files?.[0]; if (file && f.kind === 'ad') fd.append('image', file);
    await api.request('POST', editing ? `/admin/dashboard-content/${editing}` : '/admin/dashboard-content', undefined, { form: fd });
    setF({ ...blank, kind: f.kind }); setEditing(null); if (img.current) img.current.value = ''; q.reload();
  });
  const toggle = useMutation(async (c: R) => { await api.post(`/admin/dashboard-content/${c.id}/active`, { active: !c.active }); q.reload(); });
  const edit = (c: R) => { setEditing(c.id); setF({ kind: c.kind, title: c.title, body: c.body ?? '', url: c.url, ctaLabel: c.ctaLabel ?? '', theme: c.theme ?? '', startsOn: c.startsOn ?? '', endsOn: c.endsOn ?? '', sortOrder: String(c.sortOrder) }); window.scrollTo({ top: 0, behavior: 'smooth' }); };
  return (
    <div className="cz-ws">
      <WorkspaceNav />
      <Hero title="Dashboard" accent="ads & videos" sub="Book the ad slot and the video player on partners’ Home dashboards — for everyone or one business domain, within dates. With nothing booked, partners see Unite’s own programmes." chips={['Ad slot', 'Videos', 'Domain targeting', 'Clicks']} />
      <section className="cz-card" style={{ marginBottom: 16 }} aria-label={editing ? 'Edit' : 'Add'}>
        <h2 style={{ marginTop: 0, fontSize: 17 }}>{editing ? 'Edit' : 'Add to dashboards'}</h2>
        <form className="cz-stack" style={{ gap: 10 }} onSubmit={(e) => { e.preventDefault(); save.run(); }}>
          <Segmented label="Type" value={f.kind} onChange={(v) => setF({ ...f, kind: v })} options={[{ value: 'ad', label: 'Ad' }, { value: 'video', label: 'Video' }]} />
          <TextInput label="Title" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} error={save.fieldErrors.title} />
          <TextArea label="Text (optional)" rows={2} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} />
          <div className="cz-grid cz-grid-2">
            <TextInput label={f.kind === 'video' ? 'YouTube or Vimeo link' : 'Button goes to (https://… or /in-app-path)'} value={f.url} onChange={(e) => setF({ ...f, url: e.target.value })} error={save.fieldErrors.url} />
            {f.kind === 'ad' && <TextInput label="Button label (optional)" value={f.ctaLabel} onChange={(e) => setF({ ...f, ctaLabel: e.target.value })} />}
            <Select label="Show to" value={f.theme} placeholder="Every business domain" onChange={(e) => setF({ ...f, theme: e.target.value })} options={DASHBOARD_THEMES.map((t) => ({ value: t, label: DASHBOARD_THEME_LABELS[t] }))} />
            <TextInput label="Order (lower first)" inputMode="numeric" value={f.sortOrder} onChange={(e) => setF({ ...f, sortOrder: e.target.value.replace(/\D/g, '') })} />
            <TextInput label="From (optional)" type="date" value={f.startsOn} onChange={(e) => setF({ ...f, startsOn: e.target.value })} />
            <TextInput label="Until (optional)" type="date" value={f.endsOn} onChange={(e) => setF({ ...f, endsOn: e.target.value })} error={save.fieldErrors.endsOn} />
          </div>
          {f.kind === 'ad' && <label className="cz-field"><span className="cz-label">Image (optional, PNG/JPEG/WEBP, wide works best)</span><input ref={img} type="file" accept="image/png,image/jpeg,image/webp" aria-label="Image" /></label>}
          {save.error && <Alert tone="danger">{save.error}</Alert>}
          <div className="cz-row" style={{ gap: 8 }}><Button type="submit" loading={save.pending} disabled={f.title.length < 3 || !f.url}>{editing ? 'Save' : 'Publish'}</Button>{editing && <Button type="button" variant="ghost" onClick={() => { setEditing(null); setF(blank); }}>Cancel</Button>}</div>
        </form>
      </section>
      {toggle.error && <Alert tone="danger">{toggle.error}</Alert>}
      {q.error ? <ApiErrorView error={q.error} onRetry={q.reload} /> : !q.data ? <LoadingState /> : (
        <section className="cz-card"><DataTable caption="Booked content" rows={q.data} columns={[
          { key: 't', header: 'Content', render: (c: R) => <><strong>{c.title}</strong><br /><span className="cz-muted" style={{ fontSize: 12 }}>{c.kind === 'video' ? 'Video' : 'Ad'}{c.hasImage ? ' · with image' : ''} · {c.url}</span></> },
          { key: 'd', header: 'Shown to', render: (c: R) => (c.theme ? DASHBOARD_THEME_LABELS[c.theme as keyof typeof DASHBOARD_THEME_LABELS] : 'Everyone') },
          { key: 'w', header: 'Dates', render: (c: R) => (c.startsOn || c.endsOn ? `${c.startsOn ?? '…'} → ${c.endsOn ?? '…'}` : 'Always') },
          { key: 'c', header: 'Clicks', render: (c: R) => c.clicks },
          { key: 's', header: 'Status', render: (c: R) => <StatusBadge status={c.active ? 'active' : 'off'} tone={c.active ? 'success' : 'neutral'} label={c.active ? 'On' : 'Off'} /> },
          { key: 'a', header: '', render: (c: R) => <div className="cz-row" style={{ gap: 4 }}><Button size="sm" variant="ghost" onClick={() => edit(c)}>Edit</Button><Button size="sm" variant="ghost" onClick={() => toggle.run(c)}>{c.active ? 'Turn off' : 'Turn on'}</Button></div> },
        ]} /></section>
      )}
    </div>
  );
}
