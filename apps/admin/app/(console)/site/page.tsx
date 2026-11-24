'use client';
import { useEffect, useState } from 'react';
import { SOCIAL_NETWORKS, VIDEO_PAGES } from '@collabiz/types';
import { Alert, Button, Card, Checkbox, EmptyState, LoadingState, Segmented, TextArea, TextInput } from '@collabiz/ui';
import { BannerHeader } from '@/components/Banner';
import { ApiErrorView } from '@/components/Screen';
import { api } from '@/lib/api';
import { useMutation, useQuery } from '@/lib/hooks';

interface Video { id: string; youtubeId: string; title: string; description: string | null; placements: string[]; sort: number; published: boolean }
interface Site { social: Record<string, string>; videos: Video[] }
interface Product { slug: string; name: string }

/** Website content: social links shown in every page footer, and the YouTube video library placed on pages. */
export default function SiteContent() {
  const [tab, setTab] = useState('videos');
  const q = useQuery<Site>('/admin/site');
  return (
    <div className="cz-stack" style={{ gap: 16 }}>
      <BannerHeader title="Website content" description="Add Unite's YouTube videos and choose the pages they appear on, and set the social media links shown at the bottom of every page. Pages show nothing for empty slots, so there are never blank boxes." />
      <Segmented label="Show" value={tab} onChange={setTab} options={[{ value: 'videos', label: 'Videos' }, { value: 'social', label: 'Social links' }]} />
      {q.error ? <ApiErrorView error={q.error} onRetry={q.reload} /> : !q.data ? <LoadingState /> : tab === 'social' ? <Social initial={q.data.social} onDone={q.reload} /> : <Videos list={q.data.videos} onDone={q.reload} />}
    </div>
  );
}

function Social({ initial, onDone }: { initial: Record<string, string>; onDone: () => void }) {
  const [f, setF] = useState<Record<string, string>>(initial);
  const [ok, setOk] = useState(false);
  const m = useMutation(async () => { await api.put('/admin/site/social', f); setOk(true); onDone(); return true; });
  return (
    <Card>
      <form className="cz-stack" style={{ gap: 12 }} onSubmit={(e) => { e.preventDefault(); setOk(false); m.run(); }} data-form="site-social">
        {m.error && <Alert tone="danger" title={m.error}>Please check the highlighted links.</Alert>}
        {ok && <Alert tone="success">Saved. The links now appear in the footer of every page.</Alert>}
        <div className="cz-grid cz-grid-2">
          {SOCIAL_NETWORKS.map((n) => <TextInput key={n.key} label={n.label} type="url" placeholder={`https://${n.hosts[0]}/…`} value={f[n.key] ?? ''} onChange={(e) => setF({ ...f, [n.key]: e.target.value })} error={m.fieldErrors[n.key]} />)}
        </div>
        <p className="cz-muted" style={{ margin: 0, fontSize: 13 }}>Use Unite Group's official pages only. Leave a network blank to hide it.</p>
        <div><Button type="submit" loading={m.pending}>Save social links</Button></div>
      </form>
    </Card>
  );
}

const blank = { url: '', title: '', description: '', placements: ['home'] as string[], sort: 0, published: true };

function Videos({ list, onDone }: { list: Video[]; onDone: () => void }) {
  const [edit, setEdit] = useState<{ id?: string } & typeof blank | null>(null);
  const del = useMutation(async (id: string) => { if (!window.confirm('Remove this video from the website?')) return false; await api.delete(`/admin/site/videos/${id}`); onDone(); return true; });
  return (
    <>
      {edit ? <VideoForm v={edit} onClose={() => setEdit(null)} onDone={() => { setEdit(null); onDone(); }} /> : <div><Button variant="accent" onClick={() => setEdit({ ...blank })}>Add a video</Button></div>}
      {!list.length ? <Card><EmptyState icon="eye" title="No videos yet">Paste a YouTube link to show it on the home page, a product page, U meet or any other page.</EmptyState></Card> : (
        <div className="cz-grid cz-grid-3">{list.map((v) => (
          <Card key={v.id}>
            <img src={`https://i.ytimg.com/vi/${v.youtubeId}/hqdefault.jpg`} alt="" style={{ width: '100%', aspectRatio: '16/9', objectFit: 'cover', borderRadius: 12 }} />
            <h3 style={{ margin: '10px 0 4px' }}>{v.title}</h3>
            <p className="cz-muted" style={{ fontSize: 13, margin: 0 }}>{v.published ? 'Published' : 'Hidden'} · {v.placements.map((p) => VIDEO_PAGES.find(([k]) => k === p)?.[1] ?? p.replace(/^product:/, 'Product: ')).join(', ')}</p>
            <div className="cz-row" style={{ gap: 8, marginTop: 10 }}>
              <Button size="sm" variant="secondary" onClick={() => setEdit({ id: v.id, url: `https://youtu.be/${v.youtubeId}`, title: v.title, description: v.description ?? '', placements: v.placements, sort: v.sort, published: v.published })}>Edit</Button>
              <Button size="sm" variant="ghost" onClick={() => del.run(v.id)}>Remove</Button>
            </div>
          </Card>
        ))}</div>
      )}
    </>
  );
}

