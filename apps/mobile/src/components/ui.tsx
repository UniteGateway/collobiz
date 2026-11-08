/**
 * Native COLLABIZ components (v2, recovery Phase D) — same tokens as web (packages/ui/src/tokens.ts).
 * iOS-style: large titles, inset grouped lists, hairline separators, 44pt minimum touch targets.
 * Screen IDs are never shown to users; they remain as testIDs only.
 */
import React, { useId } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View, type TextInputProps, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, space, font, toneColors, toneForStatus, humanize, type Tone } from '@collabiz/ui/tokens';
import { SCREENS } from '@collabiz/types';

export const theme = { colors, radius, space, font };
export type IconName = React.ComponentProps<typeof Ionicons>['name'];
const HAIR = StyleSheet.hairlineWidth;

export function Icon({ name, size = 20, color = colors.navy700 }: { name: IconName; size?: number; color?: string }) {
  return <Ionicons name={name} size={size} color={color} accessibilityElementsHidden importantForAccessibility="no" />;
}

/** Page scaffold with an iOS-style large title. `id` is the registry screen ID (test hook only). */
export function ScreenView({ id, title, eyebrow, subtitle, children, scroll = true, footer, right, tab, refreshControl }: { id?: string; title?: string; eyebrow?: string; subtitle?: string; children: React.ReactNode; scroll?: boolean; footer?: React.ReactNode; right?: React.ReactNode; tab?: boolean; refreshControl?: React.ReactElement<any> }) {
  const def = id ? SCREENS.find((x) => x.id === id) : undefined;
  const header = (
    <View style={s.header} testID={id ? `screen-${id}` : undefined}>
      {eyebrow ? <Text style={s.eyebrow}>{eyebrow}</Text> : null}
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 12 }}>
        <Text style={[s.h1, { flex: 1 }]} accessibilityRole="header">{title ?? def?.title}</Text>
        {right}
      </View>
      {subtitle ? <Text style={s.subtitle}>{subtitle}</Text> : null}
    </View>
  );
  return (
    <SafeAreaView style={s.safe} edges={tab ? ['top', 'left', 'right'] : ['bottom', 'left', 'right']}>
      {scroll ? <ScrollView contentContainerStyle={s.body} keyboardShouldPersistTaps="handled" refreshControl={refreshControl}>{header}{children}</ScrollView> : <View style={[s.body, { flex: 1 }]}>{header}{children}</View>}
      {footer && <View style={s.footer}>{footer}</View>}
    </SafeAreaView>
  );
}

export function Button({ title, onPress, variant = 'primary', disabled, loading, testID, icon, compact }: { title: string; onPress?: () => void; variant?: 'primary' | 'accent' | 'secondary' | 'danger' | 'plain'; disabled?: boolean; loading?: boolean; testID?: string; icon?: IconName; compact?: boolean }) {
  const bg = { primary: colors.navy700, accent: colors.green700, secondary: colors.white, danger: colors.danger, plain: 'transparent' }[variant];
  const fg = variant === 'secondary' || variant === 'plain' ? colors.navy700 : colors.white;
  return (
    <Pressable testID={testID} accessibilityRole="button" accessibilityLabel={title} accessibilityState={{ disabled: !!(disabled || loading), busy: !!loading }} disabled={disabled || loading} onPress={onPress}
      style={({ pressed }) => [s.btn, compact && s.btnCompact, { backgroundColor: bg, opacity: disabled ? 0.45 : pressed ? 0.8 : 1, borderColor: variant === 'secondary' ? colors.grey200 : 'transparent' }]}>
      {loading ? <ActivityIndicator color={fg} /> : <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>{icon && <Icon name={icon} size={18} color={fg} />}<Text style={[s.btnText, compact && { fontSize: 15 }, { color: fg }]}>{title}</Text></View>}
    </Pressable>
  );
}

