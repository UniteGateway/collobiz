import { useEffect, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { Button, ErrorView, Icon, Loading, Notice, ScreenView, Section, s, theme } from '@/components/ui';
import { api } from '@/api';
import { useAction, useApi } from '@/hooks';

interface Course { id: string; code: string; title: string; summary: string; passMark: number; modules: { title: string; body: string }[]; completedModules: number[]; assessment: { questions: { q: string; options: string[] }[]; attemptsLeftToday: number }; certificate: { code: string; score: number } | null }
interface Result { score: number; passed: boolean; correct: number; total: number; incorrect: number[]; certificate: { code: string } | null }

/** Screen 117 (native) — course modules and the server-graded assessment. */
export default function CoursePlayer() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const q = useApi<Course>(`/learning/courses/${id}`);
  const [open, setOpen] = useState(0);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [result, setResult] = useState<Result | null>(null);
  const placed = useRef(false);
  useEffect(() => { if (placed.current || !q.data) return; placed.current = true; setOpen(q.data.modules.findIndex((_, i) => !q.data!.completedModules.includes(i))); }, [q.data]);
  const done = useAction(async (i: number) => { await api.post(`/learning/courses/${id}/modules/${i}/complete`); await q.reload(); setOpen(i + 1); });
  const submit = useAction(async () => { const r = await api.post<Result>(`/learning/courses/${id}/assessment`, { answers: q.data!.assessment.questions.map((_, i) => answers[i]) }); setResult(r); await q.reload(); });
  if (q.loading && !q.data) return <Loading />;
  if (q.error) return <ErrorView error={q.error} onRetry={q.reload} />;
  const c = q.data!;
  const allDone = c.completedModules.length >= c.modules.length;
  return (
    <ScreenView id="117" title={c.title} subtitle={c.summary}>
      <Stack.Screen options={{ title: c.code }} />
      {c.certificate && <Notice tone="success" title="You’re certified">Certificate {c.certificate.code} · {c.certificate.score}%</Notice>}
      <Section title="Modules">
        {c.modules.map((m, i) => {
          const isDone = c.completedModules.includes(i);
          return (
            <View key={i} style={{ backgroundColor: '#fff' }}>
              <Pressable onPress={() => setOpen(open === i ? -1 : i)} accessibilityRole="button" accessibilityState={{ expanded: open === i }} testID={`module-${i}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 }}>
                <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: isDone ? theme.colors.green600 : theme.colors.grey100, alignItems: 'center', justifyContent: 'center' }}>{isDone ? <Icon name="checkmark" size={15} color="#fff" /> : <Text style={{ fontWeight: '700', fontSize: 12 }}>{i + 1}</Text>}</View>
                <Text style={[s.rowTitle, { flex: 1, fontWeight: '600' }]}>{m.title}</Text>
                <Icon name={open === i ? 'chevron-down' : 'chevron-forward'} size={17} color={theme.colors.grey300} />
              </Pressable>
              {open === i && <View style={{ paddingHorizontal: 16, paddingBottom: 16 }}><Text style={s.p}>{m.body}</Text>{!isDone && <Button title="Mark as read" compact onPress={() => done.run(i)} loading={done.busy} testID={`read-${i}`} />}</View>}
            </View>
          );
        })}
      </Section>
      <Text style={s.sectionTitle}>Assessment · pass mark {c.passMark}%</Text>
      {!allDone ? <Notice tone="info">Read every module to unlock the assessment.</Notice> : result ? (
        <Notice tone={result.passed ? 'success' : 'warning'} title={`${result.passed ? 'Passed' : 'Not passed yet'} — ${result.score}%`}>{`${result.correct} of ${result.total} correct.${result.certificate ? ` Certificate ${result.certificate.code} issued.` : result.incorrect.length ? ` Review question ${result.incorrect.join(', ')}.` : ''}`}</Notice>
      ) : (
        <View style={{ gap: 14 }}>
          {submit.error && <Notice tone="danger">{submit.error}</Notice>}
          {c.assessment.questions.map((qq, i) => (
            <View key={i} style={[s.card, { marginBottom: 0, gap: 8 }]} accessibilityRole="radiogroup" accessibilityLabel={qq.q}>
              <Text style={{ fontWeight: '600', fontSize: 15.5, color: theme.colors.navy900 }}>{i + 1}. {qq.q}</Text>
              {qq.options.map((o, j) => {
                const on = answers[i] === j;
                return (
                  <Pressable key={j} onPress={() => setAnswers({ ...answers, [i]: j })} accessibilityRole="radio" accessibilityState={{ checked: on }} testID={`q${i}-o${j}`}
                    style={{ flexDirection: 'row', gap: 10, alignItems: 'center', padding: 12, borderRadius: 12, borderWidth: 1, borderColor: on ? theme.colors.navy700 : theme.colors.grey200, backgroundColor: on ? theme.colors.navy50 : '#fff' }}>
                    <Icon name={on ? 'radio-button-on' : 'radio-button-off'} size={18} color={on ? theme.colors.navy700 : theme.colors.grey500} /><Text style={{ flex: 1, fontSize: 15, color: theme.colors.navy900 }}>{o}</Text>
                  </Pressable>
                );
              })}
            </View>
          ))}
          <Button title={`Submit answers · ${c.assessment.attemptsLeftToday} left today`} variant="accent" onPress={() => submit.run()} loading={submit.busy} disabled={Object.keys(answers).length < c.assessment.questions.length || !c.assessment.attemptsLeftToday} testID="submit" />
        </View>
      )}
    </ScreenView>
  );
}
