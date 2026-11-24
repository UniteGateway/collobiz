'use client';
/** Admin: add or edit a Unite brand product. Publishing creates its microsite, web address, applications and matching. */
import { useState } from 'react';
import { BUSINESS_TYPES, CHANNEL_ROLES, OEM_STATUS, SECTORS, productUrl, slugify } from '@collabiz/types';
import { Alert, Button, Card, Checkbox, ChipSelect, EmptyState, LoadingState, Select, StatusBadge, TextArea, TextInput } from '@collabiz/ui';
import { ApiErrorView } from '@/components/Screen';
import { api } from '@/lib/api';
import { useMutation, useQuery } from '@/lib/hooks';

interface Row { id: string; slug: string; subdomain: string; name: string; category: string; sector: string; tagline: string; summary: string; buyers: string; roles: string[]; strong: string[]; good: string[]; bulk: boolean; showroom: boolean; features: { title: string; text: string; planned?: boolean }[]; workflow: { title: string; text: string }[]; accent: string[]; logo: string | null; heroImage: string | null; status: string; open: boolean; oemPartner: string | null; oemStatus: string | null; applications: number; partners: number }
type Form = { name: string; slug: string; subdomain: string; category: string; sector: string; tagline: string; summary: string; buyers: string; roles: string[]; strong: string[]; good: string[]; bulk: boolean; showroom: boolean; features: { title: string; text: string; planned: boolean }[]; workflow: { title: string; text: string }[]; accent: [string, string]; oemPartner: string; oemStatus: string; logo: string; heroImage: string };
const empty: Form = { name: '', slug: '', subdomain: '', category: 'Building Materials · Unite brand', sector: 'manufacturing', tagline: '', summary: '', buyers: '', roles: ['distributor', 'dealer', 'store', 'franchise'], strong: [], good: [], bulk: false, showroom: true, features: [], workflow: [], accent: ['#011E48', '#2E7D32'], oemPartner: '', oemStatus: 'planned', logo: '', heroImage: '' };
const web = process.env.NEXT_PUBLIC_WEB_URL ?? 'http://localhost:3000';
const types = BUSINESS_TYPES.map((b) => ({ value: b.code, label: b.label }));

export function BrandProducts() {
  const q = useQuery<{ items: Row[] }>('/admin/brand-products/catalogue');
  const [edit, setEdit] = useState<Row | 'new' | null>(null);
  const publish = useMutation(async (slug: string) => { await api.post(`/admin/brand-products/catalogue/${slug}/publish`, {}); q.reload(); return true; });
  if (edit) return <Editor row={edit === 'new' ? null : edit} onDone={() => { setEdit(null); q.reload(); }} />;
  return (
    <div className="cz-stack" style={{ gap: 12 }}>
      <div><Button onClick={() => setEdit('new')}>Add a product</Button></div>
      {publish.error && <Alert tone="danger">{publish.error}</Alert>}
      {q.error ? <ApiErrorView error={q.error} onRetry={q.reload} /> : !q.data ? <LoadingState /> : !q.data.items.length ? <Card><EmptyState icon="package" title="No products yet">Add the first Unite brand product.</EmptyState></Card> : (
        <Card>
          <div className="cz-table-wrap"><table className="cz-table">
            <thead><tr><th>Product</th><th>Web address</th><th>Status</th><th>Applications</th><th>Partners</th><th /></tr></thead>
            <tbody>{q.data.items.map((r) => (
              <tr key={r.id} data-brand-row={r.slug}>
                <td style={{ display: 'flex', gap: 10, alignItems: 'center' }}>{r.logo && <img src={r.logo.startsWith('/') ? `${web}${r.logo}` : r.logo} alt="" style={{ height: 36, width: 'auto' }} />}<div><strong>{r.name}</strong><div className="cz-muted">{r.tagline}</div></div></td>
                <td>{r.subdomain}.</td>
                <td><StatusBadge status={r.status} label={r.status === 'published' ? (r.open ? 'Live · open to partners' : 'Live') : 'Draft'} tone={r.status === 'published' ? 'success' : 'neutral'} /></td>
                <td>{r.applications}</td><td>{r.partners}</td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  <Button size="sm" variant="secondary" onClick={() => setEdit(r)}>Edit</Button>{' '}
                  {r.status === 'draft' ? <Button size="sm" disabled={publish.pending} onClick={() => publish.run(r.slug)}>Publish</Button>
                    : <a className="cz-btn cz-btn-ghost cz-btn-sm" href={productUrl(r.slug, { productsDomain: process.env.NEXT_PUBLIC_PRODUCTS_DOMAIN || undefined, webUrl: web })} target="_blank" rel="noopener noreferrer">View microsite ↗</a>}
                </td>
              </tr>
            ))}</tbody>
          </table></div>
          <p className="cz-muted" style={{ fontSize: 13.5, marginBottom: 0 }}>Publishing creates the microsite and web address, adds the product to “Sell Unite products”, the matching agent, partner applications, the dealer CRM and the home page. It starts closed to partner promotion — open it on the Unite businesses page when ready.</p>
        </Card>
      )}
    </div>
  );
}

