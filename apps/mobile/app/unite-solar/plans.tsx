import { Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Button, Card, ErrorView, Loading, Notice, ScreenView, s, inrShort, money } from '@/components/ui';
import { useApi } from '@/hooks';
import { DISCLAIMER, pct } from '@/uniteSolar';

interface Pkg { code: string; name: string; tagline: string; price: number; gstBps: number; gstMode: string; leadDnaIncluded: boolean; leadDnaAddonPrice: number | null; stockAllocation: number; storePackage: number; territoryLevel: string | null; exclusive: boolean; maxProductCommissionBps: number; districtProfitShareBps: number; interFranchiseBps: number; termYears: number; pricing: { total: number } }

/** Partner plans (native) — prices come from the server. */
export default function Plans() {
  const router = useRouter();
  const q = useApi<Pkg[]>('/network/packages');
  if (q.loading && !q.data) return <Loading />;
  if (q.error) return <ErrorView error={q.error} onRetry={q.reload} />;
  return (
    <ScreenView title="Partner plans" eyebrow="Unite Solar" subtitle="Unite reviews every application before any agreement or payment.">
      {(q.data ?? []).map((p) => (
        <Card key={p.code} title={p.name}>
          <View testID={`plan-${p.code}`}>
            <Text style={{ fontSize: 22, fontWeight: '700' }}>{inrShort(p.price)} <Text style={s.hint}>{p.gstMode === 'extra' ? `+ ${pct(p.gstBps)} GST` : 'incl. GST'}</Text></Text>
            <Text style={s.rowSub}>{p.tagline}</Text>
            {p.stockAllocation ? <Text style={s.rowSub}>{inrShort(p.stockAllocation)} opening stock at partner price + {inrShort(p.storePackage)} store package</Text> : null}
            <Text style={s.rowSub}>{p.territoryLevel ? `${p.territoryLevel} territory${p.exclusive ? ', exclusive' : ' catchment, not exclusive'}` : ''}</Text>
            <Text style={s.rowSub}>{p.leadDnaIncluded ? 'LeadDNA included' : p.leadDnaAddonPrice ? `LeadDNA optional: ${inrShort(p.leadDnaAddonPrice)}` : 'Standard COLLABIZ lead capture'}</Text>
            <Text style={s.rowSub}>Up to {pct(p.maxProductCommissionBps)} on eligible product sales{p.districtProfitShareBps ? ` · ${pct(p.districtProfitShareBps)} of eligible district net profit` : ''}{p.interFranchiseBps ? ` · ${pct(p.interFranchiseBps)} inter-franchise` : ''}</Text>
            <Text style={s.hint}>Payable {money(p.pricing.total)} incl. GST · {p.termYears}-year term</Text>
            <View style={{ marginTop: 8 }}><Button compact variant="secondary" title={`Apply for ${p.name}`} onPress={() => router.push(`/unite-solar/apply?package=${p.code}` as never)} /></View>
          </View>
        </Card>
      ))}
      <Notice title="How earnings work">{DISCLAIMER}</Notice>
    </ScreenView>
  );
}
