/**
 * Tally Prime / ERP 9 XML export → table rows in the same shape as an uploaded sheet, so one validation path serves both.
 * Customers: ledgers whose group (PARENT) is Sundry Debtors or a similar group. Products: stock items.
 * This reads an exported file; a live link to a Tally installation runs on the customer's own computer and is not built.
 */
import { BadRequestException } from '@nestjs/common';
import { XMLParser } from 'fast-xml-parser';
import { TALLY_CUSTOMER_GROUPS, parseTallyRate } from '@collabiz/types';

const decode = (b: Buffer) => (b[0] === 0xff && b[1] === 0xfe ? b.subarray(2).toString('utf16le') : b[0] === 0xfe && b[1] === 0xff ? Buffer.from(b.subarray(2)).swap16().toString('utf16le') : b.toString('utf8').replace(/^\uFEFF/, ''));
const arr = <T>(x: T | T[] | undefined): T[] => (x == null ? [] : Array.isArray(x) ? x : [x]);
const txt = (x: unknown): string => (x == null ? '' : typeof x === 'object' ? txt((x as Record<string, unknown>)['#text']) : String(x)).trim();
/** Collects every element with this tag anywhere in the tree (Tally nests masters at varying depths). */
function all(node: unknown, tag: string, out: Record<string, unknown>[] = []) {
  if (node && typeof node === 'object') {
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      if (k === tag) out.push(...(arr(v) as Record<string, unknown>[]));
      else all(v, tag, out);
    }
  }
  return out;
}

export function looksLikeTally(b: Buffer) {
  const head = decode(b.subarray(0, 4000)).toUpperCase();
  return head.includes('<ENVELOPE') && (head.includes('TALLYMESSAGE') || head.includes('<LEDGER') || head.includes('<STOCKITEM'));
}

export function tallyRows(b: Buffer, target: 'customers' | 'products'): string[][] {
  let doc: unknown;
  try { doc = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@', parseTagValue: false, trimValues: true }).parse(decode(b)); } catch { throw new BadRequestException('This Tally file could not be read'); }
  if (target === 'customers') {
    const ledgers = all(doc, 'LEDGER').filter((l) => TALLY_CUSTOMER_GROUPS.test(txt(l.PARENT)));
    if (!ledgers.length) throw new BadRequestException('No customer ledgers (Sundry Debtors) found — export Masters › Ledgers from Tally');
    return [['Name', 'GSTIN', 'Contact Person', 'Mobile', 'Email', 'City'], ...ledgers.map((l) => {
      const gst = txt(l.PARTYGSTIN) || txt(all(l, 'LEDGSTREGDETAILS.LIST')[0]?.GSTIN) || txt(l.GSTIN);
      const addr = all(l, 'ADDRESS.LIST').flatMap((a) => arr(a.ADDRESS).map(txt)).filter(Boolean);
      const city = txt(l.LEDGERCITY) || (addr.length ? addr[addr.length - 1].replace(/[-\s]*\d{6}$/, '').split(',').pop()!.trim() : '');
      return [txt(l['@NAME']) || txt(l.NAME), gst, txt(l.LEDGERCONTACT), txt(l.LEDGERMOBILE) || txt(l.LEDGERPHONE), txt(l.EMAIL), city];
    })];
  }
  const items = all(doc, 'STOCKITEM');
  if (!items.length) throw new BadRequestException('No stock items found — export Masters › Stock Items from Tally');
  return [['Item Name', 'Item Code', 'Description', 'Unit', 'Rate', 'HSN'], ...items.map((i) => {
    const rate = parseTallyRate(txt(all(i, 'STANDARDPRICELIST.LIST')[0]?.RATE) || txt(i.OPENINGRATE));
    const hsn = txt(all(i, 'GSTDETAILS.LIST')[0]?.HSNCODE) || txt(all(i, 'HSNDETAILS.LIST')[0]?.HSNCODE);
    return [txt(i['@NAME']) || txt(i.NAME), txt(i.PARTNO), txt(i.DESCRIPTION) || txt(i.NARRATION), txt(i.BASEUNITS) || rate.unit || '', rate.price != null ? (rate.price / 100).toFixed(2) : '', hsn];
  })];
}
