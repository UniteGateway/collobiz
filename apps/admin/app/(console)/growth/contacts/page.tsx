'use client';
import { useState } from 'react';
import { CONTACT_SOURCES, CONTACT_SOURCE_LABELS, COUNTRIES, INDIA_STATES, LAWFUL_BASES, LAWFUL_BASIS_LABELS, SECTORS, sectorName } from '@collabiz/types';
import { Alert, Button, Card, Dialog, EmptyState, LoadingState, PageHeader, SearchInput, Segmented, Select, StatusBadge, TextArea, TextInput } from '@collabiz/ui';
import { ApiErrorView } from '@/components/Screen';
import { api } from '@/lib/api';
import { useMutation, useQuery } from '@/lib/hooks';

interface Contact { id: string; organizationName: string; contactName: string | null; email: string | null; phone: string | null; city: string | null; region: string | null; country: string; sector: string; kind: string; source: string; sourceDetail: string; lawfulBasis: string; optedOutAt: string | null; tags: string[]; createdAt: string }
const KINDS = [['company', 'Company'], ['association', 'Association or chamber'], ['institution', 'College or institution'], ['investor', 'Investor']];
const regionName = (c: string | null) => INDIA_STATES.find(([k]) => k === c)?.[1] ?? c;

/** Minimal CSV parser (quoted fields, commas, new lines). First row is the header. */
function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = []; let row: string[] = []; let cell = ''; let q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (ch === '"') q = false; else cell += ch; continue; }
    if (ch === '"') q = true; else if (ch === ',') { row.push(cell); cell = ''; } else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; } else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const [head, ...body] = rows.filter((r) => r.some((c) => c.trim()));
  if (!head) return [];
  const keys = head.map((h) => h.trim());
  return body.map((r) => Object.fromEntries(keys.map((k, i) => [k, (r[i] ?? '').trim()]).filter(([, v]) => v !== '')));
}

export default function GrowthContacts() {
  const [term, setTerm] = useState('');
  const [basis, setBasis] = useState('all');
  const q = useQuery<{ total: number; rows: Contact[] }>(`/admin/growth/contacts?basis=${basis}${term ? `&q=${encodeURIComponent(term)}` : ''}`);
  const [adding, setAdding] = useState(false);
  const [importing, setImporting] = useState(false);
  const optOut = useMutation(async (id: string) => { await api.post(`/admin/growth/contacts/${id}/opt-out`, {}); q.reload(); return true; });
  return (
    <div>
      <PageHeader title="Lead database" breadcrumb="Growth Desk"
        description="Companies, associations, institutions and investors that agents may consider. Every contact records where it came from and the lawful basis for contacting it. Contacts without a basis are kept but never contacted."
        actions={<div className="cz-row" style={{ gap: 8 }}><Button variant="secondary" onClick={() => setImporting(true)}>Import CSV</Button><Button onClick={() => setAdding(true)}>Add contact</Button></div>} />
      <Alert tone="info">Only use sources you are allowed to use: enquiries, referrals with consent, events, opt-in lists, public company registries and licensed directories. Do not copy contacts from social networks or scraped websites.</Alert>
      <div className="cz-row" style={{ margin: '14px 0', gap: 12 }}>
        <Segmented label="Show" value={basis} onChange={setBasis} options={[{ value: 'all', label: 'All' }, { value: 'usable', label: 'Can be contacted' }, { value: 'none', label: 'No lawful basis' }, { value: 'opted_out', label: 'Opted out' }]} />
        <SearchInput label="Search contacts" placeholder="Organisation, person, e-mail or city" value={term} onChange={(e) => setTerm(e.target.value)} />
      </div>
      {optOut.error && <Alert tone="danger">{optOut.error}</Alert>}
      {q.error ? <ApiErrorView error={q.error} onRetry={q.reload} /> : !q.data ? <LoadingState /> : !q.data.rows.length ? <Card><EmptyState icon="users" title="No contacts match">Add contacts one by one or import a CSV file.</EmptyState></Card> : (
        <ul className="cz-stack" style={{ gap: 8, listStyle: 'none', margin: 0, padding: 0 }} aria-label="Contacts">
          {q.data.rows.map((c) => (
            <li key={c.id} className="cz-card cz-lead" data-contact={c.organizationName}>
              <div className="cz-lead-head">
                <strong>{c.organizationName}</strong>
                <span className="cz-muted">{[c.contactName, c.email, c.city, regionName(c.region), c.country !== 'IN' ? COUNTRIES.find(([k]) => k === c.country)?.[1] ?? c.country : null].filter(Boolean).join(' · ')}</span>
                <span style={{ marginLeft: 'auto' }}>{c.optedOutAt ? <StatusBadge status="opted_out" tone="neutral" label="Opted out" /> : c.lawfulBasis === 'none' ? <StatusBadge status="none" tone="warning" label="Do not contact" /> : <StatusBadge status="ok" tone="success" label="Can be contacted" />}</span>
              </div>
              <span className="cz-muted" style={{ fontSize: 13 }}>{sectorName(c.sector)} · {KINDS.find(([k]) => k === c.kind)?.[1]} · {CONTACT_SOURCE_LABELS[c.source]} — {c.sourceDetail} · {LAWFUL_BASIS_LABELS[c.lawfulBasis]}{c.tags.length ? ` · ${c.tags.join(', ')}` : ''}</span>
              {!c.optedOutAt && <div><Button size="sm" variant="ghost" onClick={() => { if (window.confirm(`Stop all contact with ${c.organizationName}? This cannot be undone.`)) optOut.run(c.id); }}>Mark as do not contact</Button></div>}
            </li>
          ))}
        </ul>
      )}
      {q.data && <p className="cz-muted" style={{ fontSize: 13 }}>Showing {q.data.rows.length} of {q.data.total} contacts.</p>}
      <AddContact open={adding} onClose={() => setAdding(false)} onSaved={() => { setAdding(false); q.reload(); }} />
      <ImportContacts open={importing} onClose={() => { setImporting(false); q.reload(); }} />
    </div>
  );
}

