import fs from 'node:fs';
import opentype from 'opentype.js';

// Geist, vendored so the daily build needs nothing but opentype.js.
const fontFile = (w) => new URL(`./assets/fonts/geist-${w}.woff`, import.meta.url);
export const FIGURE_WEIGHT = 500;
// Figure sizes: one HERO number leads each card, KPI tiles sit under it, STAT for strips.
// Kept close together (1.5x, 1.25x): bigger jumps shout over the README's 16px body text.
export const HERO = 36;
export const KPI = 24;
export const STAT = 19;
// One tile row: label baseline, figure baseline, caption baseline (before the header lift).
export const TILE = { label: 60, figure: 98, sub: 118 };
const fonts = Object.fromEntries(
  [400, 500, 600].map((w) => {
    const buf = fs.readFileSync(fontFile(w));
    return [w, opentype.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength))];
  }),
);

// GitHub renders README images over these surfaces, so tokens are checked against them.
// Text has three roles, used the same way on every card:
//   ink  — the data: figures, names in lists, titles, chart marks
//   ink2 — structure: card names, chart headings, values beside a name, body copy
//   ink3 — meta: labels over figures, units, captions, axes, legends, percentages, dates
// Colours are GitHub's own (@primer/primitives 11.10, functional dark/light themes):
// surface = bgColor-default, ink = fgColor-default, ink3 = fgColor-muted,
// ink2 = base neutral 10 (the scale step just above muted, in both themes),
// rule = borderColor-muted (borderColor-default at 70%) flattened onto the canvas.
export const THEMES = {
  dark: { surface: '#0d1117', ink: '#f0f6fc', ink2: '#b1bac4', ink3: '#7d8590', rule: '#2f353d', empty: 0.1, up: '#3fb950', down: '#f85149' },
  light: { surface: '#ffffff', ink: '#1f2328', ink2: '#424a53', ink3: '#6e7781', rule: '#dfe4e9', empty: 0.08, up: '#1a7f37', down: '#d1242f' },
};

export const PAD = 6;
const HEADER_LIFT = 12;
export const FULL = 840;
export const HALF = 392; // one column of the two-column Coding card

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

export function measure(str, size, weight = 400, tracking = 0) {
  const font = fonts[weight];
  const scale = size / font.unitsPerEm;
  const glyphs = font.stringToGlyphs(str);
  const xs = [];
  let x = 0;
  glyphs.forEach((g, i) => {
    xs.push(x);
    x += g.advanceWidth * scale;
    if (i < glyphs.length - 1) x += font.getKerningValue(g, glyphs[i + 1]) * scale + tracking * size;
  });
  return { glyphs, xs, width: x };
}

// One SVG document. Text becomes outlines (README images can't load web fonts),
// and each glyph outline is defined once and reused.
export class Doc {
  constructor(theme, width) {
    this.t = THEMES[theme];
    this.W = width;
    this.parts = [];
    this.defs = new Map();
  }

  add(svg) {
    this.parts.push(svg);
  }

  text(str, { x, y, size, weight = 500, tracking = 0, anchor = 'start', fill = 'ink', opacity }) {
    const { glyphs, xs, width } = measure(str, size, weight, tracking);
    const x0 = anchor === 'end' ? x - width : anchor === 'middle' ? x - width / 2 : x;
    const upm = fonts[weight].unitsPerEm;
    const uses = glyphs.flatMap((g, i) => {
      if (!g.path.commands.length) return [];
      const id = `g${weight}-${g.index}`;
      if (!this.defs.has(id)) this.defs.set(id, `<path id="${id}" d="${g.getPath(0, 0, upm).toPathData(0)}"/>`);
      return [`<use href="#${id}" transform="translate(${(x0 + xs[i]).toFixed(2)} ${y}) scale(${+(size / upm).toFixed(5)})"/>`];
    });
    const op = opacity === undefined ? '' : ` fill-opacity="${opacity}"`;
    this.add(`<g fill="${this.t[fill] ?? fill}"${op}>${uses.join('')}</g>`);
    return width;
  }

  rule(y, x1 = PAD, x2 = this.W - PAD) {
    this.add(`<rect x="${x1}" y="${y}" width="${(x2 - x1).toFixed(2)}" height="1" fill="${this.t.rule}"/>`);
  }

  rect(x, y, w, h, { fill = 'ink', opacity = 1, rx = 0 } = {}) {
    const op = opacity === 1 ? '' : ` fill-opacity="${+opacity.toFixed(3)}"`;
    const r = rx ? ` rx="${rx}"` : '';
    this.add(`<rect x="${+x.toFixed(2)}" y="${+y.toFixed(2)}" width="${+Math.max(w, 0).toFixed(2)}" height="${+Math.max(h, 0).toFixed(2)}"${r} fill="${this.t[fill] ?? fill}"${op}/>`);
  }

