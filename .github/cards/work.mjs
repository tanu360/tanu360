// "Selected work" rows: icon, repo name and a muted one-line description, one SVG per
// project so each stays its own link. Markdown can't mute text or drop link underlines.
// node work.mjs [outDir]  →  work-<repo>[-mobile]-{dark,light}.svg
import fs from 'node:fs';
import { Doc, THEMES, HALF, measure } from './lib.mjs';

const here = (p) => new URL(p, import.meta.url);
const outDir = process.argv[2] || here('../../profile').pathname;

export const WORK = [
  { repo: 'ida-chat-plugin', icon: ['lucide', 'message-square-code'], desc: 'AI chat for IDA Pro, listed in the official Hex-Rays plugin registry' },
  { repo: 'nanobananademo', icon: ['lucide', 'wand-sparkles'], desc: 'AI image generation, editing and upscaling pipeline' },
  { repo: 'claude-code-dashboard', icon: ['lucide', 'layout-dashboard'], desc: 'UX and analytics dashboard for code agents' },
  { repo: 'Facebook-SSL-Pinning-Bypass', icon: ['si', 'facebook'], desc: 'SSL pinning bypass research on Facebook for Android' },
  { repo: 'Instagram-SSL-Pinning-Bypass', icon: ['si', 'instagram'], desc: 'Traffic interception research on Instagram for Android' },
  { repo: 'apple-intelligence-api', icon: ['si', 'apple'], desc: "OpenAI-compatible server for Apple's on-device models" },
  { repo: 'chatjimmy-reverse-api', icon: ['lucide', 'bot-message-square'], desc: 'OpenAI + Anthropic compatible layer with streaming and tools' },
  { repo: 'facebook-checker-v4', icon: ['lucide', 'list-checks'], desc: 'Automation tooling research' },
];

const H = 24;
const ICON = 15;
const LINE = 18; // description line height in the phone version
const NAME = 13.5;
const DESC = 13;
const BASE = 16.5;

// Lucide icons are strokes on a 24px grid; Simple Icons are filled 24px marks.
function icon([kind, name], size, colour) {
  const s = +(size / 24).toFixed(5);
  if (kind === 'si') {
    const d = fs.readFileSync(here(`./node_modules/simple-icons/icons/${name}.svg`), 'utf8').match(/ d="([^"]+)"/)[1];
    return `<g transform="translate(0 ${(H - size) / 2}) scale(${s})" fill="${colour}"><path d="${d}"/></g>`;
  }
  const svg = fs.readFileSync(here(`./node_modules/lucide-static/icons/${name}.svg`), 'utf8');
  const shapes = svg.slice(svg.indexOf('>', svg.indexOf('<svg')) + 1, svg.lastIndexOf('</svg>')).replace(/\s+/g, ' ').trim();
  return `<g transform="translate(0 ${(H - size) / 2}) scale(${s})" fill="none" stroke="${colour}" stroke-width="${(1.35 / s).toFixed(2)}" stroke-linecap="round" stroke-linejoin="round">${shapes}</g>`;
}

// Every row shares the widest row's width, so when a phone scales the images down to fit
// they all shrink by the same amount and keep one text size.
const rowWidth = (w) => ICON + 9 + measure(w.repo, NAME, 600).width + 9 + measure('—', DESC, 400).width + 9 + measure(w.desc, DESC, 400).width + 2;
const W = Math.ceil(Math.max(...WORK.map(rowWidth)));

// Phone version: the name on the first line, the description under it, wrapped to the cards'
// phone width. Every row is HALF wide, so they scale alike.
function lines(str, maxW) {
  const out = [''];
  for (const word of str.split(' ')) {
    const next = out.at(-1) ? `${out.at(-1)} ${word}` : word;
    if (out.at(-1) && measure(next, DESC, 400).width > maxW) out.push(word);
    else out[out.length - 1] = next;
  }
  return out;
}
// Like `text-wrap: balance`: the narrowest width that keeps the line count, so no lone last word.
function balanced(str, maxW) {
  const n = lines(str, maxW).length;
  let w = maxW;
  while (n > 1 && lines(str, w - 4).length === n) w -= 4;
  return lines(str, w);
}

for (const w of WORK) {
  const text = balanced(w.desc, HALF - ICON - 9 - 4);
  for (const theme of Object.keys(THEMES)) {
    const doc = new Doc(theme, HALF);
    doc.add(icon(w.icon, ICON, doc.t.ink2));
    doc.text(w.repo, { x: ICON + 9, y: BASE, size: NAME, weight: 600 });
    text.forEach((line, i) => doc.text(line, { x: ICON + 9, y: BASE + 20 + i * LINE, size: DESC, weight: 400, fill: 'ink3' }));
    fs.writeFileSync(`${outDir}/work-${w.repo.toLowerCase()}-mobile-${theme}.svg`, doc.svg(H + 20 + (text.length - 1) * LINE + 4, `${w.repo} — ${w.desc}`, `${w.repo}: ${w.desc}`));
  }
  for (const theme of Object.keys(THEMES)) {
    const doc = new Doc(theme, W);
    const t = doc.t;
    doc.add(icon(w.icon, ICON, t.ink2));
    let x = ICON + 9;
    x += doc.text(w.repo, { x, y: BASE, size: NAME, weight: 600 }) + 9;
    x += doc.text('—', { x, y: BASE, size: DESC, weight: 400, fill: 'ink3' }) + 9;
    doc.text(w.desc, { x, y: BASE, size: DESC, weight: 400, fill: 'ink3' });
    fs.writeFileSync(`${outDir}/work-${w.repo.toLowerCase()}-${theme}.svg`, doc.svg(H, `${w.repo} — ${w.desc}`, `${w.repo}: ${w.desc}`));
  }
}
console.log(`work: ${WORK.length} rows`);
