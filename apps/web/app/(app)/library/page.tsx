'use client';
import { useState } from 'react';
import { DOCUMENT_KINDS, DOCUMENT_KIND_LABELS, DOCUMENT_MODULES } from '@collabiz/types';
import { Segmented, Select } from '@collabiz/ui';
import { Screen } from '@/components/Screen';
import { ModuleDocuments } from '@/components/ModuleExtras';

/** Catalogues & documents — every module's catalogues, brochures, DPRs, datasheets and templates in one place. */
export default function Library() {
  const [m, setM] = useState('all');
  const [kind, setKind] = useState('');
  return (
    <Screen page={{ key: 'library', title: 'Catalogues & documents', access: 'authenticated' }} description="Product catalogues, brochures, DPRs, datasheets, presentations and templates published by Unite for every module.">
      <div className="cz-row" style={{ gap: 12, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 14 }}>
        <div style={{ minWidth: 240 }}><Select label="Module" value={m} onChange={(e) => setM(e.target.value)} options={[{ value: 'all', label: 'All modules' }, ...DOCUMENT_MODULES.filter(([k]) => k !== 'general').map(([value, label]) => ({ value, label }))]} /></div>
        <div className="cz-scroll-x"><Segmented label="Type" value={kind} onChange={setKind} options={[{ value: '', label: 'All types' }, ...DOCUMENT_KINDS.filter((k) => ['catalogue', 'brochure', 'dpr', 'datasheet', 'presentation', 'template'].includes(k)).map((k) => ({ value: k, label: DOCUMENT_KIND_LABELS[k].replace(' (detailed project report)', '') }))]} /></div>
      </div>
      <LibraryList moduleKey={m} kind={kind} />
    </Screen>
  );
}
function LibraryList({ moduleKey, kind }: { moduleKey: string; kind: string }) {
  return <div key={`${moduleKey}-${kind}`}><ModuleDocuments moduleKey={moduleKey} title={kind ? DOCUMENT_KIND_LABELS[kind] : 'All documents'} kind={kind || undefined} /></div>;
}
