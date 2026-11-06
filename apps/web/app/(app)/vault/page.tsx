'use client';
import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Card, DataTable, EmptyState, LoadingState, StatusBadge, Tabs } from '@collabiz/ui';
import { Screen, ApiErrorView } from '@/components/Screen';
import { ContractPanel, ContractsTable } from '@/components/Contracts';
import { useQuery } from '@/lib/hooks';

const fmt = (d?: string | null) => (d ? new Date(d).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '—');
const short = (h?: string | null) => (h ? <span className="cz-mono" title={h}>{h.slice(0, 12)}…</span> : '—');

/** Screen 148 — Documents & Agreements Vault: every signed or verified record of the active organization, with hashes. */
export default function VaultPage() {
  return <Suspense fallback={<LoadingState />}><Vault /></Suspense>;
}

function Vault() {
  const params = useSearchParams();
  const q = useQuery<any>('/vault');
  const [tab, setTab] = useState('contracts');
  const [open, setOpen] = useState<string | null>(null);
  useEffect(() => { const c = params.get('contract'); if (c) { setTab('contracts'); setOpen(c); } }, [params]);
  const v = q.data;
  return (
    <Screen id="148" description="Contracts, platform agreements, verification documents, team NDAs and lead certificates for your organization. Hashes let you prove a document has not changed.">
      {q.loading ? <LoadingState /> : q.error ? <ApiErrorView error={q.error} onRetry={q.reload} /> : (
        <>
          <Tabs value={tab} onChange={setTab} tabs={[
            { value: 'contracts', label: `Contracts (${v.contracts.length})` }, { value: 'agreements', label: `Platform agreements (${v.agreements.length})` },
            { value: 'verification', label: `Verification documents (${v.verification.length})` }, { value: 'ndas', label: `Team NDAs (${v.ndas.length})` },
            { value: 'certificates', label: `Lead certificates (${v.certificates.length})` },
          ]} />
          {tab === 'contracts' && (
            <>
              <Card>{v.contracts.length ? <ContractsTable rows={v.contracts} onOpen={setOpen} /> : <EmptyState title="No contracts yet">Award documents appear here once approved.</EmptyState>}</Card>
              {open && <ContractPanel key={open} id={open} onChanged={q.reload} />}
            </>
          )}
          {tab === 'agreements' && (
            <Card><DataTable caption="Platform agreements" rows={v.agreements} empty={<EmptyState title="No agreements accepted" />} columns={[
              { key: 'title', header: 'Agreement', render: (a: any) => <>{a.title}<div className="cz-muted" style={{ fontSize: 12 }}>v{a.version}</div></> },
              { key: 'signer', header: 'Accepted by', render: (a: any) => `${a.typedName} (${a.signer})` },
              { key: 'acceptedAt', header: 'When', render: (a: any) => fmt(a.acceptedAt) },
              { key: 'docHash', header: 'Document hash', render: (a: any) => short(a.docHash) },
            ]} /></Card>
          )}
          {tab === 'verification' && (
            <Card><DataTable caption="Verification documents" rows={v.verification} empty={<EmptyState title="No verification documents" />} columns={[
              { key: 'docType', header: 'Type', render: (d: any) => d.docType.replace(/_/g, ' ') }, { key: 'fileName', header: 'File' },
              { key: 'status', header: 'Review', render: (d: any) => <StatusBadge status={d.status} /> },
              { key: 'createdAt', header: 'Uploaded', render: (d: any) => fmt(d.createdAt) }, { key: 'sha256', header: 'SHA-256', render: (d: any) => short(d.sha256) },
            ]} /><p className="cz-muted" style={{ fontSize: 13 }}>Manage these in <Link href="/onboarding/kyc">Onboarding → KYC/KYB documents</Link>.</p></Card>
          )}
          {tab === 'ndas' && (
            <Card><DataTable caption="Team NDAs" rows={v.ndas.map((n: any) => ({ ...n, id: n.teamId }))} empty={<EmptyState title="No signed NDAs" />} columns={[
              { key: 'name', header: 'Team', render: (n: any) => <><Link href={`/teams/${n.teamId}/nda`}>{n.name}</Link><div className="cz-mono cz-muted">{n.code}</div></> },
              { key: 'typedName', header: 'Signed by' }, { key: 'signedAt', header: 'When', render: (n: any) => fmt(n.signedAt) }, { key: 'ndaHash', header: 'NDA hash', render: (n: any) => short(n.ndaHash) },
            ]} /></Card>
          )}
          {tab === 'certificates' && (
            <Card><DataTable caption="Lead certificates" rows={v.certificates} empty={<EmptyState title="No lead certificates" />} columns={[
              { key: 'certificateCode', header: 'Certificate', render: (c: any) => <><Link href={`/leads/${c.id}/certificate`} className="cz-mono">{c.certificateCode}</Link><div className="cz-muted" style={{ fontSize: 12 }}>{c.title}</div></> },
              { key: 'status', header: 'Status', render: (c: any) => <StatusBadge status={c.status} /> },
              { key: 'protectedUntil', header: 'Protected until', render: (c: any) => fmt(c.protectedUntil) }, { key: 'evidenceHash', header: 'Evidence hash', render: (c: any) => short(c.evidenceHash) },
              { key: 'verify', header: 'Public check', render: (c: any) => <Link href={c.verifyPath}>Verify</Link> },
            ]} /></Card>
          )}
        </>
      )}
    </Screen>
  );
}
