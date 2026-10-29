// README hero: name and bio on the left, a disassembler graph view on the right — a small
// function that checks a PE file's 'MZ' header, stepped through like a debugger.
import fs from 'node:fs';
import opentype from 'opentype.js';
import { Doc, THEMES, PAD, measure } from './lib.mjs';

const W = 840;
const H = 282;

const monoBuf = fs.readFileSync(new URL('./assets/fonts/geist-mono-400.woff', import.meta.url));
const mono = opentype.parse(monoBuf.buffer.slice(monoBuf.byteOffset, monoBuf.byteOffset + monoBuf.byteLength));

// Geist Mono, outlined like the rest; glyph ids are prefixed so they can't clash with Geist's.
function monoText(doc, str, { x, y, size, fill = 'ink', opacity }) {
  const scale = size / mono.unitsPerEm;
  let cx = x;
  const uses = [];
  for (const g of mono.stringToGlyphs(str)) {
    if (g.path.commands.length) {
      const id = `m${g.index}`;
      if (!doc.defs.has(id)) doc.defs.set(id, `<path id="${id}" d="${g.getPath(0, 0, mono.unitsPerEm).toPathData(0)}"/>`);
      uses.push(`<use href="#${id}" transform="translate(${cx.toFixed(2)} ${y}) scale(${+scale.toFixed(5)})"/>`);
    }
    cx += g.advanceWidth * scale;
  }
  const op = opacity === undefined ? '' : ` fill-opacity="${opacity}"`;
  doc.add(`<g fill="${doc.t[fill] ?? fill}"${op}>${uses.join('')}</g>`);
  return cx - x;
}

const CODE = 10.5;
const LINE = 13.5;
const HEAD = 19;
const COL = 8 * CODE * 0.6; // operands start after an 8-character mnemonic column

// Basic blocks of the graph. `rows` are [mnemonic, operands, comment].
const BLOCKS = {
  A: { x: 520, y: 14, w: 250, title: 'sub_140001A20', rows: [['push', 'rbp'], ['mov', 'rbp, rsp'], ['cmp', 'word [rcx], 0x5A4D', "; 'MZ'"], ['jne', 'loc_140001A90']] },
  B: { x: 442, y: 120, w: 218, title: 'loc_140001A34', rows: [['mov', 'eax, [rcx+0x3C]'], ['add', 'rax, rcx'], ['call', 'parse_nt_headers'], ['pop', 'rbp'], ['ret']] },
  C: { x: 676, y: 120, w: 158, title: 'loc_140001A90', rows: [['xor', 'eax, eax'], ['pop', 'rbp'], ['ret']], dim: true },
};
const BREAK = ['B', 2]; // breakpoint on the call
for (const b of Object.values(BLOCKS)) b.h = HEAD + b.rows.length * LINE + 8;
const rowY = (b, i) => b.y + HEAD + 4 + i * LINE; // top of row i
const rowMid = (b, i) => rowY(b, i) - 1 + LINE / 2; // centre of the row's highlight
// The listing is lowercase, so centre the x-height on the row: text, dot and arrow then line up.
const baseline = (b, i) => rowMid(b, i) + ((mono.tables.os2.sxHeight / mono.unitsPerEm) * CODE) / 2;
// Gutter: IP arrow, then the breakpoint dot, then the listing.
const GUT = { arrow: 5, dot: 13.5, text: 20 };
const DOT_R = 2;

// The path the "debugger" steps through: A, then the fall-through into B. It lingers on the breakpoint.
const TRACE = [...BLOCKS.A.rows.map((_, i) => ['A', i]), ...BLOCKS.B.rows.map((_, i) => ['B', i])];
const STEP = 0.65;
const HOLD = (key, i) => (key === BREAK[0] && i === BREAK[1] ? 3 : 1);
const SPANS = [];
{
  let at = 0;
  for (const [key, i] of TRACE) {
    SPANS.push([at, at + HOLD(key, i) * STEP]);
    at += HOLD(key, i) * STEP;
  }
}
const CYCLE = SPANS.at(-1)[1];
const REST = 6; // the breakpoint row stays lit when motion is reduced

