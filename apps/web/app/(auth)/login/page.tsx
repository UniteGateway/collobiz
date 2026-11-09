'use client';
import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { AuthExperience } from '@/components/AuthExperience';

/** Screen 011 — Sign in (`?mode=register` still opens Create account for older links). */
function Inner() {
  return <AuthExperience initial={useSearchParams().get('mode') === 'register' ? 'register' : 'login'} />;
}
export default function LoginPage() {
  return <Suspense><Inner /></Suspense>;
}
