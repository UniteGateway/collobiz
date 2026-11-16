'use client';
import { useEffect, useState } from 'react';
import { Button, Notice } from '@/components/ui';
import { PageTitle } from '@/components/Shell';
import { useScenario } from '@/components/Scenario';
import { RouteInputsCard, RouteResult, TariffRegister, type Body, type RouteResp } from '@/components/OpenAccess';
import { api, useApi } from '@/lib/client';

/** Module 7 — AP intra-state open access: delivered cost from the plant to an AP consumer, from approved tariff records. */
export default function OpenAccess() {
  const { query } = useScenario();
  const init = useApi<RouteResp>(`/api/openaccess?${query}&to=AP`);
  const me = useApi<{ role: string }>('/api/me');
  const [b, setB] = useState<Body | null>(null); const [r, setR] = useState<RouteResp | null>(null);
  const [err, setErr] = useState<string>(); const [busy, setBusy] = useState(false);
  useEffect(() => { if (init.data) { setB({ ...init.data.inputs, sourceState: 'AP', destinationState: 'AP' }); setR(init.data); } }, [init.data]);
  const calc = async (body = b) => { setBusy(true); setErr(undefined); try { setR(await api<RouteResp>(`/api/openaccess?${query}`, { method: 'POST', body: JSON.stringify({ ...body, sourceState: 'AP', destinationState: 'AP' }) })); } catch (e) { setErr((e as Error).message); } finally { setBusy(false); } };
  if (init.error) return <><PageTitle title="AP Open Access" /><Notice tone="red">{init.error}</Notice></>;
  if (!b || !r) return <PageTitle title="AP Open Access" subtitle="Simulating the delivered energy…" />;
  return (
    <>
      <PageTitle title="AP Open Access" subtitle="What supply from the plant costs an Andhra Pradesh consumer once transmission, wheeling, losses and surcharges are added — and what it saves against their discom tariff." actions={<Button onClick={() => calc()} disabled={busy}>{busy ? 'Calculating…' : 'Calculate'}</Button>} />
      <Notice tone="amber">Charges come from tariff records. Placeholders are marked “Illustrative” — they are not APERC figures. Replace each with the order in force (below) before quoting a saving.</Notice>
      {err && <div className="mt-3"><Notice tone="red">{err}</Notice></div>}
      <div className="mt-4"><RouteResult r={r.result} /></div>
      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <RouteInputsCard b={b} set={(k, v) => setB({ ...b, [k]: v })} states={r.states} />
        <TariffRegister jurisdictions={['AP']} role={me.data?.role} onChanged={() => calc()} />
      </div>
    </>
  );
}
