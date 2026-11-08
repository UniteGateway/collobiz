'use client';
import { useParams } from 'next/navigation';
import { Screen } from '@/components/Screen';
import { ChatThread } from '@/components/Comms';
import { useSession } from '@/lib/session';

/** Screen 106 — One-to-one partner chat. Members only; encrypted at rest; unsend within 15 minutes; report and block. */
export default function DirectChat() {
  const { id } = useParams<{ id: string }>();
  const { me } = useSession();
  return <Screen id="106" title="Conversation" header={false}><ChatThread id={id} me={me} /></Screen>;
}