function VideoForm({ v, onClose, onDone }: { v: { id?: string } & typeof blank; onClose: () => void; onDone: () => void }) {
  const [f, setF] = useState(v);
  const [products, setProducts] = useState<Product[]>([]);
  useEffect(() => { api.get<Product[]>('/public/products').then((p) => setProducts(p.map((x) => ({ slug: x.slug, name: x.name })))).catch(() => undefined); }, []);
  const toggle = (k: string) => setF({ ...f, placements: f.placements.includes(k) ? f.placements.filter((x) => x !== k) : [...f.placements, k] });
  const m = useMutation(async () => {
    const body = { url: f.url, title: f.title, description: f.description, placements: f.placements, sort: Number(f.sort) || 0, published: f.published };
    if (f.id) await api.put(`/admin/site/videos/${f.id}`, body); else await api.post('/admin/site/videos', body);
    onDone(); return true;
  });
  const prodKeys = f.placements.filter((p) => p.startsWith('product:'));
  return (
    <Card>
      <form className="cz-stack" style={{ gap: 12 }} onSubmit={(e) => { e.preventDefault(); m.run(); }} data-form="site-video">
        <h2 style={{ margin: 0 }}>{f.id ? 'Edit video' : 'Add a video'}</h2>
        {m.error && <Alert tone="danger">{m.error}</Alert>}
        <div className="cz-grid cz-grid-2">
          <TextInput label="YouTube link" placeholder="https://www.youtube.com/watch?v=…" value={f.url} onChange={(e) => setF({ ...f, url: e.target.value })} error={m.fieldErrors.url} />
          <TextInput label="Title" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} error={m.fieldErrors.title} />
        </div>
        <TextArea label="Short description (optional)" rows={2} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
        <fieldset className="cz-fieldset"><legend>Show on these pages</legend>
          <div className="cz-grid cz-grid-3">{VIDEO_PAGES.map(([k, label]) => <Checkbox key={k} label={label} checked={f.placements.includes(k)} onChange={() => toggle(k)} />)}</div>
          {m.fieldErrors.placements && <p className="cz-error-text">{m.fieldErrors.placements}</p>}
        </fieldset>
        <label className="cz-field"><span className="cz-label">Also on a Unite product page</span>
          <select className="cz-select" value="" onChange={(e) => e.target.value && toggle(`product:${e.target.value}`)} aria-label="Add a product page">
            <option value="">Choose a product…</option>
            {products.filter((p) => !prodKeys.includes(`product:${p.slug}`)).map((p) => <option key={p.slug} value={p.slug}>{p.name}</option>)}
          </select>
        </label>
        {prodKeys.length > 0 && <div className="cz-chips">{prodKeys.map((k) => <button key={k} type="button" className="cz-chip" onClick={() => toggle(k)}>{products.find((p) => `product:${p.slug}` === k)?.name ?? k.slice(8)} ×</button>)}</div>}
        <div className="cz-grid cz-grid-2">
          <TextInput label="Order (lower shows first)" inputMode="numeric" value={String(f.sort)} onChange={(e) => setF({ ...f, sort: Number(e.target.value) || 0 })} />
          <Checkbox label="Published" checked={f.published} onChange={(e) => setF({ ...f, published: e.target.checked })} />
        </div>
        <div className="cz-row" style={{ gap: 8 }}><Button type="submit" loading={m.pending}>{f.id ? 'Save' : 'Add video'}</Button><Button type="button" variant="ghost" onClick={onClose}>Cancel</Button></div>
      </form>
    </Card>
  );
}
