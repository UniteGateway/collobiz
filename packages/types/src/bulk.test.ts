import { describe, expect, it } from 'vitest';
import { guessMapping, isValidGstin, isValidPan, normalizeIndianMobile, panOfGstin, parseTallyRate, validateImport } from './bulk';
import { parseCsv } from './imports';

describe('Indian identifiers', () => {
  it('checks GSTIN format and check digit', () => {
    expect(isValidGstin('27AAPFU0939F1ZV')).toBe(true);
    expect(isValidGstin('29AAGCB7383J1Z4')).toBe(true);
    expect(isValidGstin('27AAPFU0939F1ZX')).toBe(false); // wrong check digit
    expect(isValidGstin('27AAPFU0939F1Z')).toBe(false);
    expect(isValidGstin('00AAPFU0939F1ZV')).toBe(false); // no state 00
    expect(panOfGstin('27AAPFU0939F1ZV')).toBe('AAPFU0939F');
    expect(isValidPan('AAPFU0939F')).toBe(true);
    expect(isValidPan('AAPXU0939F')).toBe(false);
  });
  it('normalises Indian mobiles', () => {
    expect(normalizeIndianMobile('+91 98204 56789')).toBe('9820456789');
    expect(normalizeIndianMobile('09820456789')).toBe('9820456789');
    expect(normalizeIndianMobile('12345')).toBeNull();
    expect(normalizeIndianMobile('5820456789')).toBeNull();
  });
});

describe('bulk import', () => {
  const csv = `Customer list exported 10/11/2026\nParty Name,GSTIN,Contact Person,Mobile No,E-mail,City\nShree Ganesh Engineering,27AAPFU0939F1ZV,Ramesh Pawar,+91 98220 11223,ramesh@sge.example,Pune\nBad GST Co,27AAPFU0939F1ZX,,9822011224,,Nashik\nNo Phone Traders,,,,,Satara\nShree Ganesh Engineering,27AAPFU0939F1ZV,Dup,9822011225,,Pune\n,,,,,`;
  it('finds the header row and maps columns by name', () => {
    const m = guessMapping(parseCsv(csv), 'customers');
    expect(m.header).toBe(1);
    expect(m.mapping).toEqual({ legalName: 0, taxId: 1, contactName: 2, contactPhone: 3, contactEmail: 4, city: 5 });
  });
  it('reports every bad row and in-file duplicates; never drops silently', () => {
    const rows = parseCsv(csv);
    const m = guessMapping(rows, 'customers');
    const v = validateImport(rows, 'customers', m.header, m.mapping);
    expect(v.records.map((r) => r.data.legalName)).toEqual(['Shree Ganesh Engineering', 'No Phone Traders']);
    expect(v.records[0].data).toMatchObject({ contactPhone: '9822011223', contactEmail: 'ramesh@sge.example' });
    expect(v.issues).toEqual([
      { row: 4, field: 'GSTIN', message: 'Not a valid GSTIN (format or check digit)' },
      { row: 6, field: '—', message: 'Duplicate of row 3 in this file' },
    ]);
  });
  it('refuses when a required column is not mapped', () => {
    const rows = parseCsv('Item,Rate\nPanel,100');
    const m = guessMapping(rows, 'products');
    expect(validateImport(rows, 'products', m.header, m.mapping).missing).toEqual(['Unit']);
  });
  it('reads product prices and Tally rates', () => {
    const rows = parseCsv('Item Name,UOM,Rate,MOQ,HSN\n540 Wp panel,Nos,"12,500.00",10,8541');
    const m = guessMapping(rows, 'products');
    expect(validateImport(rows, 'products', m.header, m.mapping).records[0].data).toMatchObject({ name: '540 Wp panel', unit: 'Nos', price: 12_500_00, moq: 10, hsn: '8541' });
    expect(parseTallyRate('1,250.00/Nos')).toEqual({ price: 1_250_00, unit: 'Nos' });
    expect(parseTallyRate(undefined)).toEqual({ price: null, unit: null });
  });
});