// ── Bio stickers ──
const lucide = (name) => [...fs.readFileSync(new URL(`./node_modules/lucide-static/icons/${name}.svg`, import.meta.url), 'utf8').matchAll(/<path[^>]* d="([^"]+)"/g)].map((m) => m[1]);
const STICKERS = {
  make: { colour: '#1f883d', icon: lucide('wrench') },
  break: { colour: '#da3633', icon: lucide('zap') },
};
const TILTS = [-2.5, 2, -2, 2.5];
const BIO = 18;

// Draws a line of plain text and stickers; returns nothing. Stickers sit centred on the
// line's x-height and are rotated about their own centre.
function bioLine(doc, x, y, parts) {
  let cx = x;
  for (const part of parts) {
    const sticker = STICKERS[part];
    if (!sticker) {
      cx += doc.text(part, { x: cx, y, size: BIO, weight: 400, fill: 'ink2' });
      continue;
    }
    const size = 15;
    const icon = 12;
    const padX = 7;
    const h = 23;
    const textW = measure(part, size, 600).width;
    const w = padX + icon + 5 + textW + padX;
    const left = cx + 3;
    const mid = y - BIO * 0.27; // x-height centre of the surrounding text
    const top = mid - h / 2;
    const tilt = TILTS[doc.stickerCount = (doc.stickerCount ?? -1) + 1];
    const start = doc.parts.length;
    doc.text(part, { x: left + padX + icon + 5, y: +(mid + size * 0.36).toFixed(2), size, weight: 600, fill: '#ffffff' });
    const label = doc.parts.splice(start).join('');
    const s = icon / 24;
    doc.add(`<g transform="rotate(${tilt} ${(left + w / 2).toFixed(1)} ${mid.toFixed(1)})">` +
      `<rect x="${left.toFixed(1)}" y="${top.toFixed(1)}" width="${w.toFixed(1)}" height="${h}" rx="5" fill="${sticker.colour}"/>` +
      `<g transform="translate(${(left + padX).toFixed(1)} ${(mid - icon / 2).toFixed(1)}) scale(${s})" fill="none" stroke="#ffffff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">${sticker.icon.map((d) => `<path d="${d}"/>`).join('')}</g>` +
      `${label}</g>`);
    cx = left + w + 3;
  }
}

