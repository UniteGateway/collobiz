/** PDF documents (pdfkit, server-side). Plain, readable layouts; every figure states its basis and provenance. */
import PDFDocument from 'pdfkit';

export type Row = (string | number)[];
const NAVY = '#0b1f3a', BLUE = '#1e6bff', GREY = '#5b6475';

export function newDoc(title: string, subtitle: string) {
  const doc = new PDFDocument({ size: 'A4', margin: 48, info: { Title: title, Author: 'Unite Developers Global Inc.' } });
  const chunks: Buffer[] = [];
  doc.on('data', (c: Buffer) => chunks.push(c));
  doc.rect(0, 0, doc.page.width, 6).fill(BLUE);
  doc.fillColor(NAVY).fontSize(20).font('Helvetica-Bold').text(title, 48, 40);
  doc.fillColor(GREY).fontSize(10).font('Helvetica').text(subtitle);
  doc.moveDown(0.3).fontSize(8).text(`Unite Developers Global Inc. · powered by Unite Group Inc., USA · Generated ${new Date().toISOString().slice(0, 10)}`);
  doc.moveDown(1);
  const done = new Promise<Buffer>((res) => doc.on('end', () => res(Buffer.concat(chunks))));
  return { doc, done };
}

export function heading(doc: PDFKit.PDFDocument, t: string) {
  if (doc.y > doc.page.height - 140) doc.addPage();
  doc.moveDown(0.6).fillColor(NAVY).font('Helvetica-Bold').fontSize(12).text(t).moveDown(0.3).font('Helvetica').fontSize(9.5).fillColor('#111');
}
export function para(doc: PDFKit.PDFDocument, t: string, colour = '#111') { doc.fillColor(colour).font('Helvetica').fontSize(9.5).text(t, { lineGap: 2 }).moveDown(0.3); }

/** Simple table with a header row; first column left-aligned, the rest right-aligned. */
export function table(doc: PDFKit.PDFDocument, rows: Row[], widths?: number[]) {
  const W = doc.page.width - 96;
  const w = widths ?? [W * 0.46, ...Array(rows[0].length - 1).fill((W * 0.54) / (rows[0].length - 1))];
  rows.forEach((r, i) => {
    if (doc.y > doc.page.height - 70) doc.addPage();
    const y = doc.y;
    let x = 48;
    if (i === 0) doc.rect(48, y - 2, W, 15).fill('#eef3ff');
    r.forEach((c, j) => {
      doc.fillColor(i === 0 ? NAVY : '#111').font(i === 0 ? 'Helvetica-Bold' : 'Helvetica').fontSize(8.5)
        .text(String(c), x + 3, y, { width: w[j] - 6, align: j === 0 ? 'left' : 'right', lineBreak: false, ellipsis: true });
      x += w[j];
    });
    doc.y = y + 15; doc.x = 48;
  });
  doc.moveDown(0.4);
}

export const inr = (v: number) => `Rs ${Math.round(v).toLocaleString('en-IN')}`;
export const cr = (v: number) => `Rs ${(v / 1e7).toLocaleString('en-IN', { maximumFractionDigits: 2 })} cr`;
export const pctS = (v: number, d = 1) => `${(v * 100).toFixed(d)}%`;
