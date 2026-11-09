/**
 * Adds the direct-offers demo data (partner capacity + two offers) to an existing demo database without reseeding it.
 * Safe to run twice: it does nothing if the demo offers already exist.  Usage: node -r @swc-node/register src/db/seed-offers.ts
 */
import { eq, inArray } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { createPool } from './client';
import * as s from './schema';
import { franchiseDemo, groupCompaniesDemo, growthDemo, propertyDemo, offerSalesDemo, offersDemo, pilotDemo, venturesDemo } from './seed-stages';

async function main() {
  const pool = createPool();
  const db = drizzle(pool, { schema: s });
  const [exists] = await db.select({ id: s.directOffers.id }).from(s.directOffers).where(eq(s.directOffers.code, 'DO-2026-100001')).limit(1);
  if (exists) console.log('Direct offers demo data already present');
  const ORGS: Record<string, string> = { powertek: 'Powertek', uniteExim: 'Unite Exim', uniteSolar: 'Unite Solar', volt: 'Volt EPC', sunrise: 'Sunrise Traders', meera: 'Meera Iyer Consulting', deccan: 'Deccan Distributors' };
  const USERS: Record<string, string> = { uniteAdmin: 'unite.admin@collabiz.local', asha: 'asha@voltepc.example', ravi: 'ravi@sunrise.example', meera: 'meera@consult.example', deepak: 'deepak@deccan.example' };
  const orgs = await db.select({ id: s.organizations.id, name: s.organizations.displayName }).from(s.organizations).where(inArray(s.organizations.displayName, Object.values(ORGS)));
  const users = await db.select({ id: s.users.id, email: s.users.email }).from(s.users).where(inArray(s.users.email, Object.values(USERS)));
  const refs = {
    orgs: Object.fromEntries(Object.entries(ORGS).map(([k, n]) => [k, orgs.find((o) => o.name === n)?.id])),
    users: Object.fromEntries(Object.entries(USERS).map(([k, e]) => [k, users.find((u) => u.email === e)?.id])),
  } as never;
  if (!exists) { await offersDemo(db, refs); console.log('Added direct offers demo data'); }
  await offerSalesDemo(db, refs); // idempotent: skips if the offer already has sales
  console.log('Direct offer sales demo data in place');
  await venturesDemo(db, refs);
  console.log('Unite businesses in place');
  await pilotDemo(db, refs);
  console.log('Pilot check-ins in place');
  await growthDemo(db, refs);
  console.log('Growth Desk demo in place');
  await groupCompaniesDemo(db, refs);
  console.log('Unite Group companies in place');
  await franchiseDemo(db, refs);
  await propertyDemo(db, refs);
  console.log('Franchise and property demo in place');
  await pool.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
