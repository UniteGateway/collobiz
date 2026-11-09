'use client';
import { useEffect, useState } from 'react';
import { PARTNER_TYPES, PARTNER_TYPE_LABELS } from '@collabiz/types';
import { Alert, Button, Card, ChipSelect } from '@collabiz/ui';
import { Screen } from '@/components/Screen';
import { api } from '@/lib/api';
import { useMutation } from '@/lib/hooks';
import { useSession } from '@/lib/session';
import { useOnboarding } from '@/lib/onboarding';

const LABEL = PARTNER_TYPE_LABELS;

/** Screen 013 — Select Account Type. */
export default function AccountTypePage() {
  const { me, refresh, switchOrg } = useSession();
  const { status, goNext, reload, locked } = useOnboarding();
  const [kind, setKind] = useState<'individual' | 'company'>('company');
  const [types, setTypes] = useState<string[]>([]);
  useEffect(() => {
    if (status?.kind) setKind(status.kind);
    if (status?.organization?.partnerTypes?.length) setTypes(status.organization.partnerTypes);
  }, [status]);
  const m = useMutation(async () => {
    const r = await api.post<{ organizationId: string }>('/onboarding/account-type', { kind, partnerTypes: types });
    await switchOrg(r.organizationId);
    await refresh();
    reload();
    goNext('account_type');
    return r;
  });
  return (
    <Screen id="013" description="Choose how you will work on COLLABIZ. One organization can operate across several industries and regions.">
      {!me?.emailVerified && <Alert tone="warning">Verify your email before creating a partner account. <a href="/verify">Verify now</a></Alert>}
      {m.error && <Alert tone="danger">{m.error}</Alert>}
      <form noValidate onSubmit={(e) => { e.preventDefault(); m.run(); }}>
        <fieldset className="cz-fieldset">
          <legend>Account type</legend>
          <div className="cz-grid cz-grid-2">
            {([['individual', 'Individual partner', 'Consultants, freelancers and independent professionals registering leads and earning agreed remuneration.'], ['company', 'Company partner', 'Contractors, traders, manufacturers and firms with a team, corporate documents and bids.']] as const).map(([v, t, d]) => (
              <label key={v} className="cz-card" style={{ cursor: 'pointer', borderColor: kind === v ? 'var(--cz-green-500)' : undefined, borderWidth: 2 }}>
                <input type="radio" name="kind" value={v} checked={kind === v} onChange={() => setKind(v)} disabled={locked} /> <strong>{t}</strong>
                <p className="cz-muted" style={{ margin: '6px 0 0' }}>{d}</p>
              </label>
            ))}
          </div>
        </fieldset>
        <Card>
          <ChipSelect legend="What best describes your business? (choose all that apply)" value={types} onChange={setTypes} options={PARTNER_TYPES.map((p) => ({ value: p, label: LABEL[p] }))} />
          {m.fieldErrors.partnerTypes && <p className="cz-error-text">{m.fieldErrors.partnerTypes}</p>}
        </Card>
        <div style={{ marginTop: 16 }}><Button type="submit" loading={m.pending} disabled={locked || !me?.emailVerified}>Save and continue</Button></div>
      </form>
    </Screen>
  );
}
