'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { newIdempotencyKey } from '@collabiz/types';
import { Alert, Button, Card, Checkbox, DataTable, DescriptionList, LoadingState, Money, StatusBadge, TextArea, TextInput } from '@collabiz/ui';
import { ApiErrorView } from '@/components/Screen';
import { api } from '@/lib/api';
import { useMutation, useQuery } from '@/lib/hooks';
import { fromMinor, toMinor } from '@/lib/regions';

const fmt = (d?: string | null) => (d ? new Date(d).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '—');

export function ContractsTable({ rows, onOpen, caption = 'Contracts' }: { rows: any[]; onOpen: (id: string) => void; caption?: string }) {
  return (
    <DataTable caption={caption} rows={rows} columns={[
      { key: 'title', header: 'Document', render: (c: any) => <><Button size="sm" variant="ghost" onClick={() => onOpen(c.id)} aria-label={`Open ${c.code}`}>{c.title}</Button><div className="cz-mono cz-muted">{c.code} · {c.kindLabel}</div></> },
      { key: 'party', header: 'Other party', render: (c: any) => (c.party === 'issuer' ? c.counterparty : c.issuer) },
      { key: 'value', header: 'Value', render: (c: any) => (c.value != null ? <Money minor={c.value} currency={c.currency} /> : '—') },
      { key: 'status', header: 'Status', render: (c: any) => <StatusBadge status={c.status} /> },
    ]} />
  );
}

