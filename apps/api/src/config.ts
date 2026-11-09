/** Typed, validated runtime configuration. Defaults are development-only; production refuses dev secrets. */
import { z } from 'zod';

const bool = z.preprocess((v) => v === true || v === 'true' || v === '1', z.boolean());

const Env = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().default(4000),
  DATABASE_URL: z.string().default('postgres://postgres:postgres@localhost:5432/collabiz'),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  JWT_ACCESS_SECRET: z.string().min(16).default('dev-access-secret-change-me'),
  JWT_REFRESH_SECRET: z.string().min(16).default('dev-refresh-secret-change-me'),
  FIELD_ENCRYPTION_KEY: z.string().regex(/^[0-9a-f]{64}$/i).default('0'.repeat(64)),
  DOWNLOAD_URL_SECRET: z.string().min(16).default('dev-download-secret-change-me'),
  CORS_ORIGINS: z.string().default('http://localhost:3000,http://localhost:3001,http://localhost:8081'),
  STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
  STORAGE_LOCAL_DIR: z.string().default('./storage'),
  MAIL_DRIVER: z.enum(['outbox', 'smtp']).default('outbox'),
  /** smtp(s)://user:pass@host:port — any provider (Zoho, Google Workspace, Amazon SES, SendGrid, Brevo…). Required when MAIL_DRIVER=smtp. */
  SMTP_URL: z.string().optional(),
  /** Sender shown on e-mails, e.g. "COLLABIZ <no-reply@your-domain>". Must be a domain the SMTP provider has verified. */
  MAIL_FROM: z.string().default('COLLABIZ <no-reply@localhost>'),
  /** Public address of the partner web app; used to build absolute links in e-mails. */
  WEB_BASE_URL: z.string().url().default('http://localhost:3000'),
  IDENTITY_PROVIDER: z.enum(['local', 'oidc']).default('local'),
  AI_PROVIDER: z.enum(['rules', 'anthropic']).default('rules'),
  /** Growth Desk outreach sending. Off until a separate marketing e-mail domain/service is configured; approved drafts wait. */
  GROWTH_SENDING_ENABLED: bool.default(false),
  /** ERPNext (HR, payroll, accounting — Phases B and C). Base URL of the site, and token auth for a dedicated integration user. */
  ERPNEXT_URL: z.string().url().optional(),
  ERPNEXT_API_KEY: z.string().optional(),
  ERPNEXT_API_SECRET: z.string().optional(),
  /** Accounts chosen by the CA for posting partner commission to ERPNext (Finance). */
  ERPNEXT_COMMISSION_EXPENSE_ACCOUNT: z.string().optional(),
  ERPNEXT_COMMISSION_PAYABLE_ACCOUNT: z.string().optional(),
  ERPNEXT_TDS_PAYABLE_ACCOUNT: z.string().optional(),
  ERPNEXT_GST_INPUT_ACCOUNT: z.string().optional(),
  /** ERPNext item group for products sent from the COLLABIZ catalogue (default "Products", which ERPNext creates). */
  ERPNEXT_ITEM_GROUP: z.string().optional(),
  ESIGN_PROVIDER: z.string().default('local'),
  /** Video provider for meeting rooms: local/none (scheduling, agenda, minutes only) or jitsi. */
  MEETING_PROVIDER: z.string().default('local'),
  MEETING_JITSI_BASE_URL: z.string().url().default('https://meet.jit.si'),
  /** Shows the 'demonstration environment' ribbon; demo seeds are refused in production regardless. */
  DEMO_MODE: bool.default(false),
  FEATURE_INVESTOR_DATA_ROOM: bool.default(false),
  FEATURE_FINANCE_INTRODUCTIONS: bool.default(false),
  ACCESS_TOKEN_TTL_SEC: z.coerce.number().default(900),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().default(14),
  /** Two-person approval threshold for payouts and awards (minor units, default ₹5 lakh). §7.1 */
  DUAL_APPROVAL_THRESHOLD: z.coerce.number().default(5_00_000_00),
  /** Expose OTP codes in API responses for local development / automated tests only. */
  DEV_EXPOSE_OTP: bool.default(false),
  /** Serve interactive OpenAPI UI at /docs. Defaults off in production. */
  EXPOSE_API_DOCS: bool.optional(),
  /** Login/registration attempts per minute per client (§7.1 rate limiting). */
  AUTH_RATE_LIMIT: z.coerce.number().int().positive().default(20),
  /** Requests per minute per client IP across the whole API. Client IP comes from X-Forwarded-For set by the load balancer. */
  API_RATE_LIMIT: z.coerce.number().int().positive().default(300),
});
export type AppConfig = z.infer<typeof Env>;

let cached: AppConfig | null = null;
export function config(): AppConfig {
  if (cached) return cached;
  const parsed = Env.parse(process.env);
  if (parsed.NODE_ENV === 'production') {
    for (const k of ['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET', 'DOWNLOAD_URL_SECRET'] as const) {
      if (parsed[k].includes('dev-')) throw new Error(`${k} must be set to a strong secret in production`);
    }
    if (/^0+$/.test(parsed.FIELD_ENCRYPTION_KEY)) throw new Error('FIELD_ENCRYPTION_KEY must be set in production');
    if (parsed.DEV_EXPOSE_OTP) throw new Error('DEV_EXPOSE_OTP cannot be enabled in production');
    if (parsed.MAIL_DRIVER === 'smtp' && !parsed.SMTP_URL) throw new Error('SMTP_URL must be set when MAIL_DRIVER=smtp');
  }
  cached = parsed;
  return parsed;
}
export const resetConfigForTests = () => {
  cached = null;
};