function render(theme) {
  const doc = new Doc(theme, W);
  const t = doc.t;
  const dark = theme === 'dark';

  // ── Left: name and bio ──
  doc.text('HELLO WORLD, I AM', { x: PAD, y: 72, size: 11, weight: 600, tracking: 0.16, fill: 'ink3' });
  doc.text('Tarun', { x: PAD - 4, y: 146, size: 80, weight: 500, tracking: -0.035 });
  // Bio with "make" and "break" as tilted stickers: green to build, red to break, identical in
  // both themes. Primer's emphasis fills for white text: bgColor-success-emphasis (light) and
  // bgColor-danger-emphasis (dark), the same red as the breakpoint hit.
  bioLine(doc, PAD, 186, ['I ', 'make', ' things, ', 'break', ' things,']);
  bioLine(doc, PAD, 218, ['and ', 'make', ' things that ', 'break', ' things.']);
  doc.text('Reverse engineering · AI systems · Developer tools', { x: PAD, y: 273, size: 12, fill: 'ink3' });
  doc.text('github.com/tanu360', { x: W - PAD, y: 273, size: 12, anchor: 'end', fill: 'ink3' });

  // ── Right: graph canvas — a faint dot grid that fades in from the text side ──
  doc.defs.set('fade', `<linearGradient id="fadeX" x1="436" x2="840" y1="0" y2="0" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset="0.25" stop-color="#fff"/><stop offset="1" stop-color="#fff"/></linearGradient><mask id="fade"><rect x="0" y="0" width="${W}" height="${H}" fill="url(#fadeX)"/></mask>`);
  const dots = [];
  for (let y = 10; y <= 238; y += 12) for (let x = 440; x <= W - PAD; x += 12) dots.push(`M${x} ${y}h1v1h-1z`);
  doc.add(`<path d="${dots.join('')}" fill="${t.ink}" fill-opacity="${dark ? 0.22 : 0.2}" mask="url(#fade)"/>`);

  // Edges first, so blocks sit on top. Disassembler colours: green where the jne is taken,
  // red for the fall-through. The trace takes the fall-through; the skipped edge is dashed.
  // Primer fgColor-success / fgColor-danger for the theme.
  const green = dark ? '#3fb950' : '#1a7f37';
  const red = dark ? '#f85149' : '#d1242f';
  const edge = (d, colour, op, dash) => doc.add(`<path d="${d}" fill="none" stroke="${colour}" stroke-opacity="${op}" stroke-width="1.3"${dash ? ' stroke-dasharray="3 3"' : ''}/>`);
  const arrow = (x, y, colour, op) => doc.add(`<path d="M${x - 3.5} ${y - 6}L${x} ${y}L${x + 3.5} ${y - 6}Z" fill="${colour}" fill-opacity="${op}"/>`);
  const { A, B, C } = BLOCKS;
  const bx = B.x + B.w / 2;
  const cx = C.x + C.w / 2;
  edge(`M${bx} ${A.y + A.h}V${B.y}`, red, 0.9);
  arrow(bx, B.y, red, 0.9);
  edge(`M${cx} ${A.y + A.h}V${C.y}`, green, 0.55, true);
  arrow(cx, C.y, green, 0.55);

  // Blocks: surface fill hides the grid, a header strip with the label, then the listing.
  for (const b of Object.values(BLOCKS)) {
    const op = b.dim ? 0.55 : 1;
    doc.add(`<g opacity="${op}"><rect x="${b.x + 0.5}" y="${b.y + 0.5}" width="${b.w - 1}" height="${b.h - 1}" rx="5" fill="${t.surface}" stroke="${t.ink}" stroke-opacity="${dark ? 0.3 : 0.24}"/>` +
      `<path d="M${b.x + 1} ${b.y + HEAD - 2}H${b.x + b.w - 1}" stroke="${t.ink}" stroke-opacity="${dark ? 0.16 : 0.12}"/></g>`);
  }

  // The breakpoint line gets a faint red wash, as a disassembler marks it.
  const [bk, bi] = BREAK;
  doc.add(`<rect x="${BLOCKS[bk].x + 3}" y="${rowY(BLOCKS[bk], bi) - 1}" width="${BLOCKS[bk].w - 6}" height="${LINE}" rx="2.5" fill="${red}" fill-opacity="${dark ? 0.16 : 0.1}"/>`);

  // The instruction pointer: one highlight per traced row, each lit for its own span of the cycle.
  const ipArrow = (b, i, fill) => `<path d="M${b.x + GUT.arrow} ${(rowMid(b, i) - 3).toFixed(2)}l4 3l-4 3z" fill="${fill}"/>`;
  const hitIndex = TRACE.findIndex(([key, i]) => key === bk && i === bi);
  const ipRows = TRACE.map(([key, i], n) => {
    if (n === hitIndex) return ''; // drawn above the text instead, see below
    const b = BLOCKS[key];
    return `<g class="ip ip${n}${n === REST ? ' ip-rest' : ''}"><rect x="${b.x + 3}" y="${rowY(b, i) - 1}" width="${b.w - 6}" height="${LINE}" rx="2.5" fill="${t.ink}" fill-opacity="${dark ? 0.12 : 0.08}"/>${ipArrow(b, i, t.ink)}</g>`;
  });
  doc.add(ipRows.join(''));

  for (const b of Object.values(BLOCKS)) {
    const op = b.dim ? 0.55 : undefined;
    monoText(doc, b.title, { x: b.x + 10, y: +(b.y + (HEAD - 2) / 2 + ((mono.tables.os2.sCapHeight / mono.unitsPerEm) * 9.5) / 2).toFixed(2), size: 9.5, fill: 'ink3', opacity: op });
    b.rows.forEach(([mn, args, note], i) => {
      const y = +baseline(b, i).toFixed(2);
      const x = b.x + GUT.text;
      monoText(doc, mn, { x, y, size: CODE, fill: 'ink', opacity: op });
      let w = 0;
      if (args) w = monoText(doc, args, { x: x + COL, y, size: CODE, fill: 'ink2', opacity: op });
      if (note) monoText(doc, note, { x: x + COL + w + 8, y, size: CODE, fill: 'ink3', opacity: op });
    });
  }

  // Breakpoint dot in the gutter, centred on the row.
  const hb = BLOCKS[bk];
  doc.add(`<circle cx="${hb.x + GUT.dot}" cy="${rowMid(hb, bi).toFixed(2)}" r="${DOT_R}" fill="${red}"/>`);

  // Breakpoint hit: the same solid red with white text in both themes, drawn over everything.
  // Primer bgColor-danger-emphasis (dark) with fgColor-onEmphasis.
  const HIT = '#da3633';
  const [hmn, hargs] = hb.rows[bi];
  const hitDoc = { t, defs: doc.defs, add: (svg) => hitParts.push(svg) };
  const hitParts = [];
  monoText(hitDoc, hmn, { x: hb.x + GUT.text, y: +baseline(hb, bi).toFixed(2), size: CODE, fill: '#ffffff' });
  monoText(hitDoc, hargs, { x: hb.x + GUT.text + COL, y: +baseline(hb, bi).toFixed(2), size: CODE, fill: '#ffffff' });
  doc.add(`<g class="ip ip${hitIndex}${hitIndex === REST ? ' ip-rest' : ''}"><rect x="${hb.x + 3}" y="${rowY(hb, bi) - 1}" width="${hb.w - 6}" height="${LINE}" rx="2.5" fill="${HIT}"/>${ipArrow(hb, bi, '#ffffff')}<circle cx="${hb.x + GUT.dot}" cy="${rowMid(hb, bi).toFixed(2)}" r="${DOT_R}" fill="#ffffff"/>${hitParts.join('')}</g>`);

  const pct = (v) => ((v / CYCLE) * 100).toFixed(3);
  const frames = SPANS.map(([a, b], n) => `.ip${n}{animation:ip${n} ${CYCLE.toFixed(2)}s steps(1,end) infinite}@keyframes ip${n}{${a ? `0%{opacity:0}${pct(a)}%{opacity:1}` : '0%{opacity:1}'}${pct(b)}%{opacity:0}100%{opacity:0}}`).join('');
  const css = `<style>.ip{opacity:0}${frames}@media (prefers-reduced-motion:reduce){.ip{animation:none!important;opacity:0}.ip-rest{opacity:1}}</style>`;
  const svg = doc.svg(H, 'Hello World, I am Tarun', 'I make things, break things, and make things that break things. Reverse engineering, AI systems and developer tools. Illustration: a disassembler graph of a function that checks a PE file\'s MZ header, stepped through one instruction at a time and pausing on a breakpoint.');
  return svg.replace('<defs>', `${css}\n<defs>`);
}

const outDir = process.argv[2] || new URL('../../profile', import.meta.url).pathname;
for (const theme of Object.keys(THEMES)) {
  const svg = render(theme);
  fs.writeFileSync(`${outDir}/hero-${theme}.svg`, svg);
  console.log(`hero-${theme}.svg ${(svg.length / 1024).toFixed(1)} KB`);
}
