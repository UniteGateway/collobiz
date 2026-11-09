/** Unite Group businesses (ventures) that partners can promote. */
export const VENTURE_STAGES = ['concept', 'pilot', 'building', 'live'] as const;
export const VENTURE_STAGE_LABELS: Record<string, string> = { concept: 'Early stage — gathering interest', pilot: 'Pilot', building: 'In development', live: 'Operating' };
export const VENTURE_ROLES = ['refer_customers', 'sell_products', 'supply_products', 'deliver_services', 'recruit_merchants', 'recruit_members', 'create_content', 'community'] as const;
export const VENTURE_ROLE_LABELS: Record<string, string> = {
  refer_customers: 'Refer customers', sell_products: 'Sell products', supply_products: 'Supply products', deliver_services: 'Deliver services or installation',
  recruit_merchants: 'Bring merchants and sellers', recruit_members: 'Bring users, members or candidates', create_content: 'Create content and campaigns', community: 'Organise community programmes',
};
/** Partner-facing availability of a business. */
export const ventureAvailability = (v: { open: boolean; regulated: boolean; cleared?: boolean }) => (v.regulated && !v.cleared ? 'Awaiting regulatory review' : v.open ? 'Open to partners' : 'Coming soon');
