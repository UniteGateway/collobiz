'use client';
import Link from 'next/link';
import { PublicScreen } from '@/components/PublicScreen';
import { OpportunityList } from '@/components/Opportunities';

/** Screen 006 — Public Business Opportunities (public listings only; partner listings after sign-in). */
export default function PublicOpportunitiesPage() {
  return (
    <PublicScreen id="006" description={<>Publicly listed Unite Group opportunities. <Link href="/signup">Join as a verified partner</Link> to see partner-only listings, check eligibility and apply.</>}>
      <OpportunityList publicOnly />
    </PublicScreen>
  );
}
