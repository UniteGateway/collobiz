import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { render, screen, fireEvent } from '@testing-library/react';
import { colors, toneForStatus } from './tokens';
import { AppShell, DataTable, StatusBadge, PermissionDenied, TextInput, ChipSelect, Stepper } from './index';

describe('design token parity (web CSS ↔ tokens.ts used by mobile)', () => {
  const css = readFileSync(join(__dirname, 'styles.css'), 'utf8');
  const kebab = (k: string) => k.replace(/([a-z])(\d)/g, '$1-$2').replace(/([A-Z])/g, '-$1').toLowerCase();
  it.each(Object.entries(colors))('%s matches CSS variable', (k, v) => {
    expect(css).toContain(`--cz-${kebab(k)}: ${v};`);
  });
});

describe('components', () => {
  it('DataTable renders empty state when no rows', () => {
    render(<DataTable columns={[{ key: 'a', header: 'A' }]} rows={[]} />);
    expect(screen.getByText('Nothing here yet')).toBeTruthy();
  });
  it('DataTable renders rows', () => {
    render(<DataTable columns={[{ key: 'name', header: 'Name' }]} rows={[{ id: '1', name: 'Volt EPC' }]} />);
    expect(screen.getByText('Volt EPC')).toBeTruthy();
  });
  it('StatusBadge maps workflow tone', () => {
    render(<StatusBadge status="reupload_requested" />);
    expect(screen.getByText('Reupload requested').getAttribute('data-status')).toBe('reupload_requested');
    expect(toneForStatus('settled')).toBe('success');
    expect(toneForStatus('disputed')).toBe('danger');
    // Regression (audit §3.4): negated states must not render as success
    for (const st of ['disqualified', 'not_awarded', 'unverified', 'inactive', 'Disqualified']) expect(toneForStatus(st)).toBe('danger');
    expect(toneForStatus('technically_qualified')).toBe('success');
    expect(toneForStatus('pending_review')).toBe('warning');
  });
  it('PermissionDenied is announced', () => {
    render(<PermissionDenied />);
    expect(screen.getByRole('alert').textContent).toMatch(/Access restricted/);
  });
  it('TextInput links label, error and aria-invalid', () => {
    render(<TextInput label="Email" error="Required" />);
    const input = screen.getByLabelText('Email');
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(input.getAttribute('aria-describedby')).toContain('-err');
  });
  it('ChipSelect toggles and respects max', () => {
    let v: string[] = ['a'];
    const { rerender } = render(<ChipSelect legend="Sectors" options={[{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }]} value={v} onChange={(n) => (v = n)} max={1} />);
    fireEvent.click(screen.getByText('B'));
    expect(v).toEqual(['a']);
    fireEvent.click(screen.getByText('A'));
    expect(v).toEqual([]);
    rerender(<Stepper steps={['Submitted', 'Reviewed']} current={1} />);
    expect(screen.getByText('Reviewed').getAttribute('aria-current')).toBe('step');
  });
});

describe('AppShell grouped navigation', () => {
  const sections = [
    { items: [{ href: '/dashboard', label: 'Home' }] },
    { title: 'Grow your business', collapsible: true, items: [{ href: '/collab', label: 'Collab', children: [{ href: '/collab/workspace', label: 'My collaborations' }] }] },
    { title: 'Money', collapsible: true, items: [{ href: '/earnings', label: 'Earnings' }] },
  ];
  beforeEach(() => localStorage.clear());
  it('collapses and expands sections, remembering the choice', () => {
    const { unmount } = render(<AppShell sections={sections} currentPath="/dashboard"><p>x</p></AppShell>);
    expect(screen.getByRole('link', { name: 'Earnings' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Money/ }));
    expect(screen.queryByRole('link', { name: 'Earnings' })).toBeNull();
    unmount();
    render(<AppShell sections={sections} currentPath="/dashboard"><p>x</p></AppShell>);
    expect(screen.queryByRole('link', { name: 'Earnings' })).toBeNull(); // remembered
  });
  it('shows a module sub-menu on demand, and always when you are on one of its pages', () => {
    const { unmount } = render(<AppShell sections={sections} currentPath="/dashboard"><p>x</p></AppShell>);
    expect(screen.queryByRole('link', { name: 'My collaborations' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Show more pages' }));
    expect(screen.getByRole('link', { name: 'My collaborations' })).toBeTruthy();
    unmount(); localStorage.clear();
    render(<AppShell sections={sections} currentPath="/collab/workspace"><p>x</p></AppShell>);
    expect(screen.getByRole('link', { name: 'My collaborations' }).getAttribute('aria-current')).toBe('page');
  });
  it('a collapsed section still opens when it holds the current page', () => {
    localStorage.setItem('cz-nav', JSON.stringify({ 's:Money': false }));
    render(<AppShell sections={sections} currentPath="/earnings"><p>x</p></AppShell>);
    expect(screen.getByRole('link', { name: 'Earnings' }).getAttribute('aria-current')).toBe('page');
  });
});
