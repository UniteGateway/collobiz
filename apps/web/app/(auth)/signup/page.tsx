'use client';
import { Suspense } from 'react';
import { AuthExperience } from '@/components/AuthExperience';

/** Screen 011 — Create account (sign-up). */
export default function SignupPage() {
  return <Suspense><AuthExperience initial="register" /></Suspense>;
}
