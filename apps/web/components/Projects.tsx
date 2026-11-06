'use client';
import Link from 'next/link';
import { useParams, usePathname } from 'next/navigation';
import { useQuery } from '@/lib/hooks';

export const fmtDate = (d?: string | null) => (d ? new Date(d.length === 10 ? `${d}T00:00:00` : d).toLocaleDateString('en-IN', { dateStyle: 'medium' }) : '—');
export const fmtTime = (d?: string | null) => (d ? new Date(d).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '—');
export const rupees = (minor?: number | null) => (minor == null ? '—' : new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(minor / 100));

/** Project overview (role-shaped by the API: owner / lead / subcontractor). */
export function useProject() {
  const { id } = useParams<{ id: string }>();
  const q = useQuery<any>(`/projects/${id}`);
  return { id, ...q };
}

export function ProjectTabs({ id, role }: { id: string; role?: string }) {
  const path = usePathname();
  const tabs: [string, string][] = [['', 'Overview'], ['/milestones', 'Milestones'], ['/allocation', 'Allocation'], ['/progress', 'Site progress'], ['/materials', 'Materials'], ['/documents', 'Documents'], ['/inspections', 'Inspections']];
  if (role !== 'subcontractor') tabs.push(['/certification', 'Certification & invoices']);
  tabs.push(['/closure', 'Closure']);
  return <nav aria-label="Project sections" className="cz-tabs">{tabs.map(([p, l]) => <Link key={p} href={`/projects/${id}${p}`} aria-current={path === `/projects/${id}${p}` ? 'page' : undefined}>{l}</Link>)}</nav>;
}

export const CHANGE_LABELS: Record<string, string> = { dueDate: 'Due date', amount: 'Amount', title: 'Title', scope: 'Scope', allocatedValue: 'Allocation', assignedOrgId: 'Assigned to', status: 'Status', added: 'Added', removed: 'Removed', uploaded: 'Uploaded', superseded: 'New version', deliveredQty: 'Delivered qty', requiresInspection: 'Inspection required', created: 'Created', description: 'Description', supplier: 'Supplier', notes: 'Notes' };
export function changeValue(field: string, v: unknown) {
  if (v == null) return '—';
  if ((field === 'amount' || field === 'allocatedValue') && typeof v === 'number') return rupees(v);
  if (typeof v === 'object') return Object.entries(v as Record<string, unknown>).map(([k, x]) => `${k}: ${typeof x === 'number' && /value|amount/i.test(k) ? rupees(x) : String(x)}`).join(', ');
  return String(v);
}
