/** Indian-style amount from paise: crore (Cr) or lakh (L). */
export const crore = (p: number) => { const r = p / 100; return r >= 1_00_00_000 ? `₹${(r / 1_00_00_000).toLocaleString('en-IN', { maximumFractionDigits: 2 })} Cr` : `₹${(r / 1_00_000).toLocaleString('en-IN', { maximumFractionDigits: 1 })} L`; };
