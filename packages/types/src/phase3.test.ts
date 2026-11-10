import { describe, expect, it } from 'vitest';
import { agingBuckets } from './phase3';

describe('receivables ageing', () => {
  it('puts each outstanding amount in one bucket and ignores paid ones', () => {
    const b = agingBuckets([
      { outstanding: 100, dueDate: '2026-12-01' }, { outstanding: 200, dueDate: '2026-11-01' }, { outstanding: 300, dueDate: '2026-09-20' },
      { outstanding: 400, dueDate: '2026-06-01' }, { outstanding: 0, dueDate: '2026-01-01' }, { outstanding: 50, dueDate: null },
    ], new Date('2026-11-10'));
    expect(b.map((x) => x.amount)).toEqual([150, 200, 300, 0, 400]);
    expect(b.map((x) => x.count)).toEqual([2, 1, 1, 0, 1]);
  });
});
