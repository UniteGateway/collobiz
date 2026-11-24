import { redirect } from 'next/navigation';
/** /business/<slug> — a participating company's microsite (the member page, with its POWERTRADE section). */
export default async function BusinessPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  redirect(`/club/m/${encodeURIComponent(slug)}`);
}