  // Eyebrow label and right-hand meta. No rule under them: svg() lifts everything drawn
  // after the header by HEADER_LIFT so the content sits close to its label.
  header(label, meta) {
    // A title, not another caps label: it has to outrank the KPI labels under it.
    this.text(label, { x: PAD, y: 18, size: 14, weight: 600 });
    if (meta) this.text(meta, { x: this.W - PAD, y: 18, size: 11, weight: 500, tracking: 0.02, anchor: 'end', fill: 'ink3' });
    this.bodyStart = this.parts.length;
  }

  // Stat labels in sentence case: tracked caps at 10.5px read as noise and are slow to scan.
  label(str, x, y, anchor = 'start') {
    return this.text(str, { x, y, size: 12, weight: 500, anchor, fill: 'ink2' });
  }

  // Big figure with an optional smaller unit after it.
  figure(value, unit, x, y, size = KPI) {
    const w = this.text(value, { x: x - size * 0.04, y, size, weight: FIGURE_WEIGHT, tracking: -0.03 });
    if (unit) this.text(unit, { x: x - size * 0.04 + w + Math.max(5, size * 0.15), y, size: Math.max(12, size * 0.35), fill: 'ink3' });
  }

  // Squares sharing one size and opacity, drawn from a single shared shape.
  squares(points, size, opacity) {
    if (!points.length) return;
    const id = `sq${size.toFixed(2).replace('.', '_')}`;
    if (!this.defs.has(id)) this.defs.set(id, `<rect id="${id}" width="${size.toFixed(2)}" height="${size.toFixed(2)}" rx="${Math.min(2, size / 5).toFixed(2)}"/>`);
    const uses = points.map(([x, y]) => `<use href="#${id}" x="${x.toFixed(2)}" y="${y.toFixed(2)}"/>`).join('');
    this.add(`<g fill="${this.t.ink}" fill-opacity="${+opacity.toFixed(3)}">${uses}</g>`);
  }

  // Draws another card's SVG at (x, y). Def ids name their content (glyph or square size), so
  // shared ones are kept once.
  place(svg, x, y) {
    const [, defs, body] = svg.match(/<defs>([\s\S]*?)<\/defs>\n([\s\S]*)<\/svg>/);
    for (const [def, id] of defs.matchAll(/<\w+ id="([^"]+)"[^>]*\/>/g)) if (!this.defs.has(id)) this.defs.set(id, def);
    this.add(`<g transform="translate(${x} ${y})">${body.trim()}</g>`);
  }

  svg(height, title, desc) {
    if (this.bodyStart !== undefined) {
      const body = this.parts.splice(this.bodyStart);
      this.parts.push(`<g transform="translate(0 -${HEADER_LIFT})">${body.join('\n')}</g>`);
      height -= HEADER_LIFT;
    }
    const H = Math.ceil(height);
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${this.W}" height="${H}" viewBox="0 0 ${this.W} ${H}" role="img" aria-labelledby="title desc">
<title id="title">${esc(title)}</title>
<desc id="desc">${esc(desc)}</desc>
<defs>${[...this.defs.values()].join('')}</defs>
${this.parts.join('\n')}
</svg>
`;
  }
}

export const fmt = (n) => Math.round(n).toLocaleString('en-US');

export function duration(seconds) {
  const m = Math.round(seconds / 60);
  const h = Math.floor(m / 60);
  if (!h) return `${m}m`;
  return m % 60 ? `${h}h ${m % 60}m` : `${h}h`;
}

export const monthYear = (iso) => new Date(`${iso.slice(0, 10)}T00:00:00Z`).toLocaleString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });
export const monthShort = (iso) => new Date(`${iso.slice(0, 10)}T00:00:00Z`).toLocaleString('en-US', { month: 'short', timeZone: 'UTC' });
// Fixed names: ICU's en-GB writes "Sept", which breaks the three-letter rhythm.
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const utc = (iso) => new Date(`${iso.slice(0, 10)}T00:00:00Z`);
export const dayMonth = (iso) => `${utc(iso).getUTCDate()} ${MONTHS[utc(iso).getUTCMonth()]}`;
export const weekdayDate = (iso) => `${WEEKDAYS[utc(iso).getUTCDay()]} ${dayMonth(iso)}`;
export const fullDate = (iso) => `${dayMonth(iso)} ${utc(iso).getUTCFullYear()}`;

const lum = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
export const contrast = (a, b) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};
