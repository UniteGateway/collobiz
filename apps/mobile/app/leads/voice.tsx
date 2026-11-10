import { useState } from 'react';
import { Text, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { extractLead, sectorName, type VoiceExtract } from '@collabiz/types';
import { Button, Card, Field, Notice, ScreenView, s } from '@/components/ui';

const rupees = (p: number) => `₹${Math.round(p / 100).toLocaleString('en-IN')}`;

/** Screen 174 (native) — describe a lead by voice. The phone keyboard's microphone dictates into the box (on the device). */
export default function VoiceLead() {
  const router = useRouter();
  const [text, setText] = useState('');
  const [x, setX] = useState<VoiceExtract | null>(null);
  const rows: [string, string | null][] = x ? [['Customer', x.customer], ['City', x.city], ['Sector', x.sector ? sectorName(x.sector) : null], ['Product or project', x.productOrProject], ['Value', x.estimatedValue != null ? rupees(x.estimatedValue) : null], ['Expected decision', x.expectedCloseDate]] : [];
  const use = () => {
    if (!x) return;
    const p: Record<string, string> = { requirements: text.slice(0, 2000) };
    if (x.customer) p.legalName = x.customer;
    if (x.city) p.city = x.city;
    if (x.sector) p.sector = x.sector;
    if (x.productOrProject) p.product = x.productOrProject;
    if (x.estimatedValue != null) p.value = String(Math.round(x.estimatedValue / 100));
    router.push({ pathname: '/leads/new', params: p } as never);
  };
  return (
    <ScreenView id="174" title="Describe a lead by voice" subtitle="Tap the microphone on your keyboard and speak — English, Hindi or Telugu. You check every field before registering.">
      <Stack.Screen options={{ title: 'Voice lead' }} />
      <Card>
        <Field label="What the customer needs" value={text} onChangeText={setText} multiline testID="voice-text" hint="e.g. Customer is Shree Ganesh Engineering Pvt Ltd in Pune, 500 kW rooftop solar, budget 2.4 crore" />
        <Button title="Read the details" onPress={() => setX(extractLead(text))} disabled={text.trim().length < 10} testID="voice-read" />
      </Card>
      {x && (
        <Card title="What COLLABIZ understood">
          {rows.map(([k, v]) => <View key={k} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 }}><Text style={s.hint}>{k}</Text><Text style={s.p} testID={`voice-${k}`}>{v ?? 'Not heard'}</Text></View>)}
          {x.missing.length > 0 && <Notice tone="warning" title="Still needed">{x.missing.map((m) => m.question).join('\n')}</Notice>}
          <Button title="Use these details" onPress={use} testID="voice-use" />
        </Card>
      )}
    </ScreenView>
  );
}
