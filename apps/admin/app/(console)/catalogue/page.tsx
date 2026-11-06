'use client';
import { useState } from 'react';
import { SECTORS, sectorName } from '@collabiz/types';
import { Alert, Button, Card, DataTable, Dialog, LoadingState, Money, Select, StatusBadge, Tabs, TextArea, TextInput } from '@collabiz/ui';
import { Screen, ApiErrorView } from '@/components/Screen';
import { api } from '@/lib/api';
import { useMutation, useQuery } from '@/lib/hooks';
import { useSession } from '@/lib/session';
import { toMinor } from '@/lib/regions';

const EMPTY = { kind: 'product', name: '', sector: 'solar', description: '', sku: '', unit: '', price: '', priceVisibility: 'verified_partners', visibility: 'public' };

/** Screen 136 — Product & Catalogue Management (own group company only, unless super admin). */
export default function CatalogueAdmin() {
  const { me } = useSession();
  const [tab, setTab] = useState('');
  const items = useQuery<any[]>('/admin/catalog', { status: tab });
  const companies = (me?.memberships ?? []).filter((m) => m.orgType === 'group_company');
  const gcs = useQuery<any[]>(me?.platformRoles.includes('super_admin') ? '/admin/group-companies' : null);
  const owners = gcs.data ? gcs.data.map((r) => ({ value: r.org.id, label: r.gc?.brandName ?? r.org.displayName })) : companies.map((c) => ({ value: c.organizationId, label: c.orgName }));
  const [open, setOpen] = useState(false);
  const [f, setF] = useState(EMPTY);
  const [owner, setOwner] = useState('');
  const create = useMutation(async () => {
    await api.post('/admin/catalog', { ownerOrgId: owner || owners[0]?.value, kind: f.kind, name: f.name, sector: f.sector, description: f.description, sku: f.sku || undefined, unit: f.unit || undefined, listPrice: toMinor(f.price), priceVisibility: f.priceVisibility, visibility: f.visibility });
    setOpen(false); setF(EMPTY); items.reload(); return true;
  });
  const setStatus = useMutation(async (id: string, status: string) => { await api.patch(`/admin/catalog/${id}`, { status }); items.reload(); return true; });
  const set = (k: keyof typeof EMPTY) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  return (
    <Screen id="136" actions={<Button onClick={() => setOpen(true)} disabled={!owners.length}>New item</Button>} description="Publish products and services with explicit visibility (public / partners / private) and price-disclosure rules. Drafts are never shown to partners.">
      {setStatus.error && <Alert tone="danger">{setStatus.error}</Alert>}
      <Tabs value={tab} onChange={setTab} tabs={[{ value: '', label: 'All' }, { value: 'draft', label: 'Drafts' }, { value: 'published', label: 'Published' }, { value: 'archived', label: 'Archived' }]} />
      <Card>
        {items.loading ? <LoadingState /> : items.error ? <ApiErrorView error={items.error} onRetry={items.reload} /> : (
          <DataTable caption="Catalogue items" rows={items.data ?? []} columns={[
            { key: 'name', header: 'Item', render: (i) => <><strong>{i.name}</strong><div className="cz-muted" style={{ fontSize: 12 }}>{i.ownerName} · {sectorName(i.sector)} · {i.kind}</div></> },
            { key: 'price', header: 'List price', render: (i) => (i.listPrice != null ? <Money minor={i.listPrice} currency={i.currency} /> : 'On request') },
            { key: 'vis', header: 'Visibility', render: (i) => `${i.visibility} · price: ${i.priceVisibility.replace('_', ' ')}` },
            { key: 'status', header: 'Status', render: (i) => <StatusBadge status={i.status} /> },
            { key: 'a', header: '', render: (i) => <div className="cz-row" style={{ gap: 4 }}>
              {i.status !== 'published' && <Button size="sm" onClick={() => setStatus.run(i.id, 'published')}>Publish</Button>}
              {i.status !== 'archived' && <Button size="sm" variant="ghost" onClick={() => setStatus.run(i.id, 'archived')}>Archive</Button>}
            </div> },
          ]} />
        )}
      </Card>
      <Dialog open={open} onClose={() => setOpen(false)} title="New catalogue item">
        <form noValidate onSubmit={(e) => { e.preventDefault(); create.run(); }}>
          {create.error && <Alert tone="danger">{create.error}</Alert>}
          <Select label="Group company" value={owner || owners[0]?.value || ''} onChange={(e) => setOwner(e.target.value)} options={owners} />
          <div className="cz-grid cz-grid-2">
            <Select label="Type" value={f.kind} onChange={set('kind')} options={[{ value: 'product', label: 'Product' }, { value: 'service', label: 'Service' }]} />
            <Select label="Sector" value={f.sector} onChange={set('sector')} options={SECTORS.map((s) => ({ value: s.code, label: s.name }))} />
          </div>
          <TextInput label="Name" value={f.name} onChange={set('name')} error={create.fieldErrors.name} />
          <TextArea label="Description" value={f.description} onChange={set('description')} error={create.fieldErrors.description} />
          <div className="cz-grid cz-grid-2">
            <TextInput label="List price ₹" inputMode="decimal" value={f.price} onChange={set('price')} error={create.fieldErrors.listPrice} />
            <TextInput label="Unit" value={f.unit} onChange={set('unit')} placeholder="kWp, unit, project" />
            <Select label="Price visible to" value={f.priceVisibility} onChange={set('priceVisibility')} options={[{ value: 'public', label: 'Everyone' }, { value: 'verified_partners', label: 'Verified partners' }, { value: 'certified_partners', label: 'Certified partners' }, { value: 'on_request', label: 'Nobody (on request)' }]} />
            <Select label="Listing visible to" value={f.visibility} onChange={set('visibility')} options={[{ value: 'public', label: 'Public' }, { value: 'partners', label: 'Signed-in partners' }, { value: 'private', label: 'Private (internal)' }]} />
          </div>
          <div className="cz-row"><Button type="submit" loading={create.pending}>Save as draft</Button><Button type="button" variant="secondary" onClick={() => setOpen(false)}>Cancel</Button></div>
        </form>
      </Dialog>
    </Screen>
  );
}
