import { useState } from 'react';
import { Pressable, RefreshControl, Text, View } from 'react-native';
import { Redirect, useRouter } from 'expo-router';
import { sectorName } from '@collabiz/types';
import { Button, Card, Empty, ErrorView, Icon, Kpi, Loading, Notice, Row, ScreenView, Section, Tag, inrShort, s, theme, type IconName } from '@/components/ui';
import { useApi } from '@/hooks';
import { useSession } from '@/session';

interface Home {
  figures: Record<string, number>;
  actions: { kind: string; title: string; detail: string; href: string; due?: string | null; tone: 'urgent' | 'normal' }[];
  recommendations: { id: string; title: string; sector: string; city: string | null; value: number | null; score: number | null; reasons: string[] }[];
  activity: { id: string; text: string; actor: string | null; at: string }[];
}

const ACTION_ICON: Record<string, IconName> = { team: 'people', contract: 'document-text', milestone: 'flag', invoice: 'receipt', certify: 'checkmark-done', payout: 'wallet', task: 'calendar', order: 'cube', claim: 'alert-circle', tender: 'hammer' };
/** Web routes from /me/home mapped to native screens; anything without a native screen opens the closest native area. */
const nativeHref = (href: string) => {
  if (href.startsWith('/collaboration')) return '/collaboration';
  if (href.startsWith('/projects/')) return `/projects/${href.split('/')[2]}/progress`;
  if (href.startsWith('/payouts') || href.startsWith('/earnings')) return '/earnings';
  if (href.startsWith('/tasks')) return '/activity';
  if (href.startsWith('/trading')) return '/trading/enquiry';
  return '/activity';
};
const due = (d?: string | null) => {
  if (!d) return null;
  const days = Math.round((new Date(d).getTime() - Date.now()) / 86400_000);
  return days < 0 ? `${-days}d overdue` : days === 0 ? 'Today' : days === 1 ? 'Tomorrow' : `In ${days}d`;
};
const greeting = () => { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'; };

/** Screen 023 — Partner Home (native): what needs you today, how the business is doing, what to pursue next. */
export default function Home() {
  const { me, loading, refresh } = useSession();
  const router = useRouter();
  const org = me?.activeOrg;
  const q = useApi<Home>(org ? '/me/home' : null);
  const [refreshing, setRefreshing] = useState(false);
  if (loading) return <Loading />;
  if (!me) return <Redirect href="/" />;
  const d = q.data;
  const f = d?.figures ?? {};
  const onRefresh = async () => { setRefreshing(true); await refresh(); await q.reload(); setRefreshing(false); };

  return (
    <ScreenView id="023" tab eyebrow={new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })} title={`${greeting()}, ${me.fullName.split(' ')[0]}`}
      subtitle={org ? `${org.name}${org.verificationStatus === 'verified' ? ' · Verified partner' : ''}` : undefined}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
      {!me.emailVerified && <Notice tone="warning" title="Verify your email">Some actions stay locked until your email is verified.</Notice>}
      {!me.emailVerified && <Button title="Verify email" variant="secondary" compact onPress={() => router.push('/verify')} />}
      {!org ? (
        <Card><Empty icon="business-outline" title="Set up your partner account" body="Create your company profile to discover opportunities and register protected leads." /><Button title="Get started" variant="accent" onPress={() => router.push('/onboarding/account-type')} /></Card>
      ) : (
        <>
          {org.verificationStatus !== 'verified' && <Notice tone="info" title="Finish verification">Applying and registering leads unlock once your company is verified.</Notice>}
          {q.error ? <ErrorView error={q.error} onRetry={q.reload} /> : !d ? <Loading label="Checking your workspace…" /> : (
            <>
              {/* Needs your attention */}
              <Section title="Needs your attention" footer={d.actions.length ? undefined : 'Invitations, signatures, certifications and payouts will appear here.'}>
                {d.actions.length ? d.actions.map((a, i) => (
                  <Row key={i} testID={`action-${i}`} icon={ACTION_ICON[a.kind] ?? 'ellipse'} iconTint={a.tone === 'urgent' ? theme.colors.warning : theme.colors.navy700} title={a.title} subtitle={a.detail}
                    right={a.due ? <Text style={{ fontSize: 12.5, fontWeight: '600', color: due(a.due)!.includes('overdue') ? theme.colors.danger : theme.colors.grey600 }}>{due(a.due)}</Text> : undefined}
                    onPress={() => router.push(nativeHref(a.href) as never)} />
                )) : <Row icon="checkmark-circle" iconTint={theme.colors.green700} title="You’re all caught up" />}
              </Section>

              {/* Earnings */}
              <Pressable onPress={() => router.push('/earnings')} accessibilityRole="button" accessibilityLabel={`Earnings: ${inrShort(f.earnedUnpaid)} earned and awaiting payment`} style={({ pressed }) => [s.card, { padding: 18 }, pressed && { opacity: 0.9 }]}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text style={s.h2}>Earnings</Text><Icon name="chevron-forward" size={17} color={theme.colors.grey300} />
                </View>
                <Text style={{ fontSize: 34, fontWeight: '700', color: theme.colors.navy900, letterSpacing: -0.8, marginTop: 8 }}>{inrShort(f.earnedUnpaid ?? 0)}</Text>
                <Text style={s.hint}>Earned and awaiting payment · {inrShort(f.projected ?? 0)} projected</Text>
              </Pressable>

              {/* Figures */}
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: theme.space.xl }}>
                <Kpi label="Open pipeline" value={inrShort(f.pipelineValue ?? 0)!} hint={`${f.openDeals ?? 0} open deals`} icon="bar-chart-outline" onPress={() => router.push('/pipeline')} />
                <Kpi label="Active leads" value={f.activeLeads ?? 0} hint={`${f.protectedLeads ?? 0} protected`} icon="shield-checkmark-outline" onPress={() => router.push('/leads')} />
                <Kpi label="Projects" value={f.activeProjects ?? 0} hint="Active" icon="folder-open-outline" onPress={() => router.push('/projects')} />
                <Kpi label="Applications" value={f.openApplications ?? 0} hint="Submitted or shortlisted" icon="paper-plane-outline" onPress={() => router.push('/marketplace')} />
              </View>

              {/* Recommendations */}
              <Section title="Recommended for you" footer="Matched to your sectors, coverage and capacity.">
                {d.recommendations.length ? d.recommendations.map((r) => (
                  <Pressable key={r.id} testID={`rec-${r.id}`} onPress={() => router.push(`/opportunities/${r.id}`)} accessibilityRole="button" accessibilityLabel={`${r.title}${r.score != null ? `, ${r.score}% match` : ''}`}
                    style={({ pressed }) => [{ flexDirection: 'row', gap: 12, padding: 16, backgroundColor: '#fff' }, pressed && { backgroundColor: theme.colors.grey50 }]}>
                    {r.score != null && <View style={{ width: 48, height: 48, borderRadius: 12, backgroundColor: theme.colors.green100, alignItems: 'center', justifyContent: 'center' }}><Text style={{ fontSize: 17, fontWeight: '700', color: theme.colors.green800 }}>{r.score}</Text><Text style={{ fontSize: 9, fontWeight: '700', color: theme.colors.green800, letterSpacing: 0.5 }}>MATCH</Text></View>}
                    <View style={{ flex: 1, gap: 4 }}>
                      <Text style={[s.rowTitle, { fontWeight: '600' }]} numberOfLines={2}>{r.title}</Text>
                      <Text style={s.rowSub}>{sectorName(r.sector)}{r.city ? ` · ${r.city}` : ''}{r.value ? ` · ${inrShort(r.value)}` : ''}</Text>
                      {r.reasons.length > 0 && <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginTop: 2 }}>{r.reasons.map((x) => <Tag key={x}>{x}</Tag>)}</View>}
                    </View>
                  </Pressable>
                )) : <Row icon="search" title="No matches yet" subtitle="Add sectors and coverage to your profile." onPress={() => router.push('/profile')} />}
              </Section>

              {/* Activity */}
              {d.activity.length > 0 && (
                <Section title="Recent activity">
                  {d.activity.map((a) => <Row key={a.id} title={a.text} subtitle={`${a.actor ? `${a.actor} · ` : ''}${new Date(a.at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`} />)}
                </Section>
              )}
            </>
          )}
        </>
      )}
    </ScreenView>
  );
}
