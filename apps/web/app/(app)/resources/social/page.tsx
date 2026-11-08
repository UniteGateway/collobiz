'use client';
import { Screen } from '@/components/Screen';
import { AssetList } from '../Assets';

/** Screen 115 — Approved social campaign posts. */
export default function Social() {
  return (
    <Screen id="115" title="Social posts" description="Ready-to-post messages for LinkedIn and WhatsApp. Post them as written; don’t add prices or promises on behalf of Unite Group.">
      <AssetList kinds={['social']} />
    </Screen>
  );
}
