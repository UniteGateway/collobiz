'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { Alert, Button, Icon } from '@collabiz/ui';
import { Screen } from '@/components/Screen';
import { api } from '@/lib/api';
import { useMutation } from '@/lib/hooks';

interface Draft { suggestionId: string; subject: { code: string; title: string }; sections: { heading: string; body: string; source: string }[]; provider: string; promptVersion: string; notice: string }

/** Screen 072 — AI proposal draft builder. Drafts from your verified profile and the published scope; never prices; never submitted for you. */
export default function AiProposal() {
  const { id } = useParams<{ id: string }>();
  const [sections, setSections] = useState<Draft['sections'] | null>(null);
  const [copied, setCopied] = useState(false);
  const gen = useMutation(async () => { const d = await api.post<Draft>('/ai/proposal-draft', { tenderId: id }); setSections(d.sections); return d; });
  const review = useMutation(async (status: 'accepted' | 'edited' | 'rejected') => { await api.post(`/ai/suggestions/${gen.data!.suggestionId}/review`, { status }); return status; });
  const edited = gen.data && sections && JSON.stringify(sections) !== JSON.stringify(gen.data.sections);
  const copyAll = async () => {
    const text = (sections ?? []).map((s) => `${s.heading}\n\n${s.body}`).join('\n\n');
    try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* clipboard unavailable */ }
    if (!review.data) review.run(edited ? 'edited' : 'accepted');
  };
  return (
    <Screen id="072" title="Proposal draft" description="A starting point built from the tender scope and your verified profile. You review and edit every section, then paste it into your bid yourself.">
      <Link href={`/tenders/${id}`} className="cz-od-back"><Icon name="prev" size={16} />Back to tender</Link>
      {gen.error && <Alert tone="danger">{gen.error}</Alert>}
      {!gen.data ? (
        <div className="cz-card cz-ai-start">
          <span className="cz-od-route-icon"><Icon name="documents" size={20} /></span>
          <div><strong>Draft the technical sections</strong><p className="cz-muted">Understanding, approach, experience, track record and certifications. Prices are never suggested.</p></div>
          <Button variant="accent" onClick={() => gen.run()} loading={gen.pending}>Create draft</Button>
        </div>
      ) : (
        <>
          <Alert tone="info" title="Draft only.">{gen.data.notice}</Alert>
          <div className="cz-draft">
            {sections!.map((s, i) => (
              <section key={s.heading} className="cz-card">
                <div className="cz-card-head"><h2>{s.heading}</h2><span className="cz-tag" title="Where this text came from">{s.source}</span></div>
                <textarea className="cz-input" rows={Math.min(10, Math.max(3, Math.ceil(s.body.length / 90)))} aria-label={s.heading} value={s.body} onChange={(e) => setSections(sections!.map((x, j) => (j === i ? { ...x, body: e.target.value } : x)))} />
              </section>
            ))}
          </div>
          <div className="cz-ai-actions">
            <p className="cz-ai-prov" style={{ margin: 0 }}><Icon name="info" size={13} />{gen.data.subject.code} · {gen.data.provider === 'rules' ? 'COLLABIZ rules engine' : gen.data.provider} · version {gen.data.promptVersion}</p>
            <span className="cz-row" style={{ gap: 6 }}>
              <Button onClick={copyAll}><Icon name={copied ? 'check' : 'documents'} size={15} />{copied ? 'Copied' : 'Copy all sections'}</Button>
              <Link href={`/tenders/${id}/bid`} className="cz-btn cz-btn-secondary">Open bid form</Link>
              {!review.data && <Button variant="ghost" onClick={() => review.run('rejected')}>Discard draft</Button>}
            </span>
          </div>
        </>
      )}
    </Screen>
  );
}
