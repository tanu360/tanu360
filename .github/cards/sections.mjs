// Section headings that split the README into chapters: a hairline, a number, the title and
// a one-line summary. They carry the only full-width lines on the page.
// node sections.mjs [outDir]  →  section-<id>-{dark,light}.svg
import fs from 'node:fs';
import { Doc, THEMES, PAD, FULL, HALF, measure } from './lib.mjs';

const outDir = process.argv[2] || new URL('../../profile', import.meta.url).pathname;

const SECTIONS = [
  { id: 'about', title: 'About', note: 'security research, AI and engineering' },
  { id: 'coding', title: 'Coding', note: 'time tracked with Wakapi and WakaTime' },
  { id: 'github', title: 'GitHub', note: 'contributions, activity and stargazers' },
  { id: 'skills', title: 'Skills', note: 'languages, domains and tools' },
  { id: 'work', title: 'Work', note: 'selected projects and open source' },
];

const H = 56;
const BASE = 44;

// A phone version at the cards' phone width, so the heading keeps its size next to body text
// instead of shrinking with a full-width image.
const WIDTHS = { '': FULL, '-mobile': HALF };

SECTIONS.forEach((sec, i) => {
  const num = String(i + 1).padStart(2, '0');
  for (const [suffix, W] of Object.entries(WIDTHS)) {
    const titleEnd = PAD + 26 + measure(sec.title, 20, 600, -0.02).width;
    if (titleEnd + 24 > W - PAD - measure(sec.note, 12, 500).width) throw new Error(`section ${sec.id}: note meets the title at ${W}px`);
    for (const theme of Object.keys(THEMES)) {
      const doc = new Doc(theme, W);
      doc.rule(0);
      doc.text(num, { x: PAD, y: BASE, size: 11.5, weight: 600, tracking: 0.08, fill: 'ink3' });
      doc.text(sec.title, { x: PAD + 26, y: BASE, size: 20, weight: 600, tracking: -0.02 });
      doc.text(sec.note, { x: W - PAD, y: BASE, size: 12, anchor: 'end', fill: 'ink3' });
      fs.writeFileSync(`${outDir}/section-${sec.id}${suffix}-${theme}.svg`, doc.svg(H, `${num} ${sec.title}`, `${sec.title}: ${sec.note}`));
    }
  }
});
console.log(`sections: ${SECTIONS.map((s) => s.id).join(', ')}`);
