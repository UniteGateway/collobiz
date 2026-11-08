/** Geographic coverage options (017). ISO 3166-2 India states + priority international markets. */
import { COUNTRIES as ALL_COUNTRIES, INDIA_STATES, regionLabel } from '@collabiz/types';
export { INDIA_STATES };
/** International markets offered for coverage (India itself is covered by the state list). */
export const COUNTRIES = ALL_COUNTRIES.filter(([c]) => c !== 'IN');
export const regionName = regionLabel;
/** Rupees (user input) ↔ paise (API). */
export const toMinor = (rupees: string) => (rupees.trim() === '' ? undefined : Math.round(Number(rupees.replace(/,/g, '')) * 100));
export const fromMinor = (m?: number | null) => (m == null ? '' : String(m / 100));
