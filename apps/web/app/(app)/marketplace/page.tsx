'use client';
import { ButtonLink } from '@collabiz/ui';
import { Screen } from '@/components/Screen';
import { OpportunityList } from '@/components/Opportunities';

/** Screen 031 — All Opportunities Marketplace. */
export default function MarketplacePage() {
  return (
    <Screen id="031" description="Unite Group listings and approved partner-exchange opportunities visible to your organization." actions={<><ButtonLink href="/marketplace/search" variant="secondary">Advanced search</ButtonLink><ButtonLink href="/leads/new" variant="accent">Register a lead</ButtonLink></>}>
      <OpportunityList allowSaveSearch />
    </Screen>
  );
}
