// Small badges: the About pills (focus areas and live coding time) and the footer links.
// node badges.mjs [outDir]  →  about-*-{theme}.svg, connect-*-{theme}.svg
import fs from 'node:fs';
import { Doc, THEMES, measure } from './lib.mjs';

const here = (p) => new URL(p, import.meta.url);
const data = JSON.parse(fs.readFileSync(here('./data.json')));
const ICONS = JSON.parse(fs.readFileSync(here('./assets/icons.json')));
const outDir = process.argv[2] || here('../../profile').pathname;

const icon = (name, x, y, size, fill) => {
  const { d, box } = ICONS[name];
  return `<g transform="translate(${x} ${y}) scale(${+(size / box).toFixed(5)})" fill="${fill}">${d.map((p) => `<path d="${p}"/>`).join('')}</g>`;
};
const write = (file, svg) => fs.writeFileSync(`${outDir}/${file}`, svg);

// ── About: outline pills ────────────────────────────────────────────────────
const hrs = Math.floor(data.wakapi.totalSeconds / 3600);
const mins = Math.floor((data.wakapi.totalSeconds % 3600) / 60);
const ABOUT = [
  { id: 'cyber', icon: 'hackaday', label: 'Cybersecurity' },
  { id: 'aiml', icon: 'huggingface', label: 'AI / ML' },
  { id: 'coding', icon: 'wakatime', label: 'Coding time', value: `${hrs.toLocaleString('en-US')} hrs ${mins} mins` },
];

for (const b of ABOUT) {
  const H = 26;
  const labelW = measure(b.label, 12, 600).width;
  const W = Math.ceil(11 + 13 + 7 + labelW + (b.value ? 6 + measure(b.value, 11, 500).width : 0) + 11);
  const name = b.value ? `${b.label}: ${b.value}` : b.label;
  for (const theme of Object.keys(THEMES)) {
    const doc = new Doc(theme, W);
    const t = doc.t;
    doc.add(`<rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="${(H - 1) / 2}" fill="none" stroke="${t.ink}" stroke-opacity="0.3"/>`);
    doc.add(icon(b.icon, 11, (H - 13) / 2, 13, t.ink));
    const y = +(H / 2 + 12 * 0.355).toFixed(2);
    doc.text(b.label, { x: 31, y, size: 12, weight: 600 });
    if (b.value) doc.text(b.value, { x: 31 + labelW + 6, y, size: 11, weight: 500, fill: 'ink3' });
    write(`about-${b.id}-${theme}.svg`, doc.svg(H, name, name));
  }
}

// ── Footer: underlined links with an "opens" arrow ──────────────────────────
const CONNECT = [
  { id: 'github', icon: 'github', label: 'GitHub', detail: 'tanu360' },
  { id: 'repos', icon: 'repo', label: 'Repositories', detail: String(data.stats.publicRepos) },
  { id: 'gists', icon: 'code-square', label: 'Gists', detail: 'notes' },
  { id: 'wakatime', icon: 'wakatime', label: 'WakaTime', detail: '@tanu1337' },
];
// The font subset has no ↗, so the arrow is drawn.
const arrow = (x, y, s, stroke) => `<path d="M${x} ${y + s}L${x + s} ${y}M${x + s * 0.3} ${y}H${x + s}V${y + s * 0.7}" fill="none" stroke="${stroke}" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>`;

for (const b of CONNECT) {
  const H = 28;
  const labelW = measure(b.label, 13, 600).width;
  const detailW = measure(b.detail, 12, 500).width;
  const W = Math.ceil(15 + 7 + labelW + 7 + detailW + 8 + 7 + 2);
  for (const theme of Object.keys(THEMES)) {
    const doc = new Doc(theme, W);
    const t = doc.t;
    doc.add(icon(b.icon, 0, 5, 15, t.ink));
    doc.text(b.label, { x: 22, y: 17.5, size: 13, weight: 600 });
    doc.text(b.detail, { x: 22 + labelW + 7, y: 17.5, size: 12, weight: 500, fill: 'ink3' });
    doc.add(arrow(22 + labelW + 7 + detailW + 8, 8.5, 7, t.ink3));
    doc.add(`<rect x="0" y="${H - 3}" width="${W - 2}" height="1" fill="${t.ink}" fill-opacity="0.35"/>`);
    write(`connect-${b.id}-${theme}.svg`, doc.svg(H, `${b.label}: ${b.detail}`, `Link to ${b.label}`));
  }
}
console.log(`badges: ${ABOUT.length} about, ${CONNECT.length} connect`);