function Editor({ row, onDone }: { row: Row | null; onDone: () => void }) {
  const [f, setF] = useState<Form>(row ? { ...empty, ...row, accent: [row.accent[0] ?? '#011E48', row.accent[1] ?? '#2E7D32'], features: row.features.map((x) => ({ ...x, planned: !!x.planned })), oemPartner: row.oemPartner ?? '', oemStatus: row.oemStatus ?? 'planned', logo: row.logo ?? '', heroImage: row.heroImage ?? '' } : empty);
  const [touched, setTouched] = useState(!!row);
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((x) => ({ ...x, [k]: v }));
  const name = (v: string) => setF((x) => ({ ...x, name: v, ...(touched ? {} : { slug: slugify(v), subdomain: slugify(v).replace(/^unite-/, '') }) }));
  const save = useMutation(async () => {
    const payload = { ...f, oemPartner: f.oemPartner || undefined, features: f.features.filter((x) => x.title.trim()), workflow: f.workflow.filter((x) => x.title.trim()) };
    if (row) await api.put(`/admin/brand-products/catalogue/${row.slug}`, (({ slug: _s, ...rest }) => rest)(payload));
    else await api.post('/admin/brand-products/catalogue', payload);
    onDone(); return true;
  });
  const fe = save.fieldErrors;
  return (
    <Card>
      <form className="cz-stack" style={{ gap: 14 }} onSubmit={(e) => { e.preventDefault(); save.run(); }} data-form="brand-product">
        <h2 style={{ margin: 0 }}>{row ? `Edit ${row.name}` : 'Add a Unite brand product'}</h2>
        <div className="cz-grid cz-grid-2">
          <TextInput label="Product name" value={f.name} onChange={(e) => name(e.target.value)} error={fe.name} placeholder="Unite Paints" />
          <TextInput label="Web address (subdomain)" value={f.subdomain} onChange={(e) => { setTouched(true); set('subdomain', e.target.value.toLowerCase()); }} error={fe.subdomain} hint="paints → paints.<your domain>" />
          {!row && <TextInput label="Page address" value={f.slug} onChange={(e) => { setTouched(true); set('slug', e.target.value.toLowerCase()); }} error={fe.slug} hint={`/businesses/${f.slug || '…'}`} />}
          <TextInput label="Category" value={f.category} onChange={(e) => set('category', e.target.value)} error={fe.category} />
          <Select label="Industry" value={f.sector} onChange={(e) => set('sector', e.target.value)} options={SECTORS.map((s) => ({ value: s.code, label: s.name }))} />
          <TextInput label="Tagline" value={f.tagline} onChange={(e) => set('tagline', e.target.value)} error={fe.tagline} />
        </div>
        <TextArea label="Description" rows={3} value={f.summary} onChange={(e) => set('summary', e.target.value)} error={fe.summary} />
        <TextInput label="Who buys it" placeholder="painters, contractors and homeowners" value={f.buyers} onChange={(e) => set('buyers', e.target.value)} error={fe.buyers} />
        <ChipSelect legend="Partner roles offered" options={CHANNEL_ROLES.map((r) => ({ value: r.code, label: r.label }))} value={f.roles} onChange={(v) => set('roles', v)} />
        <ChipSelect legend="Strong fit — businesses that already sell to these buyers (matching agent)" options={types} value={f.strong} onChange={(v) => set('strong', v)} />
        {fe.strong && <p role="alert" style={{ color: '#B3261E', margin: 0 }}>{fe.strong}</p>}
        <ChipSelect legend="Good fit — businesses that can add it" options={types} value={f.good} onChange={(v) => set('good', v)} />
        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
          <Checkbox label="Sold in bulk (storage matters for distributors)" checked={f.bulk} onChange={(e) => set('bulk', e.target.checked)} />
          <Checkbox label="Sold from display (a showroom helps)" checked={f.showroom} onChange={(e) => set('showroom', e.target.checked)} />
        </div>
        <fieldset className="cz-fieldset"><legend>Features on the microsite</legend>
          {f.features.map((x, i) => (
            <div key={i} className="cz-grid cz-grid-2" style={{ alignItems: 'end' }}>
              <TextInput label={`Feature ${i + 1}`} value={x.title} onChange={(e) => set('features', f.features.map((y, j) => (j === i ? { ...y, title: e.target.value } : y)))} />
              <TextInput label="Description" value={x.text} onChange={(e) => set('features', f.features.map((y, j) => (j === i ? { ...y, text: e.target.value } : y)))} />
              <Checkbox label="Planned (not available yet)" checked={x.planned} onChange={(e) => set('features', f.features.map((y, j) => (j === i ? { ...y, planned: e.target.checked } : y)))} />
              <Button type="button" variant="ghost" size="sm" onClick={() => set('features', f.features.filter((_, j) => j !== i))}>Remove</Button>
            </div>
          ))}
          <Button type="button" variant="secondary" size="sm" onClick={() => set('features', [...f.features, { title: '', text: '', planned: false }])} disabled={f.features.length >= 12}>Add a feature</Button>
        </fieldset>
        <fieldset className="cz-fieldset"><legend>How it works (steps)</legend>
          {f.workflow.map((x, i) => (
            <div key={i} className="cz-grid cz-grid-2" style={{ alignItems: 'end' }}>
              <TextInput label={`Step ${i + 1}`} value={x.title} onChange={(e) => set('workflow', f.workflow.map((y, j) => (j === i ? { ...y, title: e.target.value } : y)))} />
              <TextInput label="What happens" value={x.text} onChange={(e) => set('workflow', f.workflow.map((y, j) => (j === i ? { ...y, text: e.target.value } : y)))} />
            </div>
          ))}
          <Button type="button" variant="secondary" size="sm" onClick={() => set('workflow', [...f.workflow, { title: '', text: '' }])} disabled={f.workflow.length >= 6}>Add a step</Button>
        </fieldset>
        <div className="cz-grid cz-grid-2">
          <TextInput label="OEM manufacturer (internal)" value={f.oemPartner} onChange={(e) => set('oemPartner', e.target.value)} />
          <Select label="OEM status" value={f.oemStatus} onChange={(e) => set('oemStatus', e.target.value)} options={Object.entries(OEM_STATUS).map(([value, label]) => ({ value, label }))} />
          <TextInput label="Logo" value={f.logo} onChange={(e) => set('logo', e.target.value)} error={fe.logo} hint="/brands/your-logo.png or an https address" />
          <TextInput label="Product photo" value={f.heroImage} onChange={(e) => set('heroImage', e.target.value)} error={fe.heroImage} hint="/photos/your-product.webp or an https address" />
          {(f.logo || f.heroImage) && <div style={{ display: 'flex', gap: 12, alignItems: 'center', gridColumn: '1 / -1' }}>{f.logo && <img src={f.logo.startsWith('/') ? `${web}${f.logo}` : f.logo} alt="Logo preview" style={{ height: 56 }} />}{f.heroImage && <img src={f.heroImage.startsWith('/') ? `${web}${f.heroImage}` : f.heroImage} alt="Photo preview" style={{ height: 80, borderRadius: 8 }} />}</div>}
          <TextInput label="Brand colour 1" type="color" value={f.accent[0]} onChange={(e) => set('accent', [e.target.value, f.accent[1]])} />
          <TextInput label="Brand colour 2" type="color" value={f.accent[1]} onChange={(e) => set('accent', [f.accent[0], e.target.value])} />
        </div>
        {save.error && <Alert tone="danger">{save.error}</Alert>}
        <div style={{ display: 'flex', gap: 8 }}>
          <Button type="submit" loading={save.pending}>{row ? 'Save changes' : 'Save as draft'}</Button>
          <Button type="button" variant="ghost" onClick={onDone}>Cancel</Button>
        </div>
      </form>
    </Card>
  );
}
