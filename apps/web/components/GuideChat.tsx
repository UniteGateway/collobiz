'use client';
/**
 * The COLLABIZ guide: a chat button on every page for new and existing people. It answers with links to the right
 * place (rules, not a language model), and on request hands the chat to the Unite team, whose replies appear here.
 * The conversation is kept with a random token in this browser; signed-in members' chats are also linked to them.
 */
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { GUIDE_WELCOME } from '@collabiz/types';
import { api } from '@/lib/api';
import { useSession } from '@/lib/session';

interface Msg { id: string; sender: 'visitor' | 'guide' | 'staff'; body: string; links: { label: string; href: string }[] | null; staff: string | null; createdAt?: string }
const KEY = 'cz-guide-token';
const getToken = () => { try { return localStorage.getItem(KEY) ?? undefined; } catch { return undefined; } };
const setToken = (t: string | null) => { try { if (t) localStorage.setItem(KEY, t); else localStorage.removeItem(KEY); } catch { /* private mode */ } };
const welcome: Msg = { id: 'welcome', sender: 'guide', body: GUIDE_WELCOME.text, links: GUIDE_WELCOME.links, staff: null };

export function GuideChat() {
  const path = usePathname() ?? '/';
  const { me } = useSession();
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([welcome]);
  const [status, setStatus] = useState('open');
  const [text, setText] = useState('');
  const [who, setWho] = useState({ name: '', email: '' });
  const [askWho, setAskWho] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const end = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    const t = getToken();
    if (!t) return;
    try { const r = await api.get<{ status: string; messages: Msg[] }>('/public/guide/messages', { token: t }); setMsgs(r.messages); setStatus(r.status); }
    catch { setToken(null); setMsgs([welcome]); setStatus('open'); }
  }, []);
  useEffect(() => { if (open) { refresh(); input.current?.focus(); } }, [open, refresh]);
  // While a person from the Unite team is handling the chat, check for replies.
  useEffect(() => {
    if (!open || (status !== 'waiting' && status !== 'answered')) return;
    const t = setInterval(refresh, 8000);
    return () => clearInterval(t);
  }, [open, status, refresh]);
  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }); }, [msgs, open]);
  useEffect(() => { const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); }; window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey); }, []);

  const send = async (body: string, handover = false) => {
    const t = body.trim();
    if (!t || busy) return;
    if (handover && !me && !who.email.trim()) { setAskWho(true); return; }
    setBusy(true); setErr(null);
    setMsgs((m) => [...m, { id: `local-${Date.now()}`, sender: 'visitor', body: t, links: null, staff: null }]);
    setText('');
    try {
      const r = await api.post<{ token: string; status: string; messages: Msg[] }>('/public/guide/messages', { token: getToken(), text: t, page: path, handover: handover || undefined, name: who.name.trim() || undefined, email: who.email.trim() || undefined });
      setToken(r.token); setMsgs(r.messages); setStatus(r.status); setAskWho(false);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'The message could not be sent. Please try again.');
    } finally { setBusy(false); }
  };
  const restart = () => { setToken(null); setMsgs([welcome]); setStatus('open'); };

  return (
    <div className="cz-guide" data-guide>
      {open && (
        <section className="cz-guide-panel" role="dialog" aria-modal="false" aria-labelledby="cz-guide-h">
          <header>
            <span className="cz-guide-avatar" aria-hidden>C</span>
            <div><h2 id="cz-guide-h">COLLABIZ guide</h2><p>{status === 'waiting' ? 'A person from the Unite team will reply here' : status === 'answered' ? 'Chatting with the Unite team' : status === 'closed' ? 'This chat is closed' : 'Ask anything — or ask for a person'}</p></div>
            <button type="button" onClick={() => setOpen(false)} aria-label="Close chat">×</button>
          </header>
          <div className="cz-guide-msgs" aria-live="polite">
            {msgs.map((m) => (
              <div key={m.id} className={`cz-guide-msg is-${m.sender}`} data-sender={m.sender}>
                {m.sender === 'staff' && <small>{m.staff ?? 'Unite team'}</small>}
                <p>{m.body}</p>
                {!!m.links?.length && <div className="cz-guide-links">{m.links.map((l) => <Link key={l.href} href={l.href} onClick={() => setOpen(false)}>{l.label}</Link>)}</div>}
              </div>
            ))}
            {busy && <div className="cz-guide-msg is-guide cz-guide-typing" aria-label="Guide is typing"><span /><span /><span /></div>}
            <div ref={end} />
          </div>
          {err && <p className="cz-guide-err" role="alert">{err}</p>}
          {askWho && (
            <form className="cz-guide-who" onSubmit={(e) => { e.preventDefault(); send(text || 'I would like to talk to a person', true); }}>
              <p>So the Unite team can reply even if you leave this page:</p>
              <label>Your name<input value={who.name} onChange={(e) => setWho({ ...who, name: e.target.value })} autoComplete="name" /></label>
              <label>Email<input type="email" required value={who.email} onChange={(e) => setWho({ ...who, email: e.target.value })} autoComplete="email" /></label>
              <button type="submit" className="cz-btn cz-btn-accent cz-btn-sm" disabled={!who.email.trim()}>Ask for a person</button>
            </form>
          )}
          {status === 'closed' ? (
            <div className="cz-guide-foot"><button type="button" className="cz-btn cz-btn-secondary cz-btn-sm" onClick={restart}>Start a new chat</button></div>
          ) : (
            <form className="cz-guide-input" onSubmit={(e) => { e.preventDefault(); send(text); }}>
              <label htmlFor="cz-guide-text" className="cz-sr-only">Your message</label>
              <input id="cz-guide-text" ref={input} value={text} onChange={(e) => setText(e.target.value)} placeholder="Type your question…" maxLength={1000} autoComplete="off" />
              <button type="submit" disabled={busy || !text.trim()} aria-label="Send"><svg viewBox="0 0 24 24" width="20" height="20" aria-hidden><path d="M3 20l18-8L3 4v6l12 2-12 2z" fill="currentColor" /></svg></button>
            </form>
          )}
          {status === 'open' && !askWho && <button type="button" className="cz-guide-person" onClick={() => send(text || 'I would like to talk to a person', true)}>Talk to a person</button>}
        </section>
      )}
      <button type="button" className="cz-guide-btn" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-label={open ? 'Close the COLLABIZ guide' : 'Open the COLLABIZ guide chat'}>
        {open ? <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" /></svg>
          : <><svg viewBox="0 0 24 24" width="24" height="24" aria-hidden><path d="M4 5h16v11H9l-5 4z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" /><circle cx="9" cy="10.5" r="1.2" fill="currentColor" /><circle cx="12" cy="10.5" r="1.2" fill="currentColor" /><circle cx="15" cy="10.5" r="1.2" fill="currentColor" /></svg><span>Need help?</span></>}
      </button>
    </div>
  );
}
