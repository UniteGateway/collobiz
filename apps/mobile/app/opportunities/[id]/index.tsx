import { Alert, Share, Text, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { sectorName } from '@collabiz/types';
import { Button, ErrorView, Icon, Loading, Notice, Row, ScreenView, Section, Tag, inrShort, s, theme, type IconName } from '@/components/ui';
import { api } from '@/api';
import { useAction, useApi } from '@/hooks';
import { useSession } from '@/session';

const LEVEL = (l?: string | null) => (l ? `${l.charAt(0).toUpperCase()}${l.slice(1).replace('_', ' ')} partner` : '—');
const KIND: Record<string, string> = { project: 'Project', product_supply: 'Product supply', service: 'Service', job: 'Job', distributorship: 'Distributorship', rfq: 'Request for quotation', tender: 'Tender' };
const STEPS = ['submitted', 'shortlisted', 'accepted'] as const;
const CHECK_ICON: Record<string, [IconName, string]> = { pass: ['checkmark-circle', theme.colors.green700], warn: ['alert-circle', theme.colors.warning], fail: ['close-circle', theme.colors.danger] };

/** Screen 036 — Opportunity detail (native) with inline eligibility (041) and application progress. */
export default function OpportunityDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { me } = useSession();
  const o = useApi<any>(`/opportunities/${id}`);
  const d = o.data;
  const partner = !!me?.activeOrg && d && !d.isOwner;
  const el = useApi<any>(partner ? `/opportunities/${id}/eligibility` : null);
  const save = useAction(async () => { if (d.saved) await api.delete(`/opportunities/${id}/save`); else await api.post(`/opportunities/${id}/save`); await o.reload(); });
  const withdraw = useAction(async () => { await api.post(`/opportunities/${id}/applications/${d.myApplication.id}/withdraw`); await o.reload(); await el.reload(); });
  if (o.loading && !d) return <Loading />;
  if (o.error) return <ErrorView error={o.error} onRetry={o.reload} />;

  const days = d.deadline ? Math.ceil((new Date(d.deadline).getTime() - Date.now()) / 86400_000) : null;
  const open = ['accepted', 'released', 'qualification', 'proposal'].includes(d.status) && (days == null || days >= 0);
  const app = d.myApplication && d.myApplication.status !== 'withdrawn' ? d.myApplication : null;
  const checks: any[] = (el.data?.checks ?? []).filter((c: any) => c.key !== 'duplicate');
  const passed = checks.filter((c) => c.result !== 'fail').length;
  const canApply = partner && open && !app && el.data?.eligible;

  return (
    <ScreenView id="036" title={d.title} eyebrow={`${d.route === 'unite_owned' ? 'Unite Group' : 'Partner exchange'} · ${KIND[d.kind] ?? d.kind}`} subtitle={`${d.publisher} · ${sectorName(d.sector)}${d.city ? ` · ${d.city}` : ''}`}
      footer={canApply ? <Button title="Apply now" icon="arrow-forward" variant="accent" onPress={() => router.push(`/opportunities/${id}/apply`)} testID="apply-cta" /> : undefined}>
      <Stack.Screen options={{ title: d.code, headerRight: () => (
        <View style={{ flexDirection: 'row', gap: 18 }}>
          <Text onPress={() => Share.share({ message: `${d.title} — ${d.code}` })} accessibilityRole="button" accessibilityLabel="Share"><Icon name="share-outline" size={22} /></Text>
          <Text onPress={() => save.run()} accessibilityRole="button" accessibilityLabel={d.saved ? 'Remove from saved' : 'Save'} testID="save"><Icon name={d.saved ? 'bookmark' : 'bookmark-outline'} size={22} /></Text>
        </View>
      ) }} />

      {/* Key facts */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: theme.space.xl }}>
        {[
          ['Indicative value', inrShort(d.estimatedValue) ?? 'On request', null],
          ['Closes', d.deadline ? new Date(d.deadline).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : 'Rolling', days != null ? (days < 0 ? 'Closed' : days === 0 ? 'Today' : `${days} days left`) : null],
          ['Who can apply', LEVEL(d.minLevel), 'or above'],
          ['Certifications', d.requiredCertifications.length ? d.requiredCertifications.map((c: string) => c.replace(/^ISO(\d+)/, 'ISO $1')).join(', ') : 'None', null],
        ].map(([k, v, h]) => (
          <View key={k as string} style={[s.kpi, { minWidth: '46%' }]} accessible accessibilityLabel={`${k}: ${v}${h ? `, ${h}` : ''}`}>
            <Text style={s.kpiLabel}>{k}</Text>
            <Text style={{ fontSize: 19, fontWeight: '700', color: theme.colors.navy900, marginTop: 4 }} numberOfLines={2}>{v}</Text>
            {h ? <Text style={[s.kpiHint, (k === 'Closes' && days != null && days <= 7) ? { color: theme.colors.danger, fontWeight: '600' } : null]}>{h}</Text> : null}
          </View>
        ))}
      </View>

      {/* Your status */}
      {app ? (
        <Section title="Your application" footer={`Submitted ${new Date(app.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'long' })}`}>
          {STEPS.map((st, i) => {
            const at = STEPS.indexOf(app.status);
            const done = app.status !== 'rejected' && (i < at || (i === at && st === 'accepted'));
            const current = app.status !== 'rejected' && i === at && st !== 'accepted';
            return <Row key={st} testID={`step-${st}`} icon={done ? 'checkmark-circle' : current ? 'radio-button-on' : 'ellipse-outline'} iconTint={done ? theme.colors.green700 : current ? theme.colors.navy700 : theme.colors.grey300} title={st.charAt(0).toUpperCase() + st.slice(1)} />;
          })}
          {['submitted', 'shortlisted'].includes(app.status) ? <Row title="Withdraw application" chevron={false} icon="arrow-undo" iconTint={theme.colors.danger}
            onPress={() => Alert.alert('Withdraw application?', 'You can apply again while the opportunity is open.', [{ text: 'Keep', style: 'cancel' }, { text: 'Withdraw', style: 'destructive', onPress: () => { withdraw.run(); } }])} /> : null}
        </Section>
      ) : partner ? (
        <Section title={!open ? 'Applications closed' : !el.data ? 'Checking eligibility…' : el.data.eligible ? 'You can apply' : `Not eligible yet · ${passed} of ${checks.length} met`}
          footer={el.data && !el.data.eligible && open ? 'Missing a capability? Form a team with partners who have it.' : undefined}>
          {checks.map((c) => <Row key={c.key} testID={`check-${c.key}`} icon={CHECK_ICON[c.result][0]} iconTint={CHECK_ICON[c.result][1]} title={c.label} subtitle={c.detail} />)}
          {!el.data ? <Row title="Loading…" /> : null}
        </Section>
      ) : null}
      {app?.status === 'accepted' && <Notice tone="success" title="You’ve been selected">{app.decisionReason || 'The publisher will contact you about next steps.'}</Notice>}
      {app?.status === 'rejected' && <Notice tone="info" title="Not selected this time">{app.decisionReason || 'The publisher chose another partner.'}</Notice>}
      {(save.error || withdraw.error) && <Notice tone="danger">{save.error ?? withdraw.error}</Notice>}

      {/* About */}
      <Text style={[s.h2, { marginBottom: 8 }]} accessibilityRole="header">About this opportunity</Text>
      <Text style={[s.p, { marginBottom: theme.space.xl }]}>{d.summary}</Text>
      <Section title="How it works">
        <Row icon={d.route === 'unite_owned' ? 'business' : 'people'} title={d.route === 'unite_owned' ? 'Unite Group listing' : 'Partner exchange'}
          subtitle={d.route === 'unite_owned' ? 'Unite approves terms and signs the contract; you deliver your scope. Commission is earned only when the customer pays.' : 'Released with the buyer’s consent; the introducing partner stays credited. Commission is earned only when the customer pays.'} />
        <View style={{ flexDirection: 'row', gap: 6, padding: 16, flexWrap: 'wrap', backgroundColor: '#fff' }}><Tag tone="navy">{d.code}</Tag><Tag>{sectorName(d.sector)}</Tag></View>
      </Section>
    </ScreenView>
  );
}
