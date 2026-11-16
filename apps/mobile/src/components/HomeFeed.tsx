/** Native Home additions: domain theme banner, Unite apps, members online, ad slot, Invest together, new opportunities, news, video. */
import { Linking, Pressable, ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { sectorName } from '@collabiz/types';
import { Icon, Section, inrShort, s, theme } from './ui';
import { api } from '../api';
import { useApi } from '../hooks';

const THEME_BG: Record<string, [string, string]> = { energy: ['#0b4fa0', '#f59e0b'], build: ['#155e75', '#fb923c'], trade: ['#4c1d95', '#db2777'], industry: ['#44403c', '#ea580c'], advisory: ['#0f766e', '#22d3ee'], collabiz: ['#0B3D91', '#2E7D32'] };
const HUE: Record<string, string> = { solar: '#d97706', power_equipment: '#1E6BFF', ev: '#059669', real_estate: '#7c3aed', infrastructure: '#0e7490', construction_epc: '#0e7490', trading: '#db2777', logistics: '#db2777', manufacturing: '#ea580c', agri_food: '#16a34a', financial_services: '#4338ca' };
interface Feed { theme: string; themeLabel: string; ads: { id: string; title: string; body: string | null; url: string; ctaLabel: string | null; house?: boolean }[]; videos: { id: string; title: string; url: string }[]; news: { id: string; title: string; body: string; publishedAt: string }[] }
const initials = (n: string) => { const w = n.split(/[\s/·-]+/).filter(Boolean); return (w.length > 1 ? w[0][0] + w[1][0] : n.replace(/[^A-Za-z0-9]/g, '').slice(0, 2)).toUpperCase(); };

export function HomeFeed() {
  const router = useRouter();
  const feed = useApi<Feed>('/me/home/feed');
  const apps = useApi<{ id: string; slug: string; name: string; sector: string; open: boolean; myInterest: string | null }[]>('/ventures');
  const online = useApi<{ members: { userId: string; name: string }[] }>('/community/online');
  const offers = useApi<{ id: string; title: string; location: string; unitPrice: number; unitLabel: string; grossYieldPct: number; subscribedPct: number; status: string }[]>('/invest/offers');
  const opps = useApi<{ items: { id: string; title: string; sector: string; city: string | null; estimatedValue: number | null }[] }>('/opportunities', { paged: 'true', limit: '4', sort: 'newest' });
  // Each part renders only when its data has the expected shape, so one failing call never breaks Home.
  const f = feed.data && Array.isArray(feed.data.ads) ? feed.data : undefined;
  const appList = Array.isArray(apps.data) ? apps.data : null;
  const members = Array.isArray(online.data?.members) ? online.data!.members : [];
  const oppList = Array.isArray(opps.data?.items) ? opps.data!.items : [];
  const go = (url: string) => (url.startsWith('/') ? router.push(url as never) : Linking.openURL(url));
  const offer = (Array.isArray(offers.data) ? offers.data : []).find((o) => o.status === 'interest_open');
  const [bg, accent] = THEME_BG[f?.theme ?? 'collabiz'] ?? THEME_BG.collabiz;
  return (
    <>
      {f && <View testID="theme-chip" style={{ alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: bg, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6, marginBottom: theme.space.md }}>
        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: accent }} /><Text style={{ color: '#fff', fontSize: 12.5, fontWeight: '600' }}>{f.themeLabel}</Text></View>}

      {f && f.ads.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingBottom: theme.space.lg }} accessibilityLabel="From Unite">
          {f.ads.map((a) => (
            <Pressable key={a.id} testID={`ad-${a.id}`} accessibilityRole="button" accessibilityLabel={`${a.house ? 'From Unite' : 'Sponsored'}: ${a.title}`}
              onPress={() => { if (!a.house) api.post(`/me/home/content/${a.id}/click`).catch(() => undefined); go(a.url); }}
              style={{ width: 290, minHeight: 150, borderRadius: 22, padding: 18, backgroundColor: bg, justifyContent: 'flex-end', overflow: 'hidden' }}>
              <View style={{ position: 'absolute', right: -40, top: -40, width: 150, height: 150, borderRadius: 75, backgroundColor: accent, opacity: 0.45 }} />
              <Text style={{ color: 'rgba(255,255,255,0.75)', fontSize: 11, fontWeight: '700', letterSpacing: 1 }}>{a.house ? 'FROM UNITE' : 'SPONSORED'}</Text>
              <Text style={{ color: '#fff', fontSize: 18, fontWeight: '700', marginTop: 4 }}>{a.title}</Text>
              {a.body ? <Text style={{ color: 'rgba(255,255,255,0.88)', fontSize: 13, marginTop: 4 }} numberOfLines={2}>{a.body}</Text> : null}
              <Text style={{ color: '#fff', fontWeight: '700', marginTop: 10 }}>{a.ctaLabel ?? 'Learn more'} ›</Text>
            </Pressable>
          ))}
        </ScrollView>
      )}

      {appList && (
        <Section title="Unite apps">
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 14, padding: 14 }}>
            {[...appList].sort((a, b) => Number(b.open) - Number(a.open)).slice(0, 16).map((v) => (
              <Pressable key={v.id} testID={`app-${v.slug}`} onPress={() => router.push(`/ventures/${v.slug}` as never)} accessibilityRole="button" accessibilityLabel={`${v.name}, ${v.open ? 'open' : 'coming soon'}`} style={{ width: 72, alignItems: 'center', gap: 4 }}>
                <View style={{ width: 54, height: 54, borderRadius: 16, backgroundColor: HUE[v.sector] ?? theme.colors.navy700, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: '#fff', fontWeight: '800', fontSize: 17 }}>{initials(v.name)}</Text></View>
                <Text style={{ fontSize: 11.5, fontWeight: '600', color: theme.colors.navy900, textAlign: 'center' }} numberOfLines={2}>{v.name}</Text>
                <Text style={{ fontSize: 10, color: v.open ? theme.colors.green700 : theme.colors.grey500 }}>{v.myInterest === 'approved' ? 'Joined' : v.open ? 'Open' : 'Coming soon'}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </Section>
      )}

      <Pressable testID="online-strip" onPress={() => router.push('/community' as never)} accessibilityRole="button" accessibilityLabel={`${members.length} members online. Open Community`} style={[s.card, { flexDirection: 'row', alignItems: 'center', gap: 10 }]}>
        <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: '#22c55e' }} />
        <Text style={{ flex: 1, fontWeight: '600', color: theme.colors.navy900 }}>{online.data ? `${members.length} member${members.length === 1 ? '' : 's'} online` : 'Members online'}</Text>
        {members.slice(0, 4).map((m) => <View key={m.userId} style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: theme.colors.navy700, alignItems: 'center', justifyContent: 'center', marginLeft: -6, borderWidth: 2, borderColor: '#fff' }}><Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>{initials(m.name)}</Text></View>)}
        <Icon name="chevron-forward" size={17} color={theme.colors.grey300} />
      </Pressable>

      {offer && (
        <Pressable testID="invest-card" onPress={() => router.push('/invest' as never)} accessibilityRole="button" accessibilityLabel={`Invest together: ${offer.title}`} style={[s.card, { backgroundColor: '#f5f3ff', gap: 4 }]}>
          <Text style={{ fontSize: 12, fontWeight: '700', color: '#6d28d9' }}>INVEST TOGETHER · INTEREST ONLY</Text>
          <Text style={{ fontWeight: '700', color: theme.colors.navy900 }}>{offer.title}</Text>
          <Text style={s.hint}>{offer.location} · {inrShort(offer.unitPrice)}/{offer.unitLabel} · projected {offer.grossYieldPct}% a year</Text>
          <View style={{ height: 6, borderRadius: 3, backgroundColor: '#e9e5ff', marginTop: 6 }}><View style={{ height: 6, borderRadius: 3, width: `${offer.subscribedPct}%`, backgroundColor: '#7c3aed' }} /></View>
        </Pressable>
      )}

      {oppList.length > 0 && (
        <Section title="New business opportunities">
          {oppList.map((o) => (
            <Pressable key={o.id} onPress={() => router.push(`/opportunities/${o.id}` as never)} accessibilityRole="button" accessibilityLabel={o.title} style={({ pressed }) => [{ flexDirection: 'row', gap: 10, alignItems: 'center', padding: 14, backgroundColor: '#fff' }, pressed && { backgroundColor: theme.colors.grey50 }]}>
              <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: HUE[o.sector] ?? theme.colors.navy700 }} />
              <View style={{ flex: 1 }}><Text style={{ fontWeight: '600', color: theme.colors.navy900 }} numberOfLines={2}>{o.title}</Text><Text style={s.hint}>{sectorName(o.sector)}{o.city ? ` · ${o.city}` : ''}{o.estimatedValue ? ` · ${inrShort(o.estimatedValue)}` : ''}</Text></View>
              <Icon name="chevron-forward" size={16} color={theme.colors.grey300} />
            </Pressable>
          ))}
        </Section>
      )}

      {f && Array.isArray(f.news) && f.news.length > 0 && (
        <Section title="News from Unite">
          {f.news.slice(0, 3).map((n) => <View key={n.id} style={{ padding: 14, backgroundColor: '#fff', gap: 2 }}><Text style={{ fontWeight: '600', color: theme.colors.navy900 }}>{n.title}</Text><Text style={s.hint} numberOfLines={2}>{n.body}</Text></View>)}
        </Section>
      )}

      {f && Array.isArray(f.videos) && f.videos.length > 0 && (
        <Section title="Watch">
          {f.videos.map((v) => (
            <Pressable key={v.id} onPress={() => { api.post(`/me/home/content/${v.id}/click`).catch(() => undefined); Linking.openURL(v.url); }} accessibilityRole="button" accessibilityLabel={`Play video: ${v.title}`} style={{ flexDirection: 'row', gap: 12, alignItems: 'center', padding: 14, backgroundColor: '#fff' }}>
              <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: theme.colors.navy700, alignItems: 'center', justifyContent: 'center' }}><Icon name="play" color="#fff" /></View>
              <Text style={{ flex: 1, fontWeight: '600', color: theme.colors.navy900 }}>{v.title}</Text>
            </Pressable>
          ))}
        </Section>
      )}
    </>
  );
}
