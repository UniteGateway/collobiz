import { redirect } from 'next/navigation';

export default async function TenderIndex({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/tenders/${id}/documents`);
}