const sourceOptions = CONTACT_SOURCES.map((s) => ({ value: s, label: CONTACT_SOURCE_LABELS[s] }));
const basisOptions = LAWFUL_BASES.map((s) => ({ value: s, label: LAWFUL_BASIS_LABELS[s] }));

function AddContact({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const empty = { organizationName: '', contactName: '', email: '', phone: '', website: '', country: 'IN', region: '', city: '', sector: 'manufacturing', kind: 'company', source: 'inbound_form', sourceDetail: '', lawfulBasis: 'legitimate_interest_b2b', consentEvidence: '', notes: '' };
  const [f, setF] = useState(empty);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const save = useMutation(async () => { const r = await api.post('/admin/growth/contacts', f); setF(empty); onSaved(); return r; });
  const e = save.fieldErrors;
  return (
    <Dialog open={open} onClose={onClose} title="Add contact">
      <form className="cz-stack" style={{ gap: 10 }} onSubmit={(ev) => { ev.preventDefault(); save.run(); }} noValidate>
        {save.error && <Alert tone="danger">{save.error}</Alert>}
        <TextInput label="Organisation" value={f.organizationName} onChange={set('organizationName')} error={e.organizationName} />
        <div className="cz-growth-kpis">
          <Select label="Type" value={f.kind} onChange={set('kind')} options={KINDS.map(([v, l]) => ({ value: v, label: l }))} />
          <Select label="Sector" value={f.sector} onChange={set('sector')} options={SECTORS.map((s) => ({ value: s.code, label: s.name }))} />
        </div>
        <div className="cz-growth-kpis">
          <TextInput label="Contact person (optional)" value={f.contactName} onChange={set('contactName')} />
          <TextInput label="E-mail (optional)" type="email" value={f.email} onChange={set('email')} error={e.email} />
        </div>
        <div className="cz-growth-kpis">
          <Select label="Country" value={f.country} onChange={set('country')} options={COUNTRIES.map(([v, l]) => ({ value: v, label: l }))} />
          {f.country === 'IN' && <Select label="State" value={f.region} onChange={set('region')} placeholder="Not known" options={INDIA_STATES.map(([v, l]) => ({ value: v, label: l }))} />}
          <TextInput label="City (optional)" value={f.city} onChange={set('city')} />
        </div>
        <Select label="Where it came from" value={f.source} onChange={set('source')} options={sourceOptions} />
        <TextInput label="Details of the source" value={f.sourceDetail} onChange={set('sourceDetail')} error={e.sourceDetail} placeholder="e.g. Website enquiry ref ENQ-1042, 12 Oct 2026" />
        <Select label="Lawful basis for contacting" value={f.lawfulBasis} onChange={set('lawfulBasis')} options={basisOptions} />
        {f.lawfulBasis === 'consent' && <TextInput label="How consent was given" value={f.consentEvidence} onChange={set('consentEvidence')} error={e.consentEvidence} placeholder="Form, date and reference" />}
        <Button type="submit" loading={save.pending}>Add contact</Button>
      </form>
    </Dialog>
  );
}

function ImportContacts({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [csv, setCsv] = useState('');
  const [d, setD] = useState({ source: 'licensed_directory', sourceDetail: '', lawfulBasis: 'legitimate_interest_b2b', consentEvidence: '' });
  const rows = csv ? parseCsv(csv) : [];
  const imp = useMutation(async () => api.post<{ created: number; duplicates: number; suppressed: number; invalidCount: number; invalid: { row: number; error: string }[] }>('/admin/growth/contacts/import', { defaults: { ...d, consentEvidence: d.consentEvidence || undefined }, rows }));
  return (
    <Dialog open={open} onClose={onClose} title="Import contacts from CSV">
      <div className="cz-stack" style={{ gap: 10 }}>
        <p className="cz-muted" style={{ margin: 0, fontSize: 13.5 }}>Columns: organizationName, sector, contactName, email, phone, website, country, region, city, kind, tags (separate tags with “;”). Sector uses codes such as manufacturing, solar, education.</p>
        <label className="cz-sched-label">CSV file<input type="file" accept=".csv,text/csv" onChange={async (e) => { const file = e.target.files?.[0]; if (file) setCsv(await file.text()); }} /></label>
        <TextArea label="…or paste CSV" rows={5} value={csv} onChange={(e) => setCsv(e.target.value)} />
        <Select label="Where this list came from" value={d.source} onChange={(e) => setD({ ...d, source: e.target.value })} options={sourceOptions} />
        <TextInput label="Details of the source" value={d.sourceDetail} onChange={(e) => setD({ ...d, sourceDetail: e.target.value })} placeholder="e.g. Licensed MSME directory, Nov 2026 edition" error={imp.fieldErrors['defaults.sourceDetail']} />
        <Select label="Lawful basis for this list" value={d.lawfulBasis} onChange={(e) => setD({ ...d, lawfulBasis: e.target.value })} options={basisOptions} />
        {d.lawfulBasis === 'consent' && <TextInput label="How consent was given" value={d.consentEvidence} onChange={(e) => setD({ ...d, consentEvidence: e.target.value })} error={imp.fieldErrors.consentEvidence} />}
        {imp.error && <Alert tone="danger">{imp.error}</Alert>}
        {imp.data && <Alert tone={imp.data.invalidCount ? 'warning' : 'success'} title={`${imp.data.created} contacts added`}>
          {imp.data.duplicates} already in the database · {imp.data.suppressed} opted out earlier (skipped) · {imp.data.invalidCount} with errors
          {imp.data.invalid.length > 0 && <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>{imp.data.invalid.slice(0, 5).map((x) => <li key={x.row}>Row {x.row}: {x.error}</li>)}</ul>}
        </Alert>}
        <Button loading={imp.pending} disabled={!rows.length || d.sourceDetail.trim().length < 3} onClick={() => imp.run()}>Import {rows.length || ''} contacts</Button>
      </div>
    </Dialog>
  );
}
