// Builds docs/pilot/legal-review-pack.docx and .md from content.mjs. Needs the `docx` npm package:
//   NODE_PATH=$(npm root -g) node scripts/legal-pack/build.mjs docs/pilot/legal-review-pack.docx docs/pilot/legal-review-pack.md
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
import { TITLE, SUBTITLE, META, BLOCKS } from './content.mjs';
const require = createRequire(import.meta.url);
const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, ShadingType, BorderStyle, AlignmentType, LevelFormat, HeadingLevel, Footer, PageNumber, TableOfContents } = require('docx');

const [docxOut, mdOut] = process.argv.slice(2);
const NAVY = '03325D', GREEN = '2E7D32', GREY = 'F3F5F8', QBG = 'EAF4EA';
const FONT = 'Arial';
const W = 9026; // A4 width minus 1" margins, in DXA
const border = { style: BorderStyle.SINGLE, size: 4, color: 'C9D1DC' };
const borders = { top: border, bottom: border, left: border, right: border };
const questions = BLOCKS.filter((b) => b.t === 'q');

const run = (text, o = {}) => new TextRun({ text, font: FONT, ...o });
const para = (text, o = {}) => new Paragraph({ children: [run(text, o.run)], spacing: { after: 120 }, ...o.p });
function table(head, rows, widths, noHead) {
  const cell = (text, w, hdr) => new TableCell({
    width: { size: w, type: WidthType.DXA }, borders, margins: { top: 60, bottom: 60, left: 100, right: 100 },
    shading: hdr ? { type: ShadingType.CLEAR, color: 'auto', fill: NAVY } : undefined,
    children: [new Paragraph({ children: [run(text, { size: 19, bold: hdr, color: hdr ? 'FFFFFF' : '1B2430' })] })],
  });
  return new Table({ width: { size: W, type: WidthType.DXA }, columnWidths: widths,
    rows: [...(noHead ? [] : [new TableRow({ tableHeader: true, children: head.map((h, i) => cell(h, widths[i], true)) })]), ...rows.map((r) => new TableRow({ children: r.map((c, i) => cell(c, widths[i], false)) }))] });
}
const widthsFor = (n) => n === 2 ? [3000, 6026] : n === 3 ? [2900, 3000, 3126] : [500, 2700, 3326, 2500];

const children = [
  new Paragraph({ heading: HeadingLevel.TITLE, children: [run(TITLE)] }),
  para(SUBTITLE, { run: { size: 24, color: '5E6573' } }),
  table(['', ''], META.map(([k, v]) => [k, v]), [2400, 6626], true),
  new Paragraph({ spacing: { before: 360, after: 120 }, children: [run('Contents', { bold: true, size: 26, color: NAVY })] }),
  ...BLOCKS.filter((b) => b.t === 'h1').map((b) => new Paragraph({ spacing: { after: 60 }, indent: { left: 240 }, children: [run(b.x, { size: 21 })] })),
  new Paragraph({ pageBreakBefore: true, children: [] }),
];
let first = true;
for (const b of BLOCKS) {
  if (b.t === 'h1') { children.push(new Paragraph({ heading: HeadingLevel.HEADING_1, pageBreakBefore: !first && /^\d\.|Checklist|Key commercial/.test(b.x), children: [run(b.x)] })); first = false; }
  else if (b.t === 'h2') children.push(new Paragraph({ heading: HeadingLevel.HEADING_2, children: [run(b.x)] }));
  else if (b.t === 'p') children.push(para(b.x));
  else if (b.t === 'note') children.push(new Paragraph({ spacing: { after: 120 }, border: { left: { style: BorderStyle.SINGLE, size: 18, color: 'E9A23B', space: 8 } }, children: [run('Note: ', { bold: true }), run(b.x)] }));
  else if (b.t === 'list') for (const x of b.x) children.push(new Paragraph({ numbering: { reference: 'bullets', level: 0 }, spacing: { after: 60 }, children: [run(x)] }));
  else if (b.t === 'num') for (const x of b.x) children.push(new Paragraph({ numbering: { reference: 'steps', level: 0 }, spacing: { after: 60 }, children: [run(x)] }));
  else if (b.t === 'quote') b.x.forEach((x, i) => children.push(new Paragraph({
    shading: { type: ShadingType.CLEAR, color: 'auto', fill: GREY }, indent: { left: 240, right: 240 },
    border: { left: { style: BorderStyle.SINGLE, size: 18, color: NAVY, space: 8 } },
    spacing: { before: i === 0 ? 120 : 0, after: i === b.x.length - 1 ? 200 : 40 },
    children: [run(x, { font: 'Georgia', size: 20, bold: i === 0 })],
  })));
  else if (b.t === 'table') { children.push(table(b.head, b.rows, widthsFor(b.head.length))); children.push(para('')); }
  else if (b.t === 'q') children.push(new Paragraph({
    shading: { type: ShadingType.CLEAR, color: 'auto', fill: QBG }, border: { left: { style: BorderStyle.SINGLE, size: 18, color: GREEN, space: 8 } },
    indent: { left: 240, right: 240 }, spacing: { before: 80, after: 160 },
    children: [run(`Q${b.n}  `, { bold: true, color: GREEN }), run(b.x)],
  }));
  else if (b.t === 'qtable') { children.push(table(['Q', 'Question (short)', 'Counsel’s answer'], questions.map((q) => [`Q${q.n}`, q.x.length > 150 ? q.x.slice(0, q.x.lastIndexOf(' ', 150)) + ' …' : q.x, '']), [600, 4900, 3526])); children.push(para('')); }
}

