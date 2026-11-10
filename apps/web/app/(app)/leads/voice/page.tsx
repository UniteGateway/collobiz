'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { VOICE_LANGUAGES, extractLead, sectorName, type VoiceExtract } from '@collabiz/types';
import { Alert, Button, Card, Checkbox, Select, TextArea } from '@collabiz/ui';
import { Screen } from '@/components/Screen';
import { useLeadDraft } from '@/lib/leadDraft';

type Rec = { lang: string; interimResults: boolean; continuous: boolean; start(): void; stop(): void; onresult: ((e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null; onend: (() => void) | null; onerror: ((e: { error: string }) => void) | null };
const recognizer = (): (new () => Rec) | null => (typeof window === 'undefined' ? null : ((window as unknown as Record<string, unknown>).SpeechRecognition ?? (window as unknown as Record<string, unknown>).webkitSpeechRecognition) as (new () => Rec) | null) ?? null;
const rupees = (p: number) => `₹${Math.round(p / 100).toLocaleString('en-IN')}`;

/** Screen 174 — Voice opportunity: describe a lead by speaking (or typing); COLLABIZ fills the lead form for you to check. */
export default function VoiceLead() {
  const router = useRouter();
  const { d, update, ready } = useLeadDraft();
  const [lang, setLang] = useState<keyof typeof VOICE_LANGUAGES>('en-IN');
  const [consent, setConsent] = useState(false);
  const [text, setText] = useState('');
  const [listening, setListening] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [x, setX] = useState<VoiceExtract | null>(null);
  const rec = useRef<Rec | null>(null);
  const [supported, setSupported] = useState(false);
  useEffect(() => { setSupported(!!recognizer()); return () => rec.current?.stop(); }, []);
  const start = () => {
    const R = recognizer(); if (!R) return;
    const r = new R(); r.lang = lang; r.interimResults = false; r.continuous = true;
    r.onresult = (e) => { let add = ''; for (let i = e.resultIndex; i < e.results.length; i++) if (e.results[i].isFinal) add += e.results[i][0].transcript; if (add) setText((t) => `${t}${t ? ' ' : ''}${add.trim()}`); };
    r.onerror = (e) => { setErr(e.error === 'not-allowed' ? 'Microphone access was refused. Allow it in the browser, or type instead.' : `Speech recognition stopped (${e.error}). You can type instead.`); setListening(false); };
    r.onend = () => setListening(false);
    rec.current = r; setErr(null); r.start(); setListening(true);
  };
  const stop = () => { rec.current?.stop(); setListening(false); };
  const useIt = () => {
    if (!x) return;
    update({
      customer: { ...d.customer, legalName: x.customer ?? d.customer.legalName, city: x.city ?? d.customer.city, contactPhone: x.contactPhone ?? d.customer.contactPhone },
      sector: x.sector ?? d.sector, productOrProject: x.productOrProject ?? d.productOrProject, quantityOrCapacity: x.quantityOrCapacity ?? d.quantityOrCapacity,
      estimatedValue: x.estimatedValue != null ? String(x.estimatedValue / 100) : d.estimatedValue, expectedCloseDate: x.expectedCloseDate ?? d.expectedCloseDate,
      requirements: d.requirements || text.slice(0, 8000),
    });
    router.push('/leads/new');
  };
  const rows: [string, string | null][] = x ? [['Customer', x.customer], ['City', x.city], ['Sector', x.sector ? sectorName(x.sector) : null], ['Product or project', x.productOrProject], ['Capacity / quantity', x.quantityOrCapacity], ['Value', x.estimatedValue != null ? rupees(x.estimatedValue) : null], ['Expected decision', x.expectedCloseDate], ['Phone', x.contactPhone]] : [];
  return (
    <Screen page={{ key: 'voice-lead', title: 'Describe a lead by voice', access: 'partner' }} description="Speak or type what the customer needs — in English, Hindi or Telugu. COLLABIZ fills the lead form; you check every field and add the buyer’s consent before anything is registered.">
      <Card title="1. Speak or type">
        <div style={{ maxWidth: 280 }}><Select label="Language" value={lang} onChange={(e) => setLang(e.target.value as keyof typeof VOICE_LANGUAGES)} options={Object.entries(VOICE_LANGUAGES).map(([value, label]) => ({ value, label }))} /></div>
        {supported ? (
          <>
            <Checkbox label="I understand the browser sends my voice to its speech service (for example Google) to turn it into text. I will not dictate personal details the customer has not agreed to share." checked={consent} onChange={(e) => setConsent(e.target.checked)} />
            <div className="cz-row" style={{ gap: 8, margin: '8px 0' }}>
              {!listening ? <Button onClick={start} disabled={!consent}>Start speaking</Button> : <Button variant="danger" onClick={stop}>Stop</Button>}
              {listening && <span className="cz-muted" aria-live="polite">Listening…</span>}
            </div>
          </>
        ) : <Alert tone="info">This browser cannot turn speech into text. Type the description below — or use your phone keyboard’s microphone.</Alert>}
        {err && <Alert tone="warning">{err}</Alert>}
        <TextArea label="What the customer needs" rows={5} value={text} onChange={(e) => setText(e.target.value)} hint="Example: “Customer is Shree Ganesh Engineering Pvt Ltd in Pune, 500 kW rooftop solar, budget about 2.4 crore, decision within 45 days.”" />
        <div><Button variant="secondary" onClick={() => setX(extractLead(text))} disabled={text.trim().length < 10}>Read the details</Button></div>
      </Card>
      {x && (
        <Card title="2. Check what COLLABIZ understood">
          <dl className="cz-dl">{rows.map(([k, v]) => <div key={k} data-voice-field={k}><dt>{k}</dt><dd>{v ?? <span className="cz-muted">Not heard</span>}</dd></div>)}</dl>
          {x.missing.length > 0 && <Alert tone="warning" title="Still needed">{x.missing.map((m) => <div key={m.field} data-voice-missing={m.field}>{m.question}</div>)}</Alert>}
          <p className="cz-muted" style={{ fontSize: 13 }}>These are suggestions. You can change any of them in the lead form.</p>
          <Button onClick={useIt} disabled={!ready}>Use these details in the lead form</Button>
        </Card>
      )}
    </Screen>
  );
}
