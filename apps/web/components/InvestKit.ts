/** Shared types and money format for group-investment screens. */
export interface Offer {
  id: string; code: string; title: string; kind: string; kindLabel: string; summary: string; location: string; unitLabel: string; totalUnits: number; unitPrice: number; minUnits: number;
  assetValue: number; projectedMonthlyRent: number; rentPerUnitMonth: number; grossYieldPct: number; lockInMonths: number; sponsor: string; documentsUrl: string | null; status: string; statusLabel: string;
  regulatoryStatus: string; clearanceReference: string | null; interestUnits: number; interestedMembers: number; availableUnits: number; subscribedPct: number;
  mine: { units: number; monthlyRentShare: number; amount: number } | null; notice: string;
}
export const inr = (p: number) => { const r = p / 100; return r >= 1e7 ? `₹${(r / 1e7).toFixed(2)} Cr` : r >= 1e5 ? `₹${(r / 1e5).toFixed(2)} L` : `₹${Math.round(r).toLocaleString('en-IN')}`; };

