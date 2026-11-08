import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Button, ErrorView, Field, Icon, Loading, Notice, ScreenView, Section, Segmented, s, theme } from '@/components/ui';
import { api } from '@/api';
import { useAction, useApi } from '@/hooks';

interface Article { id: string; title: string; body: string }
interface Ticket { id: string; code: string; subject: string; status: string; overdue: boolean }

/** Screen 150 — Help, feedback and support requests (native). Account closure is handled on the web for safety. */
export default function Help() {
  const arts = useApi<Article[]>('/help/articles');
  const tickets = useApi<{ tickets: Ticket[] }>('/support/tickets');
  const [open, setOpen] = useState<string | null>(null);
  const [rating, setRating] = useState(0);
  const [req, setReq] = useState({ subject: '', body: '' });
  const [sent, setSent] = useState<string | null>(null);
  const fb = useAction(async () => { await api.post('/feedback', { rating, area: 'mobile' }); setSent('Thanks for your feedback.'); });
  const ticket = useAction(async () => { const t = await api.post<{ code: string }>('/support/tickets', { category: 'other', priority: 'normal', subject: req.subject, body: req.body }); setReq({ subject: '', body: '' }); setSent(`Request ${t.code} sent. We reply within 24 hours.`); await tickets.reload(); });
  if (arts.loading && !arts.data) return <Loading />;
  if (arts.error) return <ErrorView error={arts.error} onRetry={arts.reload} />;
  return (
    <ScreenView id="150" title="Help & support">
      {sent && <Notice tone="success">{sent}</Notice>}
      <Section title="Common questions">
        {(arts.data ?? []).map((a) => (
          <Pressable key={a.id} onPress={() => setOpen(open === a.id ? null : a.id)} accessibilityRole="button" accessibilityState={{ expanded: open === a.id }} style={{ padding: 16, backgroundColor: '#fff', gap: 8 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}><Text style={[s.rowTitle, { flex: 1 }]}>{a.title}</Text><Icon name={open === a.id ? 'chevron-down' : 'chevron-forward'} size={17} color={theme.colors.grey300} /></View>
            {open === a.id && <Text style={s.p}>{a.body}</Text>}
          </Pressable>
        ))}
      </Section>
      {(tickets.data?.tickets ?? []).length > 0 && (
        <Section title="Your requests">
          {tickets.data!.tickets.map((t) => <View key={t.id} style={{ padding: 14, backgroundColor: '#fff' }}><Text style={s.rowTitle}>{t.subject}</Text><Text style={s.rowSub}>{t.code} · {t.status.replace('_', ' ')}{t.overdue ? ' · response overdue' : ''}</Text></View>)}
        </Section>
      )}
      <Text style={s.sectionTitle}>Contact support</Text>
      <View style={s.card}>
        {ticket.error && <Notice tone="danger">{ticket.error}</Notice>}
        <Field label="Subject" value={req.subject} onChangeText={(v) => setReq({ ...req, subject: v })} error={ticket.fieldErrors.subject} />
        <Field label="What happened?" value={req.body} onChangeText={(v) => setReq({ ...req, body: v })} multiline error={ticket.fieldErrors.body} />
        <Button title="Send request" onPress={() => ticket.run()} loading={ticket.busy} disabled={req.subject.trim().length < 5 || req.body.trim().length < 10} testID="send-ticket" />
      </View>
      <Text style={s.sectionTitle}>Rate the app</Text>
      <View style={[s.card, { gap: 10 }]}>
        <Segmented label="Rating" value={String(rating)} onChange={(v) => setRating(Number(v))} options={[1, 2, 3, 4, 5].map((n) => ({ value: String(n), label: '★'.repeat(n) }))} />
        <Button title="Send feedback" variant="secondary" onPress={() => fb.run()} loading={fb.busy} disabled={!rating} />
      </View>
      <Text style={[s.hint, { marginHorizontal: 16 }]}>To close your account, sign in on the web and open Help & feedback.</Text>
    </ScreenView>
  );
}
