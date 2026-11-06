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
  green500: '#55A444', // mark (green stroke) / leaf
  green100: '#E7F4E3',
  grey700: '#3D4451',
  grey500: '#7A7A7B', // tagline
  grey300: '#CBD2DC',
  grey100: '#EEF1F5',
  white: '#FFFFFF',
  danger: '#B42318',
  dangerBg: '#FDECEA',
  warning: '#B54708',
  warningBg: '#FEF4E6',
  info: '#175CD3',
  infoBg: '#EAF2FF',
} as const;

export const semantic = {
  bg: colors.navy50,
  surface: colors.white,
  text: colors.navy900,
  textMuted: colors.grey500,
  primary: colors.navy700,
  primaryText: colors.white,
  accent: colors.green500,
  border: colors.grey300,
  focus: colors.green500,
} as const;

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48 } as const;
export const radius = { sm: 6, md: 10, lg: 16, pill: 999 } as const;
export const font = {
  family: "'Inter', 'Segoe UI', system-ui, -apple-system, Roboto, sans-serif",
  size: { xs: 12, sm: 14, md: 16, lg: 20, xl: 24, xxl: 32, display: 44 },
  weight: { regular: '400', medium: '500', semibold: '600', bold: '700' },
} as const;
/** Responsive breakpoints from the Master Book §5 UI standard (1440/1024/768 web, 390/360 mobile). */
export const breakpoints = { mobileS: 360, mobile: 390, tablet: 768, laptop: 1024, desktop: 1440 } as const;

export type Tone = 'neutral' | 'info' | 'success' | 'warning' | 'danger' | 'brand';
export const toneColors: Record<Tone, { fg: string; bg: string }> = {
  neutral: { fg: colors.grey700, bg: colors.grey100 },
  info: { fg: colors.info, bg: colors.infoBg },
  success: { fg: colors.green600, bg: colors.green100 },
  warning: { fg: colors.warning, bg: colors.warningBg },
  danger: { fg: colors.danger, bg: colors.dangerBg },
  brand: { fg: colors.navy700, bg: colors.navy100 },
};

/** Maps any workflow state used across the platform to a visual tone. */
export function toneForStatus(status: string): Tone {
  const s = status.toLowerCase();
  if (/(verified|approved|settled|paid|awarded|active|accepted|protected|upheld|certified|executed|delivered|completed|closed_won|won|published|resolved|nda_signed|signed|qualified)/.test(s)) return 'success';
  if (/(reject|disput|breach|lost|revoked|cancel|reversed|disqualif|not_awarded|expired|terminated|failed|declined)/.test(s)) return 'danger';
  if (/(pending|review|submitted|hold|reupload|contested|escalat|invited|draft|negotiat|appeal|paused|due)/.test(s)) return 'warning';
  if (/(estimated|eligible|earned|invoiced|in_progress|progress|open|planning|shipped|issued|released)/.test(s)) return 'info';
  return 'neutral';
}
export const humanize = (s: string) => s.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
