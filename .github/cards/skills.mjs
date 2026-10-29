// The README's Skills card: a spec sheet with an icon before every item.
// node skills.mjs [outDir]  →  skills-{dark,light}.svg
import fs from 'node:fs';
import svgpath from 'svgpath';
import * as simpleIcons from 'simple-icons';
import { Doc, THEMES, PAD, FULL, HALF, measure } from './lib.mjs';

const here = (p) => new URL(p, import.meta.url);

// Groups and items as they appear in the README, in README order.
const GROUPS = [
  ['Languages', ['Rust', 'Go', 'Python', 'JavaScript', 'TypeScript', 'C#', 'Swift', 'Objective-C', 'Dart', 'C', 'C++', 'Kotlin', 'Java', 'SQL', 'HTML', 'CSS']],
  ['Core Domains', ['Reversing', 'Binary Analysis', 'Software Protection', 'Vulnerability Research']],
  ['Low-Level Specialization', ['Assembly Analysis', 'Devirtualization', 'Deobfuscation', 'Dynamic Instrumentation']],
  ['Security Areas', ['Mobile Security', 'API Security', 'WebAssembly', 'DLL / Dylib Engineering']],
  ['Applied Engineering', ['AI / ML', 'Data Automation', 'API Development', 'Cloudflare Workers']],
  ['Interface Work', ['UI / UX', 'Prompt Engineering', 'Social Media Bots', 'MQL5 / Trading Systems']],
  ['Frontend', ['React', 'Next.js', 'Tailwind', 'Vite', 'Webpack', 'Dart', 'React Native', 'Flutter']],
  ['Backend', ['Node.js', 'Express', 'NestJS', 'FastAPI', 'Flask', 'Django', '.NET', 'GraphQL']],
  ['Databases', ['PostgreSQL', 'MongoDB', 'SQLite', 'MySQL', 'Redis', 'Cassandra', 'Elasticsearch', 'Firebase']],
  ['Tools', ['Git', 'Linux', 'Docker', 'Postman', 'VS Code', 'Jupyter', 'GitHub', 'npm']],
  ['Software', ['IDA Pro', 'Ghidra', 'Binary Ninja', 'Frida', 'x64dbg', 'Hopper', 'LLDB', 'Wireshark']],
  ['Cloud & Infra', ['Cloudflare Workers', 'AWS', 'Azure', 'Google Cloud', 'Nginx', 'Snowflake']],
].map(([name, items], i) => ({ name, label: name[0] + name.slice(1).toLowerCase(), items, practice: i >= 1 && i <= 5 }));

// Simple Icons slugs. Items it has no usable mark for get one from Devicon or Lucide
// in MARKS below.
const ICONS = {
  Rust: 'rust', Go: 'go', Python: 'python', JavaScript: 'javascript', TypeScript: 'typescript', Swift: 'swift', Dart: 'dart', C: 'c', 'C++': 'cplusplus',
  Kotlin: 'kotlin', HTML: 'html5', CSS: 'css', React: 'react', 'Next.js': 'nextdotjs', Tailwind: 'tailwindcss', Vite: 'vite', Webpack: 'webpack',
  'React Native': 'react', Flutter: 'flutter', 'Node.js': 'nodedotjs', NestJS: 'nestjs', FastAPI: 'fastapi', Flask: 'flask', Django: 'django',
  GraphQL: 'graphql', PostgreSQL: 'postgresql', MongoDB: 'mongodb', SQLite: 'sqlite', Redis: 'redis',
  Elasticsearch: 'elasticsearch', Firebase: 'firebase', Git: 'git', Linux: 'linux', Docker: 'docker', Postman: 'postman', Jupyter: 'jupyter', GitHub: 'github', npm: 'npm',
  Wireshark: 'wireshark', 'Cloudflare Workers': 'cloudflareworkers', 'Google Cloud': 'googlecloud', Nginx: 'nginx', Snowflake: 'snowflake', WebAssembly: 'webassembly',
};
const bySlug = Object.fromEntries(Object.values(simpleIcons).filter((i) => i?.slug).map((i) => [i.slug, i]));

const r2 = (n) => +n.toFixed(2);
const r1 = (n) => +n.toFixed(1);
// Geist cap height is 0.71em; centring caps puts text optically in the middle of a box.
const baseline = (top, h, size) => r2(top + h / 2 + (0.71 * size) / 2);
const textW = (s, size, weight = 500) => measure(s, size, weight).width;

