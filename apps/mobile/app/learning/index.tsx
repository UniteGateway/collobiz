import { Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Empty, ErrorView, Icon, Loading, ScreenView, Tag, s, theme } from '@/components/ui';
import { useApi } from '@/hooks';

interface Course { id: string; code: string; title: string; summary: string; level: string; minutes: number; modules: number; completedModules: number; certificate: { code: string; expiresAt: string } | null }

/** Screen 116 — Training & learning centre (native). */
export default function Learning() {
  const router = useRouter();
  const q = useApi<Course[]>('/learning/courses');
  if (q.loading && !q.data) return <Loading />;
  if (q.error) return <ErrorView error={q.error} onRetry={q.reload} />;
  return (
    <ScreenView id="116" title="Learning" subtitle="Short courses that count towards your next membership level.">
      {!q.data?.length ? <Empty icon="school-outline" title="No courses yet" /> : q.data.map((c) => {
        const pct = c.modules ? Math.round((c.completedModules / c.modules) * 100) : 0;
        return (
          <Pressable key={c.id} testID={`course-${c.code}`} onPress={() => router.push(`/learning/${c.id}`)} accessibilityRole="button" accessibilityLabel={`${c.title}. ${c.certificate ? 'Certified' : pct ? `${pct}% complete` : 'Not started'}`} style={({ pressed }) => [s.card, { gap: 6 }, pressed && { opacity: 0.9 }]}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}><Tag tone="navy">{c.level.charAt(0).toUpperCase() + c.level.slice(1)}</Tag><Text style={[s.hint, { marginTop: 0 }]}>{c.minutes} min · {c.modules} modules</Text></View>
            <Text style={{ fontSize: 17, fontWeight: '600', color: theme.colors.navy900 }}>{c.title}</Text>
            <Text style={s.rowSub} numberOfLines={2}>{c.summary}</Text>
            {c.certificate ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}><Icon name="ribbon" size={16} color={theme.colors.green700} /><Text style={{ color: theme.colors.green800, fontWeight: '600', fontSize: 13 }}>Certified · {c.certificate.code}</Text></View> : (
              <View style={{ marginTop: 4 }}><View style={{ height: 6, borderRadius: 3, backgroundColor: theme.colors.grey100, overflow: 'hidden' }}><View style={{ width: `${pct}%`, height: '100%', backgroundColor: theme.colors.navy700 }} /></View><Text style={s.hint}>{pct ? `${pct}% complete` : 'Not started'}</Text></View>
            )}
          </Pressable>
        );
      })}
    </ScreenView>
  );
}
