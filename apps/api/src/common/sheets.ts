/** Reads an uploaded table — CSV/TXT or Excel .xlsx (first worksheet) — into rows of trimmed text. Old binary .xls is refused with advice. */
import { BadRequestException } from '@nestjs/common';
import ExcelJS from 'exceljs';
import { parseCsv } from '@collabiz/types';

const iso = (d: Date) => d.toISOString().slice(0, 10);
function cellText(v: ExcelJS.CellValue): string {
  if (v == null) return '';
  if (v instanceof Date) return iso(v);
  if (typeof v === 'object') {
    if ('result' in v) return cellText(v.result as ExcelJS.CellValue); // formula
    if ('richText' in v) return v.richText.map((t) => t.text).join('');
    if ('text' in v) return String(v.text); // hyperlink
    return '';
  }
  return String(v);
}

export async function readTable(file: { buffer: Buffer; originalname: string }): Promise<string[][]> {
  const name = file.originalname.toLowerCase();
  const isZip = file.buffer.subarray(0, 2).toString('latin1') === 'PK';
  if (name.endsWith('.xls') && !isZip) throw new BadRequestException('Old Excel (.xls) files are not supported — save the file as .xlsx or CSV and upload again');
  if (name.endsWith('.xlsx') || isZip) {
    const wb = new ExcelJS.Workbook();
    try { await wb.xlsx.load(file.buffer as unknown as ArrayBuffer); } catch { throw new BadRequestException('This Excel file could not be read'); }
    const ws = wb.worksheets[0];
    if (!ws) throw new BadRequestException('The workbook has no sheets');
    const rows: string[][] = [];
    ws.eachRow({ includeEmpty: false }, (row) => {
      const vals = (row.values as ExcelJS.CellValue[]).slice(1);
      rows.push(vals.map((v) => cellText(v).trim()));
    });
    return rows;
  }
  const text = file.buffer.toString('utf8');
  if (text.includes('\u0000')) throw new BadRequestException('Upload a CSV or .xlsx file');
  return parseCsv(text);
}
