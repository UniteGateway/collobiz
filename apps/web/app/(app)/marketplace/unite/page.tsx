'use client';
import { Screen } from '@/components/Screen';
import { OpportunityList } from '@/components/Opportunities';

/** Screen 032 — Unite Group Opportunities (route A). */
export default function UniteOpportunitiesPage() {
  return <Screen id="032" description="Published directly by Unite Group companies. Unite controls commercial approvals and signing."><OpportunityList scope="unite" /></Screen>;
}
