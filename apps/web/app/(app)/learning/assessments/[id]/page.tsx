'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Alert, Button, Icon, Skeleton } from '@collabiz/ui';
import { Screen, ApiErrorView } from '@/components/Screen';
import { api } from '@/lib/api';
import { useMutation, useQuery } from '@/lib/hooks';

interface Course { id: string; code: string; title: string; summary: string; minutes: number; passMark: number; modules: { title: string; body: string }[]; completedModules: number[]; assessment: { questions: { q: string; options: string[] }[]; attemptsLeftToday: number }; attempts: { score: number; passed: boolean; createdAt: string }[]; certificate: { code: string; expiresAt: string; score: number } | null }
interface Result { score: number; passed: boolean; passMark: number; correct: number; total: number; incorrect: number[]; certificate: { code: string } | null }

/** Screen 117 — Course and certification assessment. Modules first; the assessment is graded on the server. */
export default function CoursePlayer() {
  const { id } = useParams<{ id: string }>();
  const q = useQuery<Course>(`/learning/courses/${id}`);
  const [open, setOpen] = useState(0);
  // Open the first module not yet read, once, when the course loads — returning learners land where they left off.
  const placed = useRef(false);
  useEffect(() => {
    if (placed.current || !q.data) return;
    placed.current = true;
    const next = q.data.modules.findIndex((_, i) => !q.data!.completedModules.includes(i));
    setOpen(next);
  }, [q.data]);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [result, setResult] = useState<Result | null>(null);
  const done = useMutation(async (i: number) => { await api.post(`/learning/courses/${id}/modules/${i}/complete`); await q.reload(); setOpen(i + 1); return true; });
  const submit = useMutation(async () => { const qs = q.data!.assessment.questions; const r = await api.post<Result>(`/learning/courses/${id}/assessment`, { answers: qs.map((_, i) => answers[i]) }); setResult(r); await q.reload(); return r; });
  if (q.error) return <Screen id="117" title="Course"><ApiErrorView error={q.error} onRetry={q.reload} /></Screen>;
  const c = q.data;
  const allDone = !!c && c.completedModules.length >= c.modules.length;
  return (
    <Screen id="117" title={c?.title ?? 'Course'} header={false}>
      <Link href="/learning" className="cz-od-back"><Icon name="prev" size={16} />Learning</Link>
      {!c ? <Skeleton height={300} /> : (
        <div className="cz-course-page">
          <header style={{ marginBottom: 20 }}><span className="cz-mono cz-muted">{c.code}</span><h1 className="cz-od-title" style={{ fontSize: 30 }}>{c.title}</h1><p className="cz-od-body" style={{ marginTop: 6 }}>{c.summary}</p></header>
          {c.certificate && <Alert tone="success" title="You’re certified.">Certificate {c.certificate.code} · scored {c.certificate.score}%. <Link href="/certificates">View certificate</Link></Alert>}
          <ol className="cz-modules">
            {c.modules.map((m, i) => {
              const isDone = c.completedModules.includes(i);
              return (
                <li key={i} data-done={isDone || undefined}>
                  <button type="button" aria-expanded={open === i} onClick={() => setOpen(open === i ? -1 : i)}>
                    <span className="cz-mod-num">{isDone ? <Icon name="check" size={14} /> : i + 1}</span><strong>{m.title}</strong><Icon name="next" size={16} />
                  </button>
                  {open === i && <div className="cz-mod-body"><p>{m.body}</p>{!isDone && <Button size="sm" onClick={() => done.run(i)} loading={done.pending}>Mark as read</Button>}</div>}
                </li>
              );
            })}
          </ol>
          <section className="cz-card" aria-labelledby="as-h" style={{ marginTop: 20 }}>
            <h2 id="as-h" className="cz-help-h">Assessment</h2>
            <p className="cz-muted" style={{ marginTop: -6 }}>{c.assessment.questions.length} questions · pass mark {c.passMark}% · {c.assessment.attemptsLeftToday} attempt{c.assessment.attemptsLeftToday === 1 ? '' : 's'} left today</p>
            {!allDone ? <Alert tone="info">Read every module to unlock the assessment.</Alert> : result ? (
              <div className={`cz-result${result.passed ? ' cz-pass' : ''}`} role="status">
                <strong>{result.passed ? 'Passed' : 'Not passed yet'} — {result.score}%</strong>
                <span>{result.correct} of {result.total} correct{!result.passed && result.incorrect.length ? `. Review question${result.incorrect.length > 1 ? 's' : ''} ${result.incorrect.join(', ')} and try again.` : ''}</span>
                {result.certificate && <span>Certificate {result.certificate.code} issued. <Link href="/certificates">View it</Link></span>}
                {!result.passed && <Button size="sm" variant="secondary" onClick={() => { setResult(null); setAnswers({}); }}>Try again</Button>}
              </div>
            ) : (
              <form onSubmit={(e) => { e.preventDefault(); submit.run(); }} className="cz-stack" style={{ gap: 18 }}>
                {submit.error && <Alert tone="danger">{submit.error}</Alert>}
                {c.assessment.questions.map((qq, i) => (
                  <fieldset key={i} className="cz-question">
                    <legend>{i + 1}. {qq.q}</legend>
                    {qq.options.map((o, j) => <label key={j} data-on={answers[i] === j || undefined}><input type="radio" name={`q${i}`} checked={answers[i] === j} onChange={() => setAnswers({ ...answers, [i]: j })} />{o}</label>)}
                  </fieldset>
                ))}
                <Button type="submit" variant="accent" loading={submit.pending} disabled={Object.keys(answers).length < c.assessment.questions.length || !c.assessment.attemptsLeftToday}>Submit answers</Button>
              </form>
            )}
          </section>
        </div>
      )}
    </Screen>
  );
}