// Wrap in order, starting a new row when the next item would overflow…
function greedy(widths, maxW, gap) {
  const rows = [[]];
  let x = 0;
  widths.forEach((w, i) => {
    if (rows.at(-1).length && x + w > maxW + 0.01) {
      rows.push([]);
      x = 0;
    }
    rows.at(-1).push({ i, x, w });
    x += w + gap;
  });
  return rows;
}

// …then balance like `text-wrap: balance`: the narrowest width that keeps the same
// number of rows, so 16 languages split 8 + 8 rather than 13 + 3.
function flow(widths, maxW, gap) {
  const n = greedy(widths, maxW, gap).length;
  if (n < 2) return greedy(widths, maxW, gap);
  let [lo, hi] = [Math.max(...widths), maxW];
  while (hi - lo > 0.5) {
    const mid = (lo + hi) / 2;
    if (greedy(widths, mid, gap).length <= n) hi = mid;
    else lo = mid;
  }
  return greedy(widths, hi, gap);
}

// Fill each row before wrapping, but never leave one item alone on the last row:
// narrow the measure just enough to pull a second item down with it.
function fill(widths, maxW, gap) {
  let rows = greedy(widths, maxW, gap);
  for (let w = maxW; rows.length > 1 && rows.at(-1).length < 2 && w > Math.max(...widths); w -= 2) {
    const next = greedy(widths, w, gap);
    if (next.length > rows.length) break;
    rows = next;
  }
  return rows;
}

// Rows of one group laid out from (x, top) within width W; returns the bottom edge.
function items(doc, style, group, x0, top, W) {
  const widths = group.items.map((s) => style.width(s, group));
  // Styles can opt out of balancing and simply fill each row before wrapping.
  const rows = style.wrap === 'fill' ? fill(widths, W, style.gap) : flow(widths, W, style.gap);
  rows.forEach((row, r) => {
    const y = top + r * (style.h + style.rowGap);
    row.forEach(({ i, x, w }, k) => {
      if (k && style.sep) style.sep(doc, x0 + x, y);
      style.draw(doc, group.items[i], x0 + x, y, w, group);
    });
  });
  return top + rows.length * style.h + (rows.length - 1) * style.rowGap;
}

const SPEC_LABEL_W = 220;

// ── Spec sheet with icons ───────────────────────────────────────────────────
// An icon before every item, fitted into one square box and drawn in the theme's ink2.
// Brand marks first (Simple Icons, then single-colour Devicon); a Lucide line icon
// for practices and for tools with no mark that reads at 13px. Only geometry is taken
// from the sources (path data, fill-rule, Lucide shape attributes); every colour is
// set here from the theme.
const lu = (name) => ({ lucide: name });
const MARKS = {
  ...Object.fromEntries(Object.entries(ICONS).map(([item, slug]) => [item, { si: slug }])),
  'Objective-C': { si: 'apple' },
  'C#': { dev: 'csharp/csharp-plain' },
  Java: { dev: 'java/java-plain' },
  '.NET': { dev: 'dot-net/dot-net-plain' },
  Express: { dev: 'express/express-original' },
  'VS Code': { dev: 'vscode/vscode-plain' },
  AWS: { dev: 'amazonwebservices/amazonwebservices-plain' },
  Azure: { dev: 'azure/azure-plain' },
  // Devicon's dolphin is drawn in hairlines; a 0.6px outline in the same ink gives it the weight to read at 13px.
  MySQL: { dev: 'mysql/mysql-original', thicken: 0.6 },
  // Cassandra's eye shrinks to a 13×5px smudge, and the Ghidra and LLVM dragons to blobs; Lucide stands in.
  Cassandra: lu('eye'),
  SQL: lu('database'),
  'IDA Pro': lu('scan-search'),
  Ghidra: lu('file-code'),
  'Binary Ninja': lu('square-code'),
  Frida: lu('syringe'),
  x64dbg: lu('bug-play'),
  Hopper: lu('file-search'),
  LLDB: lu('square-terminal'),
  'Reversing': lu('undo-2'),
  'Binary Analysis': lu('binary'),
  'Software Protection': lu('shield-check'),
  'Vulnerability Research': lu('bug'),
  'Assembly Analysis': lu('cpu'),
  Devirtualization: lu('layers'),
  Deobfuscation: lu('scan-text'),
  'Dynamic Instrumentation': lu('activity'),
  'Mobile Security': lu('smartphone'),
  'API Security': lu('shield-half'),
  'DLL / Dylib Engineering': lu('puzzle'),
  'AI / ML': lu('brain-circuit'),
  'Data Automation': lu('workflow'),
  'API Development': lu('webhook'),
  'UI / UX': lu('pen-tool'),
  'Prompt Engineering': lu('message-square-code'),
  'Social Media Bots': lu('bot'),
  'MQL5 / Trading Systems': lu('chart-candlestick'),
};

