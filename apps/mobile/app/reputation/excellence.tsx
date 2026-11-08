import { Text, View } from 'react-native';
import { ErrorView, Icon, Loading, ScreenView, Section, s, theme } from '@/components/ui';
import { useApi } from '@/hooks';

interface Ex { levelName: string; nextName: string | null; criteria: { key: string; label: string; met: boolean; detail: string; progress?: number }[]; ready: boolean; note: string }

/** Screen 165 (native) — progress towards the next membership level. */
export default function Excellence() {
  const q = useApi<Ex>('/reputation/excellence');
  if (q.loading && !q.data) return <Loading />;
  if (q.error) return <ErrorView error={q.error} onRetry={q.reload} />;
  const d = q.data!;
  return (
    <ScreenView id="165" title="Next level" subtitle={`You are a ${d.levelName}.`}>
      {d.nextName ? (
        <Section title={d.ready ? `Ready for ${d.nextName}` : `What ${d.nextName} needs`} footer={d.note}>
          {d.criteria.map((c) => (
            <View key={c.key} style={{ flexDirection: 'row', gap: 12, padding: 14, backgroundColor: '#fff', alignItems: 'center' }} accessible accessibilityLabel={`${c.label}: ${c.met ? 'met' : 'not yet'}. ${c.detail}`}>
              <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: c.met ? theme.colors.green100 : theme.colors.grey100, alignItems: 'center', justifyContent: 'center' }}><Icon name={c.met ? 'checkmark' : 'time-outline'} size={16} color={c.met ? theme.colors.green800 : theme.colors.grey600} /></View>
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={[s.rowTitle, { fontWeight: '600' }]}>{c.label}</Text>
                <Text style={s.rowSub}>{c.detail}</Text>
                {c.progress != null && <View style={{ height: 5, borderRadius: 3, backgroundColor: theme.colors.grey100, overflow: 'hidden' }}><View style={{ width: `${Math.round(c.progress * 100)}%`, height: '100%', backgroundColor: c.met ? theme.colors.green600 : theme.colors.navy700 }} /></View>}
              </View>
            </View>
          ))}
        </Section>
      ) : <Text style={s.p}>You’re at the highest level.</Text>}
    </ScreenView>
  );
}
