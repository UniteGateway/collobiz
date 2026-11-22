'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Alert, Button, Card, Select, TextArea, TextInput } from '@collabiz/ui';
import { Screen } from '@/components/Screen';
import { api } from '@/lib/api';
import { useMutation } from '@/lib/hooks';

const KINDS = [['immigration_adviser', 'Immigration adviser'], ['business_consultant', 'Business consultant'], ['financial_consultant', 'Financial consultant'], ['accountant', 'Accountant'], ['law_firm', 'Law firm'], ['project_representative', 'Authorised project representative'], ['other', 'Other referral source']];

/** Apply to introduce prospects to GO EB5. Compliance decides; nothing is paid automatically. */
export default function Eb5PartnerApply() {
  const router = useRouter();
  const [f, setF] = useState({ kind: 'business_consultant', role: 'bd_partner', jurisdiction: 'India', specialization: '', credentials: '', contactEmail: '' });
  const save = useMutation(async () => { const r = await api.post<{ id: string }>('/eb5/partners/apply', { ...f, credentials: f.credentials || undefined }); router.push('/eb5/partner'); return r; });
  const e = save.fieldErrors;
  return (
    <Screen page={{ key: 'eb5-partner-apply', title: 'Become a GO EB5 partner', access: 'partner' }} eyebrow="GO EB5" description="Introduce consented prospects to GO EB5 (CITRUS360 LLC). Your business is checked by compliance before you can introduce anyone.">
      <Alert tone="warning" title="Compensation is not automatic">EB-5 introductions are regulated. Any compensation needs a separate written arrangement approved by U.S. counsel, including Form I-956K promoter registration where it applies. You must never promise visas or returns.</Alert>
      <Card className="cz-mt">
        <form noValidate className="cz-stack" style={{ gap: 12 }} onSubmit={(ev) => { ev.preventDefault(); save.run(); }}>
          {save.error && <Alert tone="danger">{save.error}</Alert>}
          <div className="cz-grid cz-grid-2">
            <Select label="Type of business" value={f.kind} onChange={(ev) => setF({ ...f, kind: ev.target.value })} options={KINDS.map(([value, label]) => ({ value, label }))} />
            <Select label="Partner role" value={f.role} onChange={(ev) => setF({ ...f, role: ev.target.value })} options={[{ value: 'bd_partner', label: 'Business development partner' }, { value: 'referral_consultant', label: 'Referral consultant' }]} />
            <TextInput label="Country / jurisdiction" value={f.jurisdiction} onChange={(ev) => setF({ ...f, jurisdiction: ev.target.value })} error={e.jurisdiction} />
            <TextInput label="Contact email for GO EB5" value={f.contactEmail} onChange={(ev) => setF({ ...f, contactEmail: ev.target.value })} error={e.contactEmail} />
          </div>
          <TextArea label="Who you introduce (referral specialisation)" rows={3} value={f.specialization} onChange={(ev) => setF({ ...f, specialization: ev.target.value })} error={e.specialization} />
          <TextArea label="Professional credentials (licences, memberships — optional)" rows={2} value={f.credentials} onChange={(ev) => setF({ ...f, credentials: ev.target.value })} />
          <div><Button type="submit" loading={save.pending}>Submit for compliance review</Button></div>
        </form>
      </Card>
    </Screen>
  );
}
