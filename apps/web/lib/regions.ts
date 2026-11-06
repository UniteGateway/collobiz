/** Geographic coverage options (017). ISO 3166-2 India states + priority international markets. */
export const INDIA_STATES: [string, string][] = [
  ['IN-AP', 'Andhra Pradesh'], ['IN-AS', 'Assam'], ['IN-BR', 'Bihar'], ['IN-CT', 'Chhattisgarh'], ['IN-DL', 'Delhi'], ['IN-GA', 'Goa'], ['IN-GJ', 'Gujarat'],
  ['IN-HR', 'Haryana'], ['IN-HP', 'Himachal Pradesh'], ['IN-JH', 'Jharkhand'], ['IN-KA', 'Karnataka'], ['IN-KL', 'Kerala'], ['IN-MP', 'Madhya Pradesh'],
  ['IN-MH', 'Maharashtra'], ['IN-OR', 'Odisha'], ['IN-PB', 'Punjab'], ['IN-RJ', 'Rajasthan'], ['IN-TN', 'Tamil Nadu'], ['IN-TG', 'Telangana'],
  ['IN-UP', 'Uttar Pradesh'], ['IN-UT', 'Uttarakhand'], ['IN-WB', 'West Bengal'],
];
export const COUNTRIES: [string, string][] = [['AE', 'United Arab Emirates'], ['SA', 'Saudi Arabia'], ['BD', 'Bangladesh'], ['NP', 'Nepal'], ['LK', 'Sri Lanka'], ['KE', 'Kenya'], ['NG', 'Nigeria'], ['GB', 'United Kingdom'], ['US', 'United States'], ['SG', 'Singapore']];
export const regionName = (c: string) => INDIA_STATES.find(([k]) => k === c)?.[1] ?? COUNTRIES.find(([k]) => k === c)?.[1] ?? c;
/** Rupees (user input) ↔ paise (API). */
export const toMinor = (rupees: string) => (rupees.trim() === '' ? undefined : Math.round(Number(rupees.replace(/,/g, '')) * 100));
export const fromMinor = (m?: number | null) => (m == null ? '' : String(m / 100));
