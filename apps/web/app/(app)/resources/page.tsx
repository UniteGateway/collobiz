'use client';
import Link from 'next/link';
import { Icon } from '@collabiz/ui';
import { Screen } from '@/components/Screen';
import { AssetList } from './Assets';

/** Screen 113 — Marketing resources library: approved brochure copy and brand guidelines. */
export default function Resources() {
  return (
    <Screen id="113" title="Marketing resources" description="Approved material you can use with customers. Everything here has been checked by Unite Group, so you don’t need separate approval."
      actions={<Link href="/resources/brochure" className="cz-btn cz-btn-accent"><Icon name="documents" size={16} />Make a co-branded brochure</Link>}>
      <AssetList kinds={['brochure', 'guide']} />
    </Screen>
  );
}
