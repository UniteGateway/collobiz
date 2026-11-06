'use client';
import { useState } from 'react';
import Link from 'next/link';
import { Alert, Button, Card, DataTable, Dialog, EmptyState, LoadingState, PageHeader, TextInput } from '@collabiz/ui';
import { ApiErrorView } from '@/components/Screen';
import { api } from '@/lib/api';
import { useMutation, useQuery } from '@/lib/hooks';

/** Customer list (supports 052). Only your organization's customers are listed. */
export default function Customers() {
  const [q, setQ] = useState('');
  const list = useQuery<any[]>('/crm/customers', { q });
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ legalName: '', contactName: '', contactEmail: '', city: '' });
  const create = useMutation(async () => { await api.post('/crm/customers', { legalName: f.legalName, contactName: f.contactName || undefined, contactEmail: f.contactEmail || undefined, city: f.city || undefined }); setOpen(false); list.reload(); return true; });
  return (
    <div>
      <PageHeader title="Customers" breadcrumb="Lead Registration & Client CRM" actions={<Button onClick={() => setOpen(true)}>Add customer</Button>} />
      <Card>
        <TextInput label="Search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name or city" />
        {list.loading ? <LoadingState /> : list.error ? <ApiErrorView error={list.error} onRetry={list.reload} /> : (
          <DataTable caption="Customers" rows={list.data ?? []} empty={<EmptyState title="No customers yet" />} columns={[
            { key: 'legalName', header: 'Customer', render: (c) => <Link href={`/crm/customers/${c.id}`}>{c.legalName}</Link> },
            { key: 'city', header: 'City', render: (c) => c.city ?? '—' },
            { key: 'contactName', header: 'Contact', render: (c) => c.contactName ?? '—' },
            { key: 'deals', header: 'Deals' }, { key: 'leads', header: 'Leads' },
          ]} />
        )}
      </Card>
      <Dialog open={open} onClose={() => setOpen(false)} title="Add customer">
        {create.error && <Alert tone="danger">{create.error}</Alert>}
        <TextInput label="Legal name" value={f.legalName} onChange={(e) => setF({ ...f, legalName: e.target.value })} error={create.fieldErrors.legalName} />
        <TextInput label="Contact person" value={f.contactName} onChange={(e) => setF({ ...f, contactName: e.target.value })} />
        <TextInput label="Contact email" type="email" value={f.contactEmail} onChange={(e) => setF({ ...f, contactEmail: e.target.value })} error={create.fieldErrors.contactEmail} />
        <TextInput label="City" value={f.city} onChange={(e) => setF({ ...f, city: e.target.value })} />
        <div className="cz-row"><Button onClick={() => create.run()} loading={create.pending}>Save</Button><Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button></div>
      </Dialog>
    </div>
  );
}
