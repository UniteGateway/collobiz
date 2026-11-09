import { readFileSync } from 'node:fs';
import { join } from 'node:path';
/** Sample bills made with a real PDF writer (Chromium "print to PDF"), as DISCOM portals produce. Clearly marked as samples. */
export const SAMPLE_BILL_PDF = readFileSync(join(__dirname, 'fixtures', 'sample-bill.pdf'));
export const NO_NUMBERS_PDF = readFileSync(join(__dirname, 'fixtures', 'no-numbers.pdf'));
