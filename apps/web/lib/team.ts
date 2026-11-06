'use client';
import { useParams } from 'next/navigation';
import { useQuery } from './hooks';

/** Loads a team; the API returns a teaser (no private data) unless the caller's org signed the NDA. */
export function useTeam() {
  const { id } = useParams<{ id: string }>();
  const q = useQuery<any>(`/teams/${id}`);
  return { id, ...q };
}