/** Text field. The visible label is programmatically linked to the input (nativeID + accessibilityLabelledBy). */
export function Field({ label, error, hint, ...rest }: TextInputProps & { label: string; error?: string; hint?: string }) {
  const id = `f${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  return (
    <View style={{ marginBottom: space.md }}>
      <Text style={s.label} nativeID={id}>{label}</Text>
      <TextInput accessibilityLabel={label} accessibilityLabelledBy={id} accessibilityHint={error ?? hint} placeholderTextColor={colors.grey500}
        style={[s.input, error ? { borderColor: colors.danger } : null, rest.multiline ? { minHeight: 110, textAlignVertical: 'top', paddingTop: 12 } : null]} {...rest} />
      {hint && !error && <Text style={s.hint}>{hint}</Text>}
      {error && <Text style={s.error} accessibilityLiveRegion="polite">{error}</Text>}
    </View>
  );
}

export function SearchBar({ value, onChangeText, placeholder = 'Search', label = 'Search' }: { value: string; onChangeText: (v: string) => void; placeholder?: string; label?: string }) {
  return (
    <View style={s.search}>
      <Icon name="search" size={17} color={colors.grey600} />
      <TextInput value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor={colors.grey600} accessibilityLabel={label} returnKeyType="search" clearButtonMode="while-editing" style={s.searchInput} />
    </View>
  );
}

export function Segmented({ options, value, onChange, label }: { options: { value: string; label: string }[]; value: string; onChange: (v: string) => void; label: string }) {
  return (
    <View style={s.segment} accessibilityRole="tablist" accessibilityLabel={label}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable key={o.value} onPress={() => onChange(o.value)} accessibilityRole="tab" accessibilityState={{ selected: on }} style={[s.segmentItem, on && s.segmentOn]}>
            <Text numberOfLines={1} style={[s.segmentText, on && { color: colors.navy900, fontWeight: '600' }]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Card({ title, children, style, action }: { title?: string; children?: React.ReactNode; style?: ViewStyle; action?: React.ReactNode }) {
  return (
    <View style={[s.card, style]}>
      {(title || action) && <View style={s.cardHead}>{title ? <Text style={s.h2} accessibilityRole="header">{title}</Text> : <View />}{action}</View>}
      {children}
    </View>
  );
}

/** Inset grouped list section (iOS Settings style). */
export function Section({ title, footer, children }: { title?: string; footer?: string; children: React.ReactNode }) {
  const items = React.Children.toArray(children).filter(Boolean);
  return (
    <View style={{ marginBottom: space.xl }}>
      {title && <Text style={s.sectionTitle} accessibilityRole="header">{title}</Text>}
      <View style={s.group}>
        {items.map((c, i) => <View key={i} style={i > 0 ? s.groupSep : undefined}>{c}</View>)}
      </View>
      {footer && <Text style={s.sectionFooter}>{footer}</Text>}
    </View>
  );
}

export function Kpi({ label, value, accent, hint, icon, onPress }: { label: string; value: string | number; accent?: boolean; hint?: string; icon?: IconName; onPress?: () => void }) {
  return (
    <Pressable onPress={onPress} disabled={!onPress} accessibilityRole={onPress ? 'button' : undefined} accessibilityLabel={`${label}: ${value}${hint ? `, ${hint}` : ''}`} style={({ pressed }) => [s.kpi, pressed && { opacity: 0.85 }]}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={s.kpiLabel}>{label}</Text>
        {icon && <Icon name={icon} size={16} color={colors.grey500} />}
      </View>
      <Text style={[s.kpiValue, accent && { color: colors.green700 }]} adjustsFontSizeToFit numberOfLines={1}>{value}</Text>
      {hint ? <Text style={s.kpiHint} numberOfLines={2}>{hint}</Text> : null}
    </Pressable>
  );
}

export function Badge({ status, tone, label }: { status: string; tone?: Tone; label?: string }) {
  const t = toneColors[tone ?? toneForStatus(status)];
  return <View style={[s.badge, { backgroundColor: t.bg }]}><Text style={{ color: t.fg, fontSize: 12, fontWeight: '600' }}>{label ?? humanize(status)}</Text></View>;
}

export function Tag({ children, tone = 'neutral' }: { children: React.ReactNode; tone?: 'neutral' | 'navy' | 'green' }) {
  const c = { neutral: [colors.grey100, colors.grey700], navy: [colors.navy50, colors.navy700], green: [colors.green100, colors.green800] }[tone];
  return <View style={[s.tag, { backgroundColor: c[0] }]}><Text style={{ color: c[1], fontSize: 12, fontWeight: '600' }}>{children}</Text></View>;
}

export function Notice({ tone = 'info', children, title }: { tone?: 'info' | 'success' | 'warning' | 'danger'; children: React.ReactNode; title?: string }) {
  const t = toneColors[tone];
  const icon: IconName = tone === 'success' ? 'checkmark-circle' : tone === 'danger' ? 'alert-circle' : tone === 'warning' ? 'warning' : 'information-circle';
  return (
    <View style={[s.notice, { backgroundColor: t.bg }]} accessibilityRole={tone === 'danger' ? 'alert' : undefined}>
      <Icon name={icon} size={18} color={t.fg} />
      <View style={{ flex: 1 }}>{title && <Text style={{ color: t.fg, fontWeight: '700', marginBottom: 2 }}>{title}</Text>}<Text style={{ color: t.fg, lineHeight: 20 }}>{children}</Text></View>
    </View>
  );
}

export const Loading = ({ label = 'Loading…' }: { label?: string }) => <View style={s.state} accessibilityLiveRegion="polite"><ActivityIndicator color={colors.navy700} /><Text style={s.hint}>{label}</Text></View>;
export const Empty = ({ title, body, icon = 'file-tray-outline' }: { title: string; body?: string; icon?: IconName }) => (
  <View style={s.state}><View style={s.stateIcon}><Icon name={icon} size={24} color={colors.navy700} /></View><Text style={[s.h2, { textAlign: 'center' }]}>{title}</Text>{body && <Text style={[s.hint, { textAlign: 'center', maxWidth: 300 }]}>{body}</Text>}</View>
);
export const ErrorView = ({ error, onRetry }: { error: unknown; onRetry?: () => void }) => (
  <View style={s.state} accessibilityRole="alert"><View style={[s.stateIcon, { backgroundColor: colors.dangerBg }]}><Icon name="cloud-offline-outline" size={24} color={colors.danger} /></View><Text style={s.h2}>We couldn’t load this</Text><Text style={[s.hint, { textAlign: 'center' }]}>{error instanceof Error ? error.message : String(error)}</Text>{onRetry && <Button title="Try again" variant="secondary" compact onPress={onRetry} />}</View>
);

/** List row. With `icon`, renders an iOS-style tinted icon tile; with `onPress`, a disclosure chevron. */
export function Row({ title, subtitle, right, onPress, testID, icon, iconTint = colors.navy700, chevron }: { title: string; subtitle?: string; right?: React.ReactNode; onPress?: () => void; testID?: string; icon?: IconName; iconTint?: string; chevron?: boolean }) {
  return (
    <Pressable testID={testID} onPress={onPress} disabled={!onPress} accessibilityRole={onPress ? 'button' : undefined} accessibilityLabel={subtitle ? `${title}, ${subtitle}` : title}
      style={({ pressed }) => [s.row, pressed && { backgroundColor: colors.grey50 }]}>
      {icon && <View style={[s.rowIcon, { backgroundColor: `${iconTint}14` }]}><Icon name={icon} size={18} color={iconTint} /></View>}
      <View style={{ flex: 1 }}><Text style={s.rowTitle}>{title}</Text>{subtitle && <Text style={s.rowSub} numberOfLines={2}>{subtitle}</Text>}</View>
      {right}
      {(chevron ?? !!onPress) && <Icon name="chevron-forward" size={17} color={colors.grey300} />}
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
            <Text style={{ color: on ? colors.white : colors.navy900, fontSize: 14, fontWeight: '500' }}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export const money = (minor?: number | null, currency = 'INR') =>
  minor == null ? '—' : new Intl.NumberFormat(currency === 'INR' ? 'en-IN' : 'en-US', { style: 'currency', currency, maximumFractionDigits: 0 }).format(minor / 100);
/** Compact Indian format: ₹80 L, ₹1.2 Cr. */
export const inrShort = (minor?: number | null) => {
  if (minor == null) return null;
  const r = minor / 100;
  if (r >= 1e7) return `₹${(r / 1e7).toFixed(2).replace(/\.?0+$/, '')} Cr`;
  if (r >= 1e5) return `₹${(r / 1e5).toFixed(1).replace(/\.0$/, '')} L`;
  return `₹${Math.round(r).toLocaleString('en-IN')}`;
};

export const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.grey50 },
  body: { padding: space.lg, paddingBottom: space.xxxl },
  header: { marginBottom: space.lg, paddingTop: space.sm },
  eyebrow: { color: colors.green700, fontSize: 13, fontWeight: '600', marginBottom: 4 },
  crumb: { color: colors.grey600, fontSize: 13, fontWeight: '500', marginBottom: 4 },
  h1: { fontSize: 32, lineHeight: 38, fontWeight: '700', color: colors.navy900, letterSpacing: -0.6 },
  subtitle: { color: colors.grey600, fontSize: 15, lineHeight: 21, marginTop: 6 },
  h2: { fontSize: 18, fontWeight: '600', color: colors.navy900, letterSpacing: -0.2 },
  p: { color: colors.grey700, fontSize: 16, lineHeight: 23, marginBottom: space.sm },
  label: { fontWeight: '600', fontSize: 14, color: colors.navy900, marginBottom: 6 },
  hint: { color: colors.grey600, fontSize: 13, lineHeight: 18, marginTop: 2 },
  error: { color: colors.danger, fontSize: 13, marginTop: 4 },
  input: { borderWidth: 1, borderColor: colors.grey200, borderRadius: 12, backgroundColor: colors.white, paddingHorizontal: 14, minHeight: 48, fontSize: 16, color: colors.navy900 },
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.grey100, borderRadius: 12, paddingHorizontal: 12, minHeight: 44, marginBottom: space.md },
  searchInput: { flex: 1, fontSize: 16, color: colors.navy900, paddingVertical: 10 },
  segment: { flexDirection: 'row', backgroundColor: colors.grey100, borderRadius: 10, padding: 3, marginBottom: space.md },
  segmentItem: { flex: 1, minHeight: 34, alignItems: 'center', justifyContent: 'center', borderRadius: 8, paddingHorizontal: 6 },
  segmentOn: { backgroundColor: colors.white, shadowColor: '#011E48', shadowOpacity: 0.08, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  segmentText: { fontSize: 13.5, fontWeight: '500', color: colors.grey700 },
  btn: { minHeight: 50, borderRadius: 14, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space.lg, borderWidth: 1, marginVertical: 6 },
  btnCompact: { minHeight: 44, borderRadius: 12, alignSelf: 'flex-start' },
  btnText: { fontWeight: '600', fontSize: 16.5 },
  card: { backgroundColor: colors.white, borderRadius: 16, padding: space.lg, marginBottom: space.md, borderWidth: HAIR, borderColor: colors.grey200 },
  cardHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: space.md },
  sectionTitle: { fontSize: 13, fontWeight: '600', color: colors.grey600, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 8, marginLeft: 16 },
  sectionFooter: { fontSize: 13, color: colors.grey600, marginTop: 8, marginHorizontal: 16, lineHeight: 18 },
  group: { backgroundColor: colors.white, borderRadius: 14, overflow: 'hidden', borderWidth: HAIR, borderColor: colors.grey200 },
  groupSep: { borderTopWidth: HAIR, borderTopColor: colors.grey200, marginLeft: 16 },
  kpi: { backgroundColor: colors.white, borderRadius: 16, padding: 14, flex: 1, minWidth: 150, borderWidth: HAIR, borderColor: colors.grey200, gap: 2 },
  kpiLabel: { fontSize: 13, fontWeight: '500', color: colors.grey600 },
  kpiValue: { fontSize: 26, fontWeight: '700', color: colors.navy900, letterSpacing: -0.5, marginTop: 4 },
  kpiHint: { fontSize: 12.5, color: colors.grey600 },
  badge: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3, alignSelf: 'flex-start' },
  tag: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2, alignSelf: 'flex-start' },
  notice: { borderRadius: 14, padding: space.md, marginBottom: space.md, flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  state: { alignItems: 'center', padding: space.xxl, gap: 8 },
  stateIcon: { width: 52, height: 52, borderRadius: 16, backgroundColor: colors.navy50, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: space.lg, backgroundColor: colors.white, minHeight: 52 },
  rowIcon: { width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  rowTitle: { fontSize: 16, fontWeight: '500', color: colors.navy900 },
  rowSub: { color: colors.grey600, fontSize: 13.5, marginTop: 2, lineHeight: 18 },
  chip: { borderWidth: 1, borderColor: colors.grey200, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8, backgroundColor: colors.white, minHeight: 38, justifyContent: 'center' },
  footer: { padding: space.lg, backgroundColor: colors.white, borderTopWidth: HAIR, borderTopColor: colors.grey200 },
});
