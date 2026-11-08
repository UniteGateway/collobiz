'use client';
import Link from 'next/link';
import { EmptyState, Icon, Skeleton } from '@collabiz/ui';
import { Screen, ApiErrorView } from '@/components/Screen';
import { useQuery } from '@/lib/hooks';

interface Course { id: string; code: string; title: string; summary: string; level: string; minutes: number; modules: number; completedModules: number; certificate: { code: string; expiresAt: string } | null }

/** Screen 116 — Training & learning centre. */
export default function Learning() {
  const q = useQuery<Course[]>('/learning/courses');
  return (
    <Screen id="116" title="Learning" description="Short courses on how COLLABIZ works and how Unite Group inspects work. Passing an assessment earns a certificate that counts towards your next membership level.">
      {q.error ? <ApiErrorView error={q.error} onRetry={q.reload} /> : !q.data ? <Skeleton height={220} /> : !q.data.length ? <div className="cz-card"><EmptyState icon="learning" title="No courses yet" /></div> : (
        <ul className="cz-course-grid">
          {q.data.map((c) => {
            const pct = c.modules ? Math.round((c.completedModules / c.modules) * 100) : 0;
            return (
              <li key={c.id}>
                <Link href={`/learning/assessments/${c.id}`} className="cz-course" data-course={c.code}>
                  <span className="cz-course-top"><span className="cz-route cz-route-unite">{c.level.charAt(0).toUpperCase() + c.level.slice(1)}</span><span className="cz-muted">{c.minutes} min · {c.modules} modules</span></span>
                  <strong>{c.title}</strong>
                  <span className="cz-muted cz-course-summary">{c.summary}</span>
                  {c.certificate ? <span className="cz-course-done"><Icon name="award" size={15} />Certified · valid to {new Date(c.certificate.expiresAt).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })}</span> : (
                    <span className="cz-course-progress"><span className="cz-factor-track"><span style={{ width: `${pct}%` }} /></span><span className="cz-muted">{pct ? `${pct}% complete` : 'Not started'}</span></span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Screen>
  );
}