const doc = new Document({
  creator: 'COLLABIZ project', title: TITLE, description: SUBTITLE,
  styles: {
    default: { document: { run: { font: FONT, size: 21 } } },
    paragraphStyles: [
      { id: 'Title', name: 'Title', basedOn: 'Normal', run: { font: FONT, size: 44, bold: true, color: NAVY }, paragraph: { spacing: { before: 0, after: 120 }, keepNext: true } },
      { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { font: FONT, size: 32, bold: true, color: NAVY }, paragraph: { spacing: { before: 240, after: 120 }, keepNext: true, outlineLevel: 0 } },
      { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { font: FONT, size: 25, bold: true, color: NAVY }, paragraph: { spacing: { before: 200, after: 100 }, keepNext: true, outlineLevel: 1 } },
    ],
  },
  numbering: { config: [
    { reference: 'bullets', levels: [{ level: 0, format: LevelFormat.BULLET, text: '•', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] },
    { reference: 'steps', levels: [{ level: 0, format: LevelFormat.DECIMAL, text: '%1.', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] },
  ] },
  sections: [{
    properties: { page: { margin: { top: 1440, bottom: 1440, left: 1440, right: 1440 } } },
    footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [run('COLLABIZ legal review pack — DRAFT, privileged and confidential — page ', { size: 16, color: '5E6573' }), new TextRun({ children: [PageNumber.CURRENT], font: FONT, size: 16, color: '5E6573' })] })] }) },
    children,
  }],
});
writeFileSync(docxOut, await Packer.toBuffer(doc));

// Markdown copy for the repository
const md = [`# ${TITLE}`, '', `_${SUBTITLE}_`, '', ...META.map(([k, v]) => `- **${k}:** ${v}`), '', '> The Word version (`legal-review-pack.docx`) is the one to send to counsel for tracked-changes markup. Both are generated from the same source.', ''];
for (const b of BLOCKS) {
  if (b.t === 'h1') md.push(`## ${b.x}`, '');
  else if (b.t === 'h2') md.push(`### ${b.x}`, '');
  else if (b.t === 'p') md.push(b.x, '');
  else if (b.t === 'note') md.push(`> **Note:** ${b.x}`, '');
  else if (b.t === 'list') md.push(...b.x.map((x) => `- ${x}`), '');
  else if (b.t === 'num') md.push(...b.x.map((x, i) => `${i + 1}. ${x}`), '');
  else if (b.t === 'quote') md.push('```text', ...b.x, '```', '');
  else if (b.t === 'table') md.push(`| ${b.head.join(' | ')} |`, `|${b.head.map(() => '---').join('|')}|`, ...b.rows.map((r) => `| ${r.join(' | ')} |`), '');
  else if (b.t === 'q') md.push(`**Q${b.n}.** ${b.x}`, '');
  else if (b.t === 'qtable') md.push('| Q | Question | Answer |', '|---|---|---|', ...questions.map((q) => `| Q${q.n} | ${q.x.length > 150 ? q.x.slice(0, q.x.lastIndexOf(' ', 150)) + ' …' : q.x} | |`), '');
}
writeFileSync(mdOut, md.join('\n'));
console.log('written', questions.length, 'questions');
