/**
 * COLLABIZ design tokens — sampled from the approved logo (navy wordmark, navy/green mark, grey tagline).
 * Single source for web CSS variables (styles.css) and React Native styles (apps/mobile). Parity is tested.
 */
export const colors = {
  navy900: '#011E48', // wordmark
  navy700: '#03325D', // mark (blue stroke)
  navy500: '#1D4E89',
  navy100: '#E6EDF6',
  navy50: '#F3F6FB',
  green600: '#3F8A31',
  green700: '#2E7D32', // accessible action green: 5.1:1 with white (WCAG AA)
  green800: '#2F6F25', // success text on green100: 5.4:1
  green500: '#55A444', // mark (green stroke) / leaf
  green100: '#E7F4E3',
  grey700: '#3D4451',
  grey600: '#5E6573', // muted body text: 5.9:1 on white (WCAG AA)
  grey500: '#7A7A7B', // tagline (brand/decorative only — fails AA for body text)
  grey300: '#CBD2DC',
  grey200: '#E3E7EE', // hairline borders
  grey100: '#EEF1F5',
  grey50: '#F7F8FA', // quiet surface (sidebar, table header, inset panels)
  white: '#FFFFFF',
  danger: '#B42318',
  dangerBg: '#FDECEA',
  warning: '#B54708',
  warningBg: '#FEF4E6',
  info: '#175CD3',
  infoBg: '#EAF2FF',
} as const;

export const semantic = {
  bg: colors.white,
  surface: colors.white,
  text: colors.navy900,
  textMuted: colors.grey600,
  primary: colors.navy700,
  primaryText: colors.white,
  accent: colors.green500,
  border: colors.grey200,
  focus: colors.green500,
} as const;

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48 } as const;
export const radius = { sm: 6, md: 10, lg: 16, pill: 999 } as const;
export const font = {
  family: "'Inter', -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', Roboto, sans-serif",
  size: { xs: 12, sm: 14, md: 16, lg: 20, xl: 24, xxl: 32, display: 52 },
  weight: { regular: '400', medium: '500', semibold: '600', bold: '700' },
} as const;
/** Responsive breakpoints from the Master Book §5 UI standard (1440/1024/768 web, 390/360 mobile). */
export const breakpoints = { mobileS: 360, mobile: 390, tablet: 768, laptop: 1024, desktop: 1440 } as const;

export type Tone = 'neutral' | 'info' | 'success' | 'warning' | 'danger' | 'brand';
export const toneColors: Record<Tone, { fg: string; bg: string }> = {
  neutral: { fg: colors.grey700, bg: colors.grey100 },
  info: { fg: colors.info, bg: colors.infoBg },
  success: { fg: colors.green800, bg: colors.green100 },
  warning: { fg: colors.warning, bg: colors.warningBg },
  danger: { fg: colors.danger, bg: colors.dangerBg },
  brand: { fg: colors.navy700, bg: colors.navy100 },
};

/** Maps any workflow state used across the platform to a visual tone. */
export function toneForStatus(status: string): Tone {
  const s = status.toLowerCase();
  // Negative and negated states are evaluated FIRST: "disqualified", "not_awarded", "unverified" and "inactive"
  // contain positive words and must never render as success.
  if (/(^|_|\b)(not|un|in)(_)?(verified|awarded|active|qualified|approved|paid)|disqualif|reject|disput|breach|lost|revoked|cancel|reversed|expired|terminated|failed|declined|overdue|suspend/.test(s)) return 'danger';
  if (/(pending|review|submitted|hold|reupload|contested|escalat|invited|draft|negotiat|appeal|paused|due)/.test(s)) return 'warning';
  if (/(verified|approved|settled|paid|awarded|active|accepted|protected|upheld|certified|executed|delivered|completed|closed_won|won|published|resolved|nda_signed|signed|qualified)/.test(s)) return 'success';
  if (/(estimated|eligible|earned|invoiced|in_progress|progress|open|planning|shipped|issued|released)/.test(s)) return 'info';
  return 'neutral';
}
export const humanize = (s: string) => s.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
