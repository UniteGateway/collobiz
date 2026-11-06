/** Native COLLABIZ components — same tokens as web (packages/ui/src/tokens.ts). Min touch target 44pt. */
import React from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View, type TextInputProps, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, radius, space, font, toneColors, toneForStatus, humanize, type Tone } from '@collabiz/ui/tokens';
import { SCREENS, SCREEN_FAMILIES } from '@collabiz/types';

export const theme = { colors, radius, space, font };

export function ScreenView({ id, title, children, scroll = true, footer }: { id?: string; title?: string; children: React.ReactNode; scroll?: boolean; footer?: React.ReactNode }) {
  const def = id ? SCREENS.find((s) => s.id === id) : undefined;
  const fam = def ? SCREEN_FAMILIES[def.family - 1]?.name : undefined;
  const header = (
    <View style={s.header} testID={id ? `screen-${id}` : undefined}>
      {def && <Text style={s.crumb}>{fam} · SCREEN {def.id}</Text>}
      <Text style={s.h1} accessibilityRole="header">{title ?? def?.title}</Text>
    </View>
  );
  return (
    <SafeAreaView style={s.safe} edges={['bottom', 'left', 'right']}>
      {scroll ? <ScrollView contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">{header}{children}</ScrollView> : <View style={[s.body, { flex: 1 }]}>{header}{children}</View>}
      {footer && <View style={s.footer}>{footer}</View>}
    </SafeAreaView>
  );
}

export function Button({ title, onPress, variant = 'primary', disabled, loading, testID }: { title: string; onPress?: () => void; variant?: 'primary' | 'accent' | 'secondary' | 'danger'; disabled?: boolean; loading?: boolean; testID?: string }) {
  const bg = { primary: colors.navy700, accent: colors.green700, secondary: colors.white, danger: colors.danger }[variant];
  const fg = variant === 'secondary' ? colors.navy700 : colors.white;
  return (
    <Pressable testID={testID} accessibilityRole="button" accessibilityState={{ disabled: !!(disabled || loading), busy: !!loading }} disabled={disabled || loading} onPress={onPress}
      style={({ pressed }) => [s.btn, { backgroundColor: bg, opacity: disabled ? 0.5 : pressed ? 0.85 : 1, borderColor: variant === 'secondary' ? colors.grey300 : bg }]}>
      {loading ? <ActivityIndicator color={fg} /> : <Text style={[s.btnText, { color: fg }]}>{title}</Text>}
    </Pressable>
  );
}

export function Field({ label, error, hint, ...rest }: TextInputProps & { label: string; error?: string; hint?: string }) {
  return (
    <View style={{ marginBottom: space.md }}>
      <Text style={s.label}>{label}</Text>
      <TextInput accessibilityLabel={label} placeholderTextColor={colors.grey500} style={[s.input, error ? { borderColor: colors.danger } : null, rest.multiline ? { minHeight: 100, textAlignVertical: 'top' } : null]} {...rest} />
      {hint && !error && <Text style={s.hint}>{hint}</Text>}
      {error && <Text style={s.error} accessibilityLiveRegion="polite">{error}</Text>}
    </View>
  );
}

export function Card({ title, children, style }: { title?: string; children?: React.ReactNode; style?: ViewStyle }) {
  return <View style={[s.card, style]}>{title && <Text style={s.h2}>{title}</Text>}{children}</View>;
}

export function Kpi({ label, value, accent }: { label: string; value: string | number; accent?: boolean }) {
  return <View style={s.kpi}><Text style={[s.kpiValue, accent && { color: colors.green700 }]}>{value}</Text><Text style={s.hint}>{label}</Text></View>;
}

export function Badge({ status, tone, label }: { status: string; tone?: Tone; label?: string }) {
  const t = toneColors[tone ?? toneForStatus(status)];
  return <View style={[s.badge, { backgroundColor: t.bg }]}><Text style={{ color: t.fg, fontSize: 12, fontWeight: '600' }}>{label ?? humanize(status)}</Text></View>;
}

export function Notice({ tone = 'info', children }: { tone?: 'info' | 'success' | 'warning' | 'danger'; children: React.ReactNode }) {
  const t = toneColors[tone];
  return <View style={[s.notice, { backgroundColor: t.bg }]} accessibilityRole={tone === 'danger' ? 'alert' : undefined}><Text style={{ color: t.fg }}>{children}</Text></View>;
}

export const Loading = ({ label = 'Loading…' }: { label?: string }) => <View style={s.state}><ActivityIndicator color={colors.green500} /><Text style={s.hint}>{label}</Text></View>;
export const Empty = ({ title, body }: { title: string; body?: string }) => <View style={s.state}><Text style={s.h2}>{title}</Text>{body && <Text style={s.hint}>{body}</Text>}</View>;
export const ErrorView = ({ error, onRetry }: { error: unknown; onRetry?: () => void }) => (
  <View style={s.state} accessibilityRole="alert"><Text style={s.h2}>We couldn’t load this</Text><Text style={s.hint}>{error instanceof Error ? error.message : String(error)}</Text>{onRetry && <Button title="Try again" variant="secondary" onPress={onRetry} />}</View>
);

export function Row({ title, subtitle, right, onPress, testID }: { title: string; subtitle?: string; right?: React.ReactNode; onPress?: () => void; testID?: string }) {
  return (
    <Pressable testID={testID} onPress={onPress} disabled={!onPress} accessibilityRole={onPress ? 'button' : undefined} style={({ pressed }) => [s.row, pressed && { backgroundColor: colors.navy50 }]}>
      <View style={{ flex: 1 }}><Text style={s.rowTitle}>{title}</Text>{subtitle && <Text style={s.hint}>{subtitle}</Text>}</View>
      {right}
    </Pressable>
  );
}

export function Chips({ options, value, onChange }: { options: { value: string; label: string }[]; value: string[]; onChange: (v: string[]) => void }) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: space.md }}>
      {options.map((o) => {
        const on = value.includes(o.value);
        return (
          <Pressable key={o.value} accessibilityRole="checkbox" accessibilityState={{ checked: on }} onPress={() => onChange(on ? value.filter((v) => v !== o.value) : [...value, o.value])}
            style={[s.chip, on && { backgroundColor: colors.navy700, borderColor: colors.navy700 }]}>
            <Text style={{ color: on ? colors.white : colors.navy900, fontSize: 13 }}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export const money = (minor?: number | null, currency = 'INR') =>
  minor == null ? '—' : new Intl.NumberFormat(currency === 'INR' ? 'en-IN' : 'en-US', { style: 'currency', currency, maximumFractionDigits: 0 }).format(minor / 100);

export const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.navy50 },
  body: { padding: space.lg, paddingBottom: space.xxxl },
  header: { marginBottom: space.lg },
  crumb: { color: colors.grey600, fontSize: 11, letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 4 },
  h1: { fontSize: 24, fontWeight: '700', color: colors.navy900 },
  h2: { fontSize: 17, fontWeight: '600', color: colors.navy900, marginBottom: space.sm },
  p: { color: colors.navy900, fontSize: 15, lineHeight: 22, marginBottom: space.sm },
  label: { fontWeight: '600', color: colors.navy900, marginBottom: 6 },
  hint: { color: colors.grey600, fontSize: 13, marginTop: 2 },
  error: { color: colors.danger, fontSize: 13, marginTop: 4 },
  input: { borderWidth: 1, borderColor: colors.grey300, borderRadius: radius.sm, backgroundColor: colors.white, paddingHorizontal: 12, minHeight: 46, fontSize: 16, color: colors.navy900 },
  btn: { minHeight: 48, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space.lg, borderWidth: 1, marginVertical: 6 },
  btnText: { fontWeight: '700', fontSize: 16 },
  card: { backgroundColor: colors.white, borderRadius: radius.lg, padding: space.lg, marginBottom: space.md, borderWidth: 1, borderColor: colors.grey100 },
  kpi: { backgroundColor: colors.white, borderRadius: radius.md, padding: space.md, flex: 1, minWidth: 140, borderWidth: 1, borderColor: colors.grey100 },
  kpiValue: { fontSize: 22, fontWeight: '700', color: colors.navy700 },
  badge: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3, alignSelf: 'flex-start' },
  notice: { borderRadius: radius.md, padding: space.md, marginBottom: space.md },
  state: { alignItems: 'center', padding: space.xxl, gap: 8 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: space.md, backgroundColor: colors.white, borderBottomWidth: 1, borderBottomColor: colors.grey100, minHeight: 56 },
  rowTitle: { fontSize: 15, fontWeight: '600', color: colors.navy900 },
  chip: { borderWidth: 1, borderColor: colors.grey300, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: colors.white, minHeight: 36 },
  footer: { padding: space.lg, backgroundColor: colors.white, borderTopWidth: 1, borderTopColor: colors.grey100 },
});