// One-colour Devicon file → a single outline. Refuses anything with a second colour
// or shapes other than <path>, so a multi-colour mark can't slip in recoloured.
function devicon(file) {
  const svg = fs.readFileSync(here(`./node_modules/devicon/icons/${file}.svg`), 'utf8');
  const fills = new Set([...svg.matchAll(/fill="([^"]+)"/g)].map((m) => m[1].toLowerCase()).filter((f) => f !== 'none'));
  if (fills.size > 1 || /<(circle|rect|ellipse|polygon|polyline|line|use|image|linearGradient|radialGradient|style)\b/.test(svg)) throw new Error(`${file} is not a single-colour path mark`);
  const paths = [...svg.matchAll(/<path\b([^>]*)>/g)].map(([, attrs]) => ({ d: attrs.match(/\sd="([^"]+)"/)[1], evenodd: /evenodd/.test(attrs) }));
  return { d: paths.map((p) => p.d).join(''), evenodd: paths.some((p) => p.evenodd) };
}

// Lucide icon (24px grid, 2px padding) → one path, shapes converted, each piece made
// absolute so they can be joined.
const LUCIDE = JSON.parse(fs.readFileSync(here('./node_modules/lucide-static/icon-nodes.json')));
function lucide(name) {
  if (!LUCIDE[name]) throw new Error(`no Lucide icon "${name}"`);
  return LUCIDE[name]
    .map(([el, a]) => {
      const n = (k) => +(a[k] ?? 0);
      let d;
      if (el === 'path') d = a.d;
      else if (el === 'line') d = `M${n('x1')} ${n('y1')}L${n('x2')} ${n('y2')}`;
      else if (el === 'polyline' || el === 'polygon') {
        const p = a.points.trim().split(/[\s,]+/).map(Number);
        d = `M${p[0]} ${p[1]}${p.slice(2).map((v, i) => (i % 2 ? ` ${v}` : `L${v}`)).join('')}${el === 'polygon' ? 'Z' : ''}`;
      } else if (el === 'circle' || el === 'ellipse') {
        const [rx, ry] = el === 'circle' ? [n('r'), n('r')] : [n('rx'), n('ry')];
        d = `M${n('cx') - rx} ${n('cy')}a${rx} ${ry} 0 1 0 ${2 * rx} 0a${rx} ${ry} 0 1 0 ${-2 * rx} 0Z`;
      } else if (el === 'rect') {
        const [x, y, w, h] = [n('x'), n('y'), n('width'), n('height')];
        const rx = Math.min(+(a.rx ?? a.ry ?? 0), w / 2);
        const ry = Math.min(+(a.ry ?? a.rx ?? 0), h / 2);
        const arc = (dx, dy) => (rx ? `a${rx} ${ry} 0 0 1 ${dx} ${dy}` : '');
        d = `M${x + rx} ${y}h${w - 2 * rx}${arc(rx, ry)}v${h - 2 * ry}${arc(-rx, ry)}h${-(w - 2 * rx)}${arc(-rx, -ry)}v${-(h - 2 * ry)}${arc(rx, -ry)}Z`;
      } else throw new Error(`Lucide ${name}: unsupported <${el}>`);
      return svgpath(d).abs().toString();
    })
    .join('');
}

// Bounding box of the drawn outline (curves sampled), so every mark fills the box
// the same way whatever padding its source viewBox has.
function bbox(d) {
  let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
  const add = (x, y) => {
    [x0, y0, x1, y1] = [Math.min(x0, x), Math.min(y0, y), Math.max(x1, x), Math.max(y1, y)];
  };
  svgpath(d).abs().unarc().unshort().iterate((seg, _, x, y) => {
    const [c, ...v] = seg;
    if (c === 'M' || c === 'L') add(v[0], v[1]);
    else if (c === 'H') add(v[0], y);
    else if (c === 'V') add(x, v[0]);
    else if (c === 'C' || c === 'Q') {
      const pts = [[x, y]];
      for (let k = 0; k < v.length; k += 2) pts.push([v[k], v[k + 1]]);
      const coef = pts.length === 4 ? [1, 3, 3, 1] : [1, 2, 1];
      const n = pts.length - 1;
      for (let t = 0; t <= 1; t += 1 / 32) {
        let [px, py] = [0, 0];
        pts.forEach(([a, b], k) => {
          const w = coef[k] * (1 - t) ** (n - k) * t ** k;
          px += w * a;
          py += w * b;
        });
        add(px, py);
      }
    }
  });
  return [x0, y0, x1, y1];
}

const MARK = 13; // square box every icon is fitted into
const MARK_GAP = 6; // box → text
const STROKE = 1.4; // Lucide line weight in px, to sit with the filled marks
// Solid squares read larger than open shapes at the same size, so they're drawn a little smaller.
const OPTICAL = { javascript: 0.86, typescript: 0.86, css: 0.86, npm: 0.86, webassembly: 0.86, swift: 0.88 };

const minify = (p) =>
  p.rel().round(1).toString()
    .replace(/(^|[^\d.])0\./g, '$1.')
    .replace(/ -/g, '-')
    .replace(/([a-zA-Z]) /g, '$1')
    .replace(/ ([a-zA-Z])/g, '$1')
    .replace(/(\.\d+) (?=\.)/g, '$1');

// Each icon is a <path> in <defs> carrying its own theme colour, so it can't fall back
// to the SVG default black in a renderer that drops inherited fills. Icons sit centred
// vertically and against the box's right edge, so every one is the same distance from
// its text; narrow icons give their slack to the gap before the item.
function markDef(doc, item) {
  const src = MARKS[item];
  if (!src) throw new Error(`spec-logos: no icon for "${item}"`);
  const key = src.si ?? src.lucide ?? src.dev.split('/')[0];
  const id = `mk-${src.lucide ? 'l' : ''}${key.replace(/[^a-z0-9]/g, '')}`;
  if (doc.defs.has(id)) return id;
  const ink = doc.t.ink2;
  if (src.lucide) {
    // Keep Lucide's 24px grid vertically (its icons are balanced on it), right-align the
    // drawing, and scale so the 20px live area plus the stroke fills the 13px box.
    const raw = lucide(src.lucide);
    const [x0, y0, x1, y1] = bbox(raw);
    const half = (MARK - STROKE) / 2;
    const s = Math.min(half / 10, (MARK - STROKE) / (x1 - x0), half / Math.max(12 - y0, y1 - 12));
    const d = minify(svgpath(raw).translate(-x1, -12).scale(s).translate(MARK - STROKE / 2, MARK / 2));
    doc.defs.set(id, `<path id="${id}" fill="none" stroke="${ink}" stroke-width="${STROKE}" stroke-linecap="round" stroke-linejoin="round" d="${d}"/>`);
  } else {
    const { d: raw, evenodd } = src.si ? { d: bySlug[src.si].path } : devicon(src.dev);
    const [x0, y0, x1, y1] = bbox(raw);
    const pad = src.thicken ?? 0;
    const box = MARK - pad;
    const s = (box / Math.max(x1 - x0, y1 - y0)) * (OPTICAL[key] ?? 1);
    const d = minify(svgpath(raw).translate(-x0, -y0).scale(s).translate(MARK - pad / 2 - (x1 - x0) * s, (MARK - (y1 - y0) * s) / 2));
    const outline = pad ? ` stroke="${ink}" stroke-width="${pad}" stroke-linejoin="round"` : '';
    doc.defs.set(id, `<path id="${id}" fill="${ink}"${evenodd ? ' fill-rule="evenodd"' : ''}${outline} d="${d}"/>`);
  }
  return id;
}

const EDGE = 8; // clear space kept before the right edge
const SPEC_SIZE = 12.5;
const specMark = {
  h: 22, gap: 14, rowGap: 6, wrap: 'fill',
  width: (s) => MARK + MARK_GAP + textW(s, SPEC_SIZE),
  draw(doc, s, x, top) {
    // Box centred on the cap height, i.e. on the same line as the label's caps.
    const boxTop = Math.round(top + this.h / 2 - MARK / 2);
    (doc.marks ??= []).push(`<use href="#${markDef(doc, s)}" x="${r2(x)}" y="${boxTop}"/>`);
    doc.text(s, { x: x + MARK + MARK_GAP, y: baseline(top, this.h, SPEC_SIZE), size: SPEC_SIZE });
    doc.right = Math.max(doc.right ?? 0, x + this.width(s));
  },
};

// Wide: group labels in a column on the left. Narrow (phones): each label sits above its items.
function specLogos(doc) {
  const narrow = doc.W < FULL;
  const x0 = narrow ? PAD : PAD + SPEC_LABEL_W;
  const W = doc.W - PAD - EDGE - x0;
  let y = 0;
  GROUPS.forEach((g) => {
    const top = y + 10;
    doc.label(g.label, PAD, baseline(top, specMark.h, 12.5));
    y = items(doc, specMark, g, x0, narrow ? top + 22 : top, W) + (narrow ? 20 : 15);
  });
  if (doc.right > doc.W - PAD - EDGE + 0.01) throw new Error(`spec-logos: an item reaches x=${doc.right.toFixed(1)}, past ${doc.W - PAD - EDGE}`);
  doc.add(`<g>${doc.marks.join('')}</g>`);
  return y - 10;
}

// doc.text() emits one translate+scale per glyph. A run shares its baseline and scale,
// so move those onto the group and leave each glyph an integer x in font units.
// Same outlines, same positions to within 1/80 px, about a third of the bytes.
function compact(svg) {
  const out = svg.replace(/<g fill="([^"]+)"((?: fill-opacity="[^"]+")?)>((?:<use href="#g[^"]+" transform="[^"]+"\/>)+)<\/g>/g, (all, fill, op, uses) => {
    const glyphs = [...uses.matchAll(/href="#([^"]+)" transform="translate\(([-\d.]+) ([-\d.]+)\) scale\(([\d.]+)\)"/g)].map(([, id, x, y, s]) => ({ id, x: +x, y, s }));
    if (new Set(glyphs.map((g) => `${g.y} ${g.s}`)).size !== 1) return all;
    const { y, s } = glyphs[0];
    const x0 = r1(glyphs[0].x);
    const body = glyphs.map((g) => {
      const dx = Math.round((g.x - glyphs[0].x) / s);
      return `<use href="#${g.id}"${dx ? ` x="${dx}"` : ''}/>`;
    });
    return `<g fill="${fill}"${op} transform="translate(${x0} ${y}) scale(${s})">${body.join('')}</g>`;
  });
  // Glyph and icon ids ("g500-123", "si-postgresql", "mk-redis") become a, b, … z, aa, …; each is referenced hundreds of times.
  const ids = [...new Set([...out.matchAll(/<path id="((?:g\d+-\d+)|(?:(?:si|mk)-[a-z0-9]+))"/g)].map((m) => m[1]))];
  const short = (i) => (i < 26 ? '' : short(Math.floor(i / 26) - 1)) + String.fromCharCode(97 + (i % 26));
  const map = new Map(ids.map((id, i) => [id, short(i)]));
  return out.replace(/(id="|href="#)((?:g\d+-\d+)|(?:(?:si|mk)-[a-z0-9]+))"/g, (m, pre, id) => `${pre}${map.get(id) ?? id}"`);
}

const outDir = process.argv[2] || here('../../profile').pathname;
const desc = GROUPS.map((g) => `${g.name}: ${g.items.join(', ')}.`).join(' ');
for (const [suffix, W] of Object.entries({ '': FULL, '-mobile': HALF })) {
  for (const theme of Object.keys(THEMES)) {
    const doc = new Doc(theme, W);
    const bottom = specLogos(doc);
    const svg = compact(doc.svg(bottom + PAD, 'Skills', desc));
    fs.writeFileSync(`${outDir}/skills${suffix}-${theme}.svg`, svg);
    console.log(`skills${suffix}-${theme}.svg ${(svg.length / 1024).toFixed(1)} KB, ${Math.ceil(bottom + PAD)}px tall`);
  }
}