/** Full contract workflow: draft → second-person review → hash-bound signatures → executed; amendments and termination. */
export function ContractPanel({ id, onChanged }: { id: string; onChanged?: () => void }) {
  const q = useQuery<any>(`/contracts/${id}`);
  const c = q.data;
  const latest = c?.versions?.[c.versions.length - 1];
  const approved = c?.versions?.find((v: any) => v.id === c.approvedVersionId);
  const [draft, setDraft] = useState({ body: '', value: '', note: '' });
  const [review, setReview] = useState('');
  const [sig, setSig] = useState({ typedName: '', title: '', consent: false });
  const [method, setMethod] = useState<'typed' | 'upload' | 'esign'>('typed');
  const [signed, setSigned] = useState<File | null>(null);
  const [reason, setReason] = useState('');
  const router = useRouter();
  const [proj, setProj] = useState({ startDate: '', endDate: '', site: '' });
  useEffect(() => { if (latest) setDraft({ body: latest.body, value: fromMinor(c.value), note: '' }); }, [latest?.id, c?.version]); // eslint-disable-line react-hooks/exhaustive-deps
  const done = <T,>(r: T) => { q.reload(); onChanged?.(); return r; };
  const save = useMutation(async () => done(await api.put(`/contracts/${id}/draft`, { body: draft.body, terms: { value: toMinor(draft.value) }, changeNote: draft.note || undefined })));
  const submit = useMutation(async () => done(await api.post(`/contracts/${id}/submit`)));
  const decide = useMutation(async (decision: string) => done(await api.post(`/contracts/${id}/review`, { decision, note: review || undefined })));
  const sign = useMutation(async () => done(await api.request('POST', `/contracts/${id}/sign`, { ...sig, title: sig.title || undefined, bodyHash: approved.bodyHash }, { idempotencyKey: newIdempotencyKey() })));
  const signUpload = useMutation(async () => {
    const fd = new FormData(); fd.append('file', signed!); fd.append('typedName', sig.typedName); if (sig.title) fd.append('title', sig.title); fd.append('consent', String(sig.consent)); fd.append('bodyHash', approved.bodyHash);
    return done(await api.upload(`/contracts/${id}/sign-upload`, fd));
  });
  const esign = useMutation(async () => api.post(`/contracts/${id}/esign`));
  const amend = useMutation(async () => done(await api.post<any>(`/contracts/${id}/amend`)));
  const terminate = useMutation(async () => done(await api.post(`/contracts/${id}/terminate`, { reason })));
  const startProject = useMutation(async () => { const pr = await api.post<any>(`/contracts/${id}/project`, { startDate: proj.startDate, endDate: proj.endDate, site: proj.site || undefined }); router.push(`/projects/${pr.id}/milestones`); return pr; });
  const download = async (vid: string, code: string, n: number) => {
    const text = await api.request<string>('GET', `/contracts/${id}/versions/${vid}/text`);
    const url = URL.createObjectURL(new Blob([typeof text === 'string' ? text : JSON.stringify(text)], { type: 'text/plain' }));
    const a = document.createElement('a'); a.href = url; a.download = `${code}-v${n}.txt`; a.click(); URL.revokeObjectURL(url);
  };
  if (q.loading) return <LoadingState />;
  if (q.error) return <ApiErrorView error={q.error} onRetry={q.reload} />;
  const err = save.error ?? submit.error ?? decide.error ?? sign.error ?? signUpload.error ?? amend.error ?? terminate.error ?? startProject.error;
  const p = c.permissions;
  return (
    <Card title={`${c.kindLabel} ${c.code}`} actions={<StatusBadge status={c.status} />}>
      {err && <Alert tone="danger">{err}</Alert>}
      {amend.data && <Alert tone="success">Amendment {amend.data.code} created as a draft. The original stays in force until the amendment is executed.</Alert>}
      <DescriptionList items={[
        ['Title', c.title], ['Issuer', c.issuer], ['Counterparty', c.counterparty],
        ['Value', c.value != null ? <Money minor={c.value} currency={c.currency} /> : '—'],
        ['Executed', fmt(c.executedAt)],
        ...(c.supersedesId ? [['Amends', 'an earlier contract (superseded once this is executed)'] as [string, React.ReactNode]] : []),
        ...(c.supersededById ? [['Superseded', 'by an executed amendment'] as [string, React.ReactNode]] : []),
        ...(c.terminationReason ? [['Termination reason', c.terminationReason] as [string, React.ReactNode]] : []),
      ]} />
      <h3>Versions</h3>
      <ol className="cz-thread" aria-label="Contract versions">
        {c.versions.map((v: any) => (
          <li key={v.id} data-version={v.versionNo}>
            <div className="cz-row" style={{ justifyContent: 'space-between' }}>
              <strong>Version {v.versionNo}</strong>
              <span>{v.approvedAt ? <StatusBadge status="approved" tone="success" label="Approved · immutable" /> : v.rejectedAt ? <StatusBadge status="rejected" /> : v.submittedAt ? <StatusBadge status="in_review" /> : <StatusBadge status="draft" />}</span>
            </div>
            <div className="cz-muted" style={{ fontSize: 12 }}>
              {v.author && <>By {v.author} · </>}{v.changeNote && <>{v.changeNote} · </>}SHA-256 <span className="cz-mono" title={v.bodyHash}>{v.bodyHash.slice(0, 16)}…</span>
              {v.approvedBy && <> · approved by {v.approvedBy} {fmt(v.approvedAt)}</>}{v.rejectedBy && <> · rejected by {v.rejectedBy}: {v.reviewNote}</>}
            </div>
            {(v.id === c.approvedVersionId || v.id === latest?.id) && <pre className="cz-doc" aria-label={`Version ${v.versionNo} text`}>{v.body}</pre>}
            <Button size="sm" variant="ghost" onClick={() => download(v.id, c.code, v.versionNo)}>Download v{v.versionNo}</Button>
          </li>
        ))}
      </ol>
      {p.edit && (
        <section aria-label="Edit draft">
          <h3>{latest?.submittedAt ? `Draft version ${latest.versionNo + 1}` : `Edit version ${latest?.versionNo}`}</h3>
          <TextArea label="Agreement text" rows={14} value={draft.body} onChange={(e) => setDraft({ ...draft, body: e.target.value })} error={save.fieldErrors.body} />
          <TextInput label="Contract value (₹)" inputMode="decimal" value={draft.value} onChange={(e) => setDraft({ ...draft, value: e.target.value })} />
          <TextInput label="Change note (optional)" value={draft.note} onChange={(e) => setDraft({ ...draft, note: e.target.value })} />
          <div className="cz-row">
            <Button variant="secondary" onClick={() => save.run()} loading={save.pending}>Save draft</Button>
            {p.submit && <Button onClick={() => submit.run()} loading={submit.pending}>Submit for approval</Button>}
          </div>
        </section>
      )}
      {c.status === 'in_review' && p.reviewBlockedReason && <Alert tone="info">{p.reviewBlockedReason}</Alert>}
      {p.review && (
        <section aria-label="Review">
          <h3>Review version {latest.versionNo}</h3>
          <TextArea label="Review note (required to reject)" rows={2} value={review} onChange={(e) => setReview(e.target.value)} error={decide.fieldErrors.note} />
          <div className="cz-row">
            <Button onClick={() => decide.run('approve')} loading={decide.pending}>Approve and lock version</Button>
            <Button variant="danger" onClick={() => decide.run('reject')} loading={decide.pending}>Reject</Button>
          </div>
        </section>
      )}
      {c.signatures.length > 0 && (
        <>
          <h3>Signatures</h3>
          <DataTable caption="Signatures" rows={c.signatures.map((s: any, i: number) => ({ ...s, id: String(i) }))} columns={[
            { key: 'organization', header: 'Party' }, { key: 'typedName', header: 'Signed by', render: (s: any) => `${s.typedName}${s.title ? `, ${s.title}` : ''}` },
            { key: 'method', header: 'Method', render: (s: any) => (s.method === 'wet_ink_upload' ? 'Signed copy uploaded' : s.method === 'aadhaar_esign' ? 'Aadhaar eSign' : 'Typed signature') },
            { key: 'signedAt', header: 'When', render: (s: any) => fmt(s.signedAt) },
            { key: 'bodyHash', header: 'Document hash', render: (s: any) => <span className="cz-mono">{s.bodyHash.slice(0, 16)}…</span> },
          ]} />
          <p style={{ margin: '6px 0 0', fontSize: 13.5 }}><Link href={`/contracts/${id}/certificate`}>Signing certificate</Link></p>
        </>
      )}
      {p.sign && approved && (
        <section aria-label="Sign">
          <h3>Sign version {approved.versionNo}</h3>
          <div className="cz-row" style={{ gap: 8, marginBottom: 8 }} role="group" aria-label="How to sign">
            {([['typed', 'Type to sign'], ['upload', 'Upload signed copy'], ['esign', 'Aadhaar eSign']] as const).map(([k, l]) => <Button key={k} size="sm" variant={method === k ? 'primary' : 'secondary'} aria-pressed={method === k} onClick={() => setMethod(k)}>{l}</Button>)}
          </div>
          {method === 'esign' ? (
            <>
              <Alert tone="info">Aadhaar eSign needs an agreement with a licensed eSign Service Provider, which is not in place yet. Use “Upload signed copy” where a handwritten signature is required.</Alert>
              <Button variant="secondary" onClick={() => esign.run()} loading={esign.pending}>Check eSign availability</Button>
              {esign.error && <p className="cz-muted" style={{ fontSize: 13 }}>{esign.error}</p>}
            </>
          ) : (
            <>
              <p className="cz-muted" style={{ fontSize: 13 }}>{method === 'typed'
                ? <>You are signing the exact text above (SHA-256 <span className="cz-mono">{approved.bodyHash}</span>). Recorded: typed name, time, IP address and document hash. This is an electronic record of acceptance, not Aadhaar eSign.</>
                : <>Download the approved text, print and sign it, then upload the signed PDF. COLLABIZ keeps the file and its fingerprint with your signature.</>}</p>
              {method === 'upload' && <div className="cz-row" style={{ gap: 8, marginBottom: 8 }}><Button size="sm" variant="ghost" onClick={() => download(approved.id, c.code, approved.versionNo)}>Download approved text</Button><input type="file" accept="application/pdf" aria-label="Signed copy (PDF)" onChange={(e) => setSigned(e.target.files?.[0] ?? null)} /></div>}
              <TextInput label="Type your full name" value={sig.typedName} onChange={(e) => setSig({ ...sig, typedName: e.target.value })} error={sign.fieldErrors.typedName ?? signUpload.fieldErrors.typedName} />
              <TextInput label="Designation (optional)" value={sig.title} onChange={(e) => setSig({ ...sig, title: e.target.value })} />
              <Checkbox label="I am authorised to sign for my organization and agree to this document" checked={sig.consent} onChange={(e) => setSig({ ...sig, consent: e.target.checked })} />
              {method === 'typed'
                ? <Button variant="accent" onClick={() => sign.run()} disabled={!sig.consent || sig.typedName.trim().length < 3} loading={sign.pending}>Sign document</Button>
                : <Button variant="accent" onClick={() => signUpload.run()} disabled={!signed || !sig.consent || sig.typedName.trim().length < 3} loading={signUpload.pending}>Upload and sign</Button>}
            </>
          )}
        </section>
      )}
      {c.project && <Alert tone="info">Project <Link href={`/projects/${c.project.id}`} className="cz-mono">{c.project.code}</Link> runs under this contract.</Alert>}
      {p.startProject && (
        <section aria-label="Start project">
          <h3>Start the project</h3>
          <div className="cz-row" style={{ alignItems: 'flex-end' }}>
            <TextInput label="Start date" type="date" value={proj.startDate} onChange={(e) => setProj({ ...proj, startDate: e.target.value })} error={startProject.fieldErrors.startDate} />
            <TextInput label="End date" type="date" value={proj.endDate} onChange={(e) => setProj({ ...proj, endDate: e.target.value })} error={startProject.fieldErrors.endDate} />
            <TextInput label="Site (optional)" value={proj.site} onChange={(e) => setProj({ ...proj, site: e.target.value })} />
            <Button onClick={() => startProject.run()} disabled={!proj.startDate || !proj.endDate} loading={startProject.pending}>Start project</Button>
          </div>
        </section>
      )}
      {(p.amend || p.terminate) && (
        <section aria-label="Changes after approval" className="cz-row" style={{ alignItems: 'flex-end', marginTop: 12 }}>
          {p.amend && <Button variant="secondary" onClick={() => amend.run()} loading={amend.pending}>Create amendment</Button>}
          {p.terminate && (
            <>
              <TextArea label="Termination reason" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
              <Button variant="danger" onClick={() => terminate.run()} disabled={reason.trim().length < 10} loading={terminate.pending}>Terminate</Button>
            </>
          )}
        </section>
      )}
    </Card>
  );
}
