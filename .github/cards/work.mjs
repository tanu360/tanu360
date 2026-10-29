// "Selected work" rows: icon, repo name and a muted one-line description, one SVG per
// project so each stays its own link. Markdown can't mute text or drop link underlines.
// node work.mjs [outDir]  →  work-<repo>-{dark,light}.svg
import fs from 'node:fs';
import { Doc, THEMES, measure } from './lib.mjs';

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

for (const w of WORK) {
  const nameW = measure(w.repo, NAME, 600).width;
  const dashW = measure('—', DESC, 400).width;
  const W = Math.ceil(ICON + 9 + nameW + 9 + dashW + 9 + measure(w.desc, DESC, 400).width + 2);
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
