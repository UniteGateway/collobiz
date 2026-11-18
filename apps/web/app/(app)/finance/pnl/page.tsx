'use client';
import { useState } from 'react';
import { EXPENSE_CATEGORIES, EXPENSE_LABELS } from '@collabiz/types';
import { Alert, Button, ButtonLink, Card, DataTable, LoadingState, Segmented, Select, TextInput } from '@collabiz/ui';
import { ApiErrorView, Screen } from '@/components/Screen';
import { dt } from '@/components/Ops';
import { api } from '@/lib/api';
import { useMutation, useQuery } from '@/lib/hooks';

interface Measure { key: string; group: string; label: string; help: string; value: number }
interface Pnl { from: string; to: string; measures: Measure[]; note: string }
interface Expense { id: string; date: string; categoryLabel: string; amount: number; description: string; vendor: string | null }
const money = (p: number) => { const r = p / 100; const s = r < 0 ? '−' : ''; const a = Math.abs(r); return `${s}₹${a >= 1e7 ? `${(a / 1e7).toFixed(2)} Cr` : a >= 1e5 ? `${(a / 1e5).toFixed(2)} L` : Math.round(a).toLocaleString('en-IN')}`; };

/** Profit report — each measure separate; pipeline and contract value are not revenue, invoiced revenue is not cash. */
export default function ProfitReport() {
  const [tab, setTab] = useState('report');
  const [range, setRange] = useState({ from: '', to: '' });
  const q = useQuery<Pnl>('/books/pnl', { from: range.from || undefined, to: range.to || undefined });
  const ex = useQuery<Expense[]>(tab === 'expenses' ? '/books/expenses' : null);
  const [f, setF] = useState({ date: new Date().toISOString().slice(0, 10), category: 'rent', amount: '', description: '', vendor: '' });
  const add = useMutation(async () => { await api.post('/books/expenses', { ...f, amount: Math.round(Number(f.amount || 0) * 100), vendor: f.vendor || undefined }); setF({ ...f, amount: '', description: '', vendor: '' }); ex.reload(); q.reload(); return true; });
  const p = q.data;
  let lastGroup = '';
  return (
    <Screen page={{ key: 'finance-pnl', title: 'Profit report', access: 'partner' }} eyebrow="Invoices & P&L"
      description="Your business on COLLABIZ, measure by measure. Pipeline and contract value are not revenue, invoiced revenue is not cash, and profit counts only what is recorded here."
      actions={<ButtonLink href="/finance/credit-notes" variant="secondary">Invoices & credit notes</ButtonLink>}>
      <Segmented label="Section" value={tab} onChange={setTab} options={[{ value: 'report', label: 'Report' }, { value: 'expenses', label: 'Expenses' }]} />
      <div style={{ marginTop: 14 }}>
        {tab === 'report' ? <>
          <div className="cz-ugp-filters" role="group" aria-label="Period">
            <label className="cz-mini-field">From<input type="date" aria-label="From" value={range.from || p?.from || ''} onChange={(e) => setRange({ ...range, from: e.target.value })} /></label>
            <label className="cz-mini-field">To<input type="date" aria-label="To" value={range.to || p?.to || ''} onChange={(e) => setRange({ ...range, to: e.target.value })} /></label>
          </div>
          {q.error ? <ApiErrorView error={q.error} onRetry={q.reload} /> : !p ? <LoadingState /> : <>
            <div className="cz-pnl" role="table" aria-label={`Profit report ${p.from} to ${p.to}`}>
              <div className="cz-pnl-row cz-pnl-head" role="row"><span role="columnheader">Measure</span><span role="columnheader">{dt(p.from)} – {dt(p.to)}</span></div>
              {p.measures.map((m) => {
                const head = m.group !== lastGroup ? m.group : null; lastGroup = m.group;
                return (
                  <div key={m.key} role="rowgroup">
                    {head && <div className="cz-pnl-group" role="row"><span role="cell">{head}</span><span role="cell" /></div>}
                    <div className={`cz-pnl-row${['grossProfit', 'netProfit'].includes(m.key) ? ' cz-pnl-total' : ''}`} role="row" data-measure={m.key}>
                      <span role="cell"><strong>{m.label}</strong><em>{m.help}</em></span><span role="cell" className={m.value < 0 ? 'cz-neg' : ''}>{money(m.value)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
            <p className="cz-muted" style={{ fontSize: 13 }}>{p.note}</p>
          </>}
        </> : <div className="cz-stack" style={{ gap: 16 }}>
          <Card title="Record an expense">
            <form noValidate className="cz-stack" style={{ gap: 12 }} onSubmit={(e) => { e.preventDefault(); add.run(); }}>
              {add.error && <Alert tone="danger">{add.error}</Alert>}
              <div className="cz-grid cz-grid-2">
                <TextInput label="Date" type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} />
                <Select label="Category" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} options={EXPENSE_CATEGORIES.map((c) => ({ value: c, label: EXPENSE_LABELS[c] }))} />
                <TextInput label="Amount (₹)" inputMode="decimal" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} error={add.fieldErrors.amount} />
                <TextInput label="Vendor (optional)" value={f.vendor} onChange={(e) => setF({ ...f, vendor: e.target.value })} />
              </div>
              <TextInput label="Description" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} error={add.fieldErrors.description} />
              <div><Button type="submit" loading={add.pending}>Record expense</Button></div>
            </form>
          </Card>
          {ex.error ? <ApiErrorView error={ex.error} onRetry={ex.reload} /> : !ex.data ? <LoadingState /> : (
            <DataTable rows={ex.data} caption="Expenses" empty={<p className="cz-muted">No expenses recorded yet.</p>} columns={[
              { key: 'd', header: 'Date', render: (e) => dt(e.date) }, { key: 'c', header: 'Category', render: (e) => e.categoryLabel }, { key: 's', header: 'Description', render: (e) => e.description },
              { key: 'v', header: 'Vendor', render: (e) => e.vendor ?? '—' }, { key: 'a', header: 'Amount', render: (e) => money(e.amount) },
            ]} />
          )}
        </div>}
      </div>
    </Screen>
  );
}
