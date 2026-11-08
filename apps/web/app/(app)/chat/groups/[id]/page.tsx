'use client';
import { useParams } from 'next/navigation';
import { Screen } from '@/components/Screen';
import { ChatThread } from '@/components/Comms';
import { useSession } from '@/lib/session';

/** Screen 107 — Project group chat. Membership follows the project: a company removed from the project loses access at once. */
export default function ProjectChat() {
  const { id } = useParams<{ id: string }>();
  const { me } = useSession();
  return <Screen id="107" title="Project conversation" header={false}><ChatThread id={id} me={me} /></Screen>;
}
