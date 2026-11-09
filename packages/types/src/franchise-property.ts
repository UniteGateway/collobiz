import { z } from 'zod';

// ---------------- Franchise ----------------
export const FRANCHISE_FORMATS = ['experience_centre', 'store', 'kiosk', 'service_point'] as const;
export const FRANCHISE_FORMAT_LABELS: Record<string, string> = { experience_centre: 'Experience centre', store: 'Store', kiosk: 'Kiosk', service_point: 'Service point' };
export const FRANCHISE_STATUSES = ['applied', 'approved', 'agreement_signed', 'setup', 'live', 'suspended', 'rejected', 'closed'] as const;
export const FRANCHISE_STATUS_LABELS: Record<string, string> = {
  applied: 'Applied', approved: 'Approved', agreement_signed: 'Agreement signed', setup: 'Setting up', live: 'Live', suspended: 'Suspended', rejected: 'Not approved', closed: 'Closed',
};
/** Allowed next steps. Going live also requires every checklist item to be done. */
export const FRANCHISE_NEXT: Record<string, string[]> = {
  applied: ['approved', 'rejected'], approved: ['agreement_signed', 'closed'], agreement_signed: ['setup', 'closed'], setup: ['live', 'closed'],
  live: ['suspended', 'closed'], suspended: ['live', 'closed'], rejected: [], closed: [],
};
export const FRANCHISE_CHECKLIST: [string, string][] = [
  ['site', 'Site selected and approved'], ['agreement', 'Franchise agreement signed'], ['fee', 'Franchise fee received'], ['training', 'Staff trained'],
  ['branding', 'Branding and display installed'], ['stock', 'Opening stock received'], ['launch', 'Launch event done'],
];
export const FranchiseApplySchema = z.object({
  brandOrgId: z.string().uuid(),
  format: z.enum(FRANCHISE_FORMATS),
  city: z.string().trim().min(2).max(80),
  region: z.string().trim().min(2).max(6),
  message: z.string().trim().min(30, { message: 'Tell Unite about your location, team and experience (at least 30 characters)' }).max(2000),
});
export const FranchiseDecisionSchema = z.object({
  status: z.enum(FRANCHISE_STATUSES),
  note: z.string().trim().max(1000).optional(),
  fee: z.number().int().min(0).max(1_00_00_00_000_00).optional(),
  royaltyBps: z.number().int().min(0).max(5000).optional(),
  monthlyTarget: z.number().int().min(0).max(1_00_00_00_000_00).optional(),
});
export const FranchiseReportSchema = z.object({
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, { message: 'Use the format YYYY-MM' }),
  sales: z.number().int().min(0).max(1_00_00_00_000_00),
  orders: z.number().int().min(0).max(1_000_000),
  notes: z.string().trim().max(1000).optional(),
});

// ---------------- Real estate ----------------
export const PROPERTY_KINDS = ['industrial_park', 'residential', 'commercial', 'plotted', 'land'] as const;
export const PROPERTY_KIND_LABELS: Record<string, string> = { industrial_park: 'Industrial park', residential: 'Residential', commercial: 'Commercial', plotted: 'Plotted development', land: 'Land' };
/** Project kinds that must carry a RERA registration before they can be marketed through partners. */
export const RERA_REQUIRED_KINDS = new Set(['residential', 'commercial', 'plotted']);
export const UNIT_TYPES = ['plot', 'flat', 'villa', 'shed', 'office', 'shop', 'land_parcel'] as const;
export const UNIT_TYPE_LABELS: Record<string, string> = { plot: 'Plot', flat: 'Flat', villa: 'Villa', shed: 'Industrial shed', office: 'Office', shop: 'Shop', land_parcel: 'Land parcel' };
export const UNIT_STATUS_LABELS: Record<string, string> = { available: 'Available', held: 'On hold', booked: 'Booked', sold: 'Sold', blocked: 'Not for sale' };
export const PROPERTY_HOLD_HOURS = 48;
export const PROPERTY_MAX_HOLDS = 5;

export const PropertyProjectSchema = z.object({
  ownerOrgId: z.string().uuid(),
  name: z.string().trim().min(3).max(160),
  kind: z.enum(PROPERTY_KINDS),
  city: z.string().trim().min(2).max(80),
  region: z.string().trim().min(2).max(6),
  description: z.string().trim().min(20).max(3000),
  reraNumber: z.string().trim().max(60).optional().or(z.literal('').transform(() => undefined)),
  commissionBps: z.number().int().min(0).max(1000).default(200),
});
export const PropertyUnitsSchema = z.object({
  units: z.array(z.object({ unitNo: z.string().trim().min(1).max(30), unitType: z.enum(UNIT_TYPES), areaSqft: z.number().int().min(1).max(100_000_000), price: z.number().int().min(0).max(1_00_00_00_000_00) })).min(1).max(1000),
});
export const PropertyHoldSchema = z.object({
  buyerName: z.string().trim().min(2).max(120),
  buyerCity: z.string().trim().min(2).max(80),
  consentMethod: z.enum(['meeting_minutes', 'written_email', 'signed_letter', 'recorded_call']),
  consent: z.literal(true, { message: 'Confirm that the buyer agreed to be introduced' }),
  agentRera: z.string().trim().max(60).optional().or(z.literal('').transform(() => undefined)),
});
