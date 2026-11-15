/** Catalogues, brochures, DPRs and other documents attached to each COLLABIZ module, managed by Unite admins. */
import { z } from 'zod';

/** Module keys match the partner app's navigation modules (lib/navigation.ts). */
export const DOCUMENT_MODULES = [
  ['general', 'COLLABIZ (all modules)'], ['collab', 'Collab'], ['business-offers', 'Business Offers'], ['opportunities', 'Opportunities'], ['leads', 'Leads & CRM'],
  ['collaboration', 'Teams & partners'], ['unite-solar', 'Unite Solar'], ['powertek', 'Powertek products'], ['ventures', 'Unite businesses'], ['tenders', 'Tenders'],
  ['projects', 'Projects'], ['trading', 'Trading'], ['earnings', 'Earnings'], ['global', 'Global'], ['growth', 'Performance & learning'], ['help', 'Help & support'],
] as const;
export type DocumentModule = (typeof DOCUMENT_MODULES)[number][0];
export const DOCUMENT_MODULE_LABELS: Record<string, string> = Object.fromEntries(DOCUMENT_MODULES);
export const DOCUMENT_KINDS = ['catalogue', 'brochure', 'dpr', 'datasheet', 'presentation', 'policy', 'template', 'guide', 'other'] as const;
export const DOCUMENT_KIND_LABELS: Record<string, string> = {
  catalogue: 'Catalogue', brochure: 'Brochure', dpr: 'DPR (detailed project report)', datasheet: 'Datasheet', presentation: 'Presentation', policy: 'Policy', template: 'Template', guide: 'Guide', other: 'Document',
};
export const DOCUMENT_VISIBILITY = ['public', 'partners', 'verified_partners', 'staff'] as const;
export const DOCUMENT_VISIBILITY_LABELS: Record<string, string> = { public: 'Everyone', partners: 'Signed-in partners', verified_partners: 'Verified partners', staff: 'Unite staff only' };

export const ModuleDocumentSchema = z.object({
  moduleKey: z.enum(DOCUMENT_MODULES.map(([k]) => k) as [DocumentModule, ...DocumentModule[]]),
  title: z.string().trim().min(3, 'Give the document a title').max(160),
  kind: z.enum(DOCUMENT_KINDS),
  description: z.string().trim().max(600).optional(),
  url: z.string().trim().max(500).refine((u) => u.startsWith('/') || /^https:\/\//.test(u), 'Use an https:// link or an in-app path starting with /').optional(),
  visibility: z.enum(DOCUMENT_VISIBILITY).default('partners'),
  sortOrder: z.number().int().min(0).max(999).default(100),
});
export type ModuleDocumentInput = z.infer<typeof ModuleDocumentSchema>;
