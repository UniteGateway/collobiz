'use client';
import { Screen } from '@/components/Screen';
import { OpportunityList } from '@/components/Opportunities';

/** Screen 035 — Advanced Search & Filter (with saved search alerts). */
export default function SearchPage() {
  return <Screen id="035"><OpportunityList advanced allowSaveSearch /></Screen>;
}
