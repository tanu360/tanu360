import fs from 'node:fs';
import { Doc, THEMES, PAD, FULL, HALF, FIGURE_WEIGHT, fmt, duration, monthYear, monthShort, dayMonth, weekdayDate, contrast } from './lib.mjs';

const here = (p) => new URL(p, import.meta.url);
const data = JSON.parse(fs.readFileSync(here('./data.json')));
const world = JSON.parse(fs.readFileSync(here('./assets/world-grid.json')));
const ICONS = JSON.parse(fs.readFileSync(here('./assets/icons.json')));
// Paired half-width cards share a height so they line up side by side in the README.
const HALF_HEIGHT = 490;
const WAKATIME_URL = process.env.WAKATIME_URL || 'wakatime.com/@tanu1337';
const plural = (n, word) => `${word}${n === 1 ? '' : 's'}`;

// Contribution level → opacity of one ink, light to dark.
const LEVEL = { NONE: 0, FIRST_QUARTILE: 0.3, SECOND_QUARTILE: 0.52, THIRD_QUARTILE: 0.76, FOURTH_QUARTILE: 1 };
const levelOpacity = (doc, level) => LEVEL[level] || doc.t.empty;

// Wakapi reports some names in its own casing.
const LANG_NAMES = { Javascript: 'JavaScript', Typescript: 'TypeScript', Json: 'JSON', Html: 'HTML', Css: 'CSS', Yaml: 'YAML', 'Objective-c': 'Objective-C', Toml: 'TOML', Mql: 'MQL' };
const langName = (name) => LANG_NAMES[name] ?? name;

const BAR_GAP = 2;

// The same bar standing up, filled from the baseline.
function meterUp(doc, { x, base, width, height, ratio, on }) {
  const fill = ratio > 0 ? Math.min(height, Math.max(3, height * ratio)) : 0;
  if (fill) doc.rect(x, base - fill, width, fill, { opacity: on, rx: 1.5 });
  const rest = fill ? fill + BAR_GAP : 0;
  if (height - rest > 1) doc.rect(x, base - height, width, height - rest, { opacity: doc.t.empty, rx: 1.5 });
}

// Ink opacities for ranked series (rings, composition bar, legends), strongest first.
const SHADES = [1, 0.72, 0.52, 0.38, 0.27, 0.19, 0.13];

// Masked project names ("omni••••••"): the visible start in ink, the dots muted.
function nameText(doc, name, x, y) {
  const m = /^([^•]*)(•+)$/.exec(name);
  if (!m) return doc.text(name, { x, y, size: 13 });
  const w = doc.text(m[1], { x, y, size: 13 });
  return w + doc.text(m[2], { x: x + w + 1, y, size: 13, tracking: 0.04, fill: 'ink3' }) + 1;
}

// ── GitHub: KPI row, contribution grid, stats strip ─────────────────────────
function github(theme) {
  const doc = new Doc(theme, FULL);
  const c = data.contributions;
  const s = data.stats;
  doc.header('GITHUB', `github.com/${data.login}`);

  const tiles = [
    { label: 'CONTRIBUTIONS', value: fmt(c.allTime), sub: `since ${monthYear(c.since)}` },
    { label: 'CURRENT STREAK', value: fmt(c.current.days), unit: plural(c.current.days, 'day'), sub: c.current.days ? `since ${dayMonth(c.current.start)}` : 'no activity yet today' },
    { label: 'LONGEST STREAK', value: fmt(c.longest.days), unit: plural(c.longest.days, 'day'), sub: `${monthYear(c.longest.start)} – ${monthYear(c.longest.end)}` },
    { label: 'GRADE', value: s.grade, sub: `top ${Math.round(s.percentile)}% by readme-stats` },
  ];
  const colW = (FULL - 2 * PAD) / tiles.length;
  tiles.forEach((tile, i) => {
    const x = PAD + i * colW;
    doc.label(tile.label, x, 66);
    doc.figure(tile.value, tile.unit, x, 116);
    doc.text(tile.sub, { x, y: 142, size: 12.5, fill: 'ink3' });
  });

  // Contribution grid, GitHub-style squares.
  const top = 188;
  const weeks = Math.ceil(c.calendar.length / 7);
  const pitch = (FULL - 2 * PAD) / weeks;
  const size = pitch - 3;
  const lx = doc.text('Last 12 months', { x: PAD, y: top, size: 12.5, weight: 600, fill: 'ink2' });
  doc.text(`${fmt(c.lastYear)} contributions`, { x: PAD + lx + 10, y: top, size: 12.5, fill: 'ink3' });

  const legend = Object.keys(LEVEL);
  const more = doc.text('More', { x: FULL - PAD, y: top, size: 11.5, anchor: 'end', fill: 'ink3' });
  const legendX = FULL - PAD - more - 8 - legend.length * 14;
  legend.forEach((level, i) => doc.squares([[legendX + i * 14, top - 10]], 11, levelOpacity(doc, level)));
  doc.text('Less', { x: legendX - 6, y: top, size: 11.5, anchor: 'end', fill: 'ink3' });

  const gridTop = top + 16;
  const byLevel = new Map();
  c.calendar.forEach((d, i) => {
    const op = levelOpacity(doc, d.level);
    if (!byLevel.has(op)) byLevel.set(op, []);
    byLevel.get(op).push([PAD + Math.floor(i / 7) * pitch + 1.5, gridTop + (i % 7) * pitch + 1.5]);
  });
  for (const [op, cells] of byLevel) doc.squares(cells, size, op);

  // Month names under the first week of each month; a partial leading month is dropped.
  const gridBottom = gridTop + 7 * pitch;
  const starts = [];
  for (let col = 0; col < weeks; col++) {
    const first = c.calendar[col * 7];
    const prev = c.calendar[(col - 1) * 7];
    if (!prev || first.date.slice(0, 7) !== prev.date.slice(0, 7)) starts.push({ col, date: first.date });
  }
  if (starts.length > 1 && starts[1].col - starts[0].col < 3) starts.shift();
  for (const { col, date } of starts) {
    if (col <= weeks - 2) doc.text(monthShort(date), { x: PAD + col * pitch + 1.5, y: gridBottom + 16, size: 10.5, fill: 'ink3' });
  }

  // Stats strip: label, figure, caption — same rhythm as the tiles above.
  const stripRule = gridBottom + 28;
  const strip = [
    { label: 'STARS EARNED', value: fmt(s.stars), sub: `across ${s.publicRepos} repos` },
    { label: 'COMMITS', value: fmt(s.commits), sub: 'last 12 months' },
    { label: 'PULL REQUESTS', value: fmt(s.prs), sub: 'all time' },
    { label: 'ISSUES', value: fmt(s.issues), sub: 'all time' },
    { label: 'CONTRIBUTED TO', value: fmt(s.contributedTo), unit: plural(s.contributedTo, 'repo'), sub: 'last 12 months' },
    { label: 'FOLLOWERS', value: fmt(s.followers), sub: 'on GitHub' },
  ];
  const stripW = (FULL - 2 * PAD) / strip.length;
  strip.forEach((item, i) => {
    const x = PAD + i * stripW;
    doc.label(item.label, x, stripRule + 30);
    const w = doc.text(item.value, { x: x - 1, y: stripRule + 60, size: 24, weight: FIGURE_WEIGHT, tracking: -0.02 });
    if (item.unit) doc.text(item.unit, { x: x + w + 5, y: stripRule + 60, size: 13, fill: 'ink3' });
    doc.text(item.sub, { x, y: stripRule + 80, size: 11.5, fill: 'ink3' });
  });

  return doc.svg(
    stripRule + 92,
    `GitHub stats for ${data.login}`,
    `${fmt(c.allTime)} contributions since ${monthYear(c.since)}; current streak ${c.current.days} days; longest streak ${c.longest.days} days; grade ${s.grade}. ` +
      `${fmt(c.lastYear)} contributions in the last 12 months. ${fmt(s.stars)} stars, ${fmt(s.commits)} commits in the last 12 months, ${s.prs} pull requests, ${s.issues} issues, contributed to ${s.contributedTo} repos, ${s.followers} followers.`,
  );
}

// ── Languages: what the code is made of, and where the hours go ─────────────
// Left: one bar split by language share (a whole, so one bar) with a legend.
// Right: a radar of hours per language (Bklit's radar chart), top six.
function languages(theme) {
  const doc = new Doc(theme, FULL);
  const t = doc.t;
  doc.header('LANGUAGES');
  const gap = 40;
  const colW = (FULL - 2 * PAD - gap) / 2;
  const heading = (x, title, sub) => {
    doc.text(title, { x, y: 62, size: 12.5, weight: 600, fill: 'ink2' });
    doc.text(sub, { x, y: 80, size: 11.5, fill: 'ink3' });
  };

  // Composition bar: top six languages and the rest, separated by 2px gaps.
  const top = data.repoLanguages.slice(0, 6);
  const rest = 1 - top.reduce((sum, l) => sum + l.share, 0);
  const parts = [...top, ...(rest > 0.001 ? [{ name: 'Other', share: rest }] : [])];
  heading(PAD, 'Code in my repositories', 'share of bytes across owned repos');
  const barY = 100;
  let x = PAD;
  const usable = colW - 2 * (parts.length - 1);
  parts.forEach((l, i) => {
    const w = Math.max(2, usable * l.share);
    doc.rect(x, barY, w, 10, { opacity: SHADES[i], rx: 1.5 });
    x += w + 2;
  });
  parts.forEach((l, i) => {
    const y = 144 + i * 26;
    doc.squares([[PAD, y - 9]], 9, SHADES[i]);
    doc.text(l.name, { x: PAD + 17, y, size: 13 });
    doc.text(`${(l.share * 100).toFixed(1)}%`, { x: PAD + colW, y, size: 12.5, anchor: 'end', fill: 'ink2' });
  });

  // Radar of hours: grid hexagons and spokes in hairlines, the shape in ink.
  const rx0 = PAD + colW + gap;
  heading(rx0, 'Time spent writing code', `all time on ${data.wakapi.source ?? 'Wakapi'}, ${fmt(data.wakapi.totalSeconds / 3600)} hrs total`);
  const langs = data.wakapi.languages.filter((l) => l.name.toLowerCase() !== 'unknown').slice(0, 6);
  const R = 82;
  const cx = rx0 + colW / 2;
  const cy = 216;
  const max = langs[0].seconds;
  const at = (i, radius) => {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / langs.length;
    return [cx + radius * Math.cos(a), cy + radius * Math.sin(a)];
  };
  const poly = (radius) => langs.map((_, i) => at(i, radius).map((v) => v.toFixed(1)).join(' ')).join(' ');
  for (const f of [1 / 3, 2 / 3, 1]) doc.add(`<polygon points="${poly(R * f)}" fill="none" stroke="${t.rule}"/>`);
  langs.forEach((_, i) => {
    const [x1, y1] = at(i, R);
    doc.add(`<path d="M${cx} ${cy}L${x1.toFixed(1)} ${y1.toFixed(1)}" stroke="${t.rule}"/>`);
  });
  const shape = langs.map((l, i) => at(i, R * Math.max(0.04, l.seconds / max)).map((v) => v.toFixed(1)).join(' ')).join(' ');
  doc.add(`<polygon points="${shape}" fill="${t.ink}" fill-opacity="0.12" stroke="${t.ink}" stroke-width="1.5" stroke-linejoin="round"/>`);
  langs.forEach((l, i) => {
    const [px, py] = at(i, R * Math.max(0.04, l.seconds / max));
    doc.add(`<circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="2.6" fill="${t.ink}"/>`);
    const [lx, ly] = at(i, R + 16);
    const anchor = Math.abs(lx - cx) < 4 ? 'middle' : lx < cx ? 'end' : 'start';
    const up = ly < cy - R * 0.5;
    doc.text(langName(l.name), { x: lx, y: up ? ly - 8 : ly + 2, size: 12, weight: 600, anchor });
    doc.text(`${fmt(l.seconds / 3600)} hrs`, { x: lx, y: up ? ly + 6 : ly + 16, size: 11, anchor, fill: 'ink3' });
  });

  return doc.svg(
    Math.max(144 + (parts.length - 1) * 26 + 16, cy + R + 44),
    'Languages',
    `By code: ${parts.map((l) => `${l.name} ${(l.share * 100).toFixed(1)}%`).join(', ')}. By coding time: ${langs.map((l) => `${langName(l.name)} ${fmt(l.seconds / 3600)} hrs`).join(', ')}.`,
  );
}

// Concentric rings with a legend (Bklit's ring chart): each ring is one item's share of
// `total`, read clockwise from the top. Shared by the two half cards so they mirror.
const RING = { outer: 58, step: 13, width: 8 };
function ringList(doc, label, items, total, top) {
  doc.label(label, PAD, top);
  const cx = PAD + RING.outer + RING.width / 2;
  const cy = top + 22 + RING.outer + RING.width / 2;
  items.forEach(([, seconds], i) => {
    const r = RING.outer - i * RING.step;
    const C = 2 * Math.PI * r;
    const ring = `cx="${cx}" cy="${cy.toFixed(1)}" r="${r}" fill="none" stroke="${doc.t.ink}" stroke-width="${RING.width}"`;
    doc.add(`<circle ${ring} stroke-opacity="${doc.t.empty}"/>`);
    doc.add(`<circle ${ring} stroke-opacity="${SHADES[i]}" stroke-linecap="round" stroke-dasharray="${((C * seconds) / total).toFixed(2)} ${C.toFixed(2)}" transform="rotate(-90 ${cx} ${cy.toFixed(1)})"/>`);
  });
  const lx = cx + RING.outer + RING.width / 2 + 24;
  items.forEach(([name, seconds], i) => {
    const y = cy - ((items.length - 1) * 30) / 2 + i * 30 + 4;
    doc.squares([[lx, y - 9]], 9, SHADES[i]);
    nameText(doc, name, lx + 16, y);
    const pct = doc.text(`${Math.round((seconds / total) * 100)}%`, { x: HALF - PAD, y, size: 12, anchor: 'end', fill: 'ink3' });
    doc.text(duration(seconds), { x: HALF - PAD - pct - 8, y, size: 12.5, anchor: 'end', fill: 'ink2' });
  });
  return cy + RING.outer + RING.width / 2;
}

// The two half cards share one grid: stats on top, a chart whose baseline is CHART_BASE with
// a caption row under it, and a ring list starting at LIST_TOP.
const CHART_BASE = 284;
const LIST_TOP = CHART_BASE + 46;

// ── Wakapi: this week ───────────────────────────────────────────────────────
function week(theme) {
  const doc = new Doc(theme, HALF);
  const days = data.wakapi.week.days;
  const total = days.reduce((sum, d) => sum + d.seconds, 0);
  const best = days.reduce((a, b) => (b.seconds > a.seconds ? b : a));
  doc.header('THIS WEEK', `${dayMonth(days[0].date)} – ${dayMonth(days.at(-1).date)}`);

  doc.label('TOTAL', PAD, 66);
  doc.figure(duration(total), null, PAD, 110, 38);
  doc.label('DAILY AVERAGE', HALF / 2, 66);
  doc.figure(duration(total / days.length), null, HALF / 2, 110, 38);

  // One bar per day on a full-height track; the best day carries the ink.
  const base = CHART_BASE;
  const chartH = 106;
  const slot = (HALF - 2 * PAD) / days.length;
  const colW = 24;
  days.forEach((d, i) => {
    const x = PAD + i * slot + (slot - colW) / 2;
    const isBest = d === best;
    meterUp(doc, { x, base, width: colW, height: chartH, ratio: d.seconds / best.seconds, on: isBest ? 1 : 0.42 });
    if (isBest) doc.text(duration(d.seconds), { x: x + colW / 2, y: base - chartH - 8, size: 11.5, weight: 600, anchor: 'middle' });
    const day = new Date(`${d.date}T00:00:00Z`).toLocaleString('en-US', { weekday: 'short', timeZone: 'UTC' });
    doc.text(day, { x: x + colW / 2, y: base + 18, size: 11, weight: isBest ? 600 : 500, anchor: 'middle', fill: isBest ? 'ink' : 'ink3' });
  });

  // Projects, "Other" always last.
  const totals = new Map();
  for (const d of days) for (const p of d.projects) totals.set(p.name, (totals.get(p.name) || 0) + p.seconds);
  const projects = [...totals].sort((a, b) => (a[0] === 'Other') - (b[0] === 'Other') || b[1] - a[1]).slice(0, 4);
  const bottom = ringList(doc, 'PROJECTS', projects, total, LIST_TOP);

  return doc.svg(
    Math.max(bottom + 14, HALF_HEIGHT),
    'Coding this week',
    `${duration(total)} total, ${duration(total / days.length)} daily average. Best day ${best.date} with ${duration(best.seconds)}. Projects: ${projects.map(([n, sec]) => `${n} ${duration(sec)}`).join(', ')}.`,
  );
}

// ── Wakapi: leaderboard ─────────────────────────────────────────────────────
const TIERS = [
  { name: 'Bronze', min: 101, max: Infinity },
  { name: 'Silver', min: 51, max: 100 },
  { name: 'Gold', min: 11, max: 50 },
  { name: 'Diamond', min: 1, max: 10 },
];

// Where a rank sits inside its tier, 0 at the tier's worst rank to 1 at its best.
const tierPos = (t, rank) => (t.max === Infinity ? Math.max(0, Math.min(1, (1000 - rank) / (1000 - t.min))) : (t.max - rank) / (t.max - t.min));

function rank(theme) {
  const doc = new Doc(theme, HALF);
  const t = doc.t;
  const r = data.wakapi.rank;
  doc.header('LEADERBOARD', WAKATIME_URL);
  const tierIndex = r ? TIERS.findIndex((x) => r.rank >= x.min && r.rank <= x.max) : -1;
  const tier = TIERS[tierIndex];

  // Same top row as the week card: two figures at the same size and positions.
  doc.label('RANKED TIME', PAD, 66);
  doc.figure(r ? duration(r.seconds) : '—', null, PAD, 110, 38);
  doc.label('DAILY AVERAGE', HALF / 2, 66);
  doc.figure(r ? duration(r.dailyAverage) : '—', null, HALF / 2, 110, 38);

  // Notched half-gauge (Bklit's gauge) sitting on the week card's chart baseline: Bronze on
  // the left to Diamond on the right, one gap between tiers, filled up to the current rank.
  const G = { cx: HALF / 2, cy: CHART_BASE, r: 112, len: 14, per: 11 };
  const slots = TIERS.length * G.per + TIERS.length - 1;
  const progress = r ? (tierIndex + tierPos(tier, r.rank)) / TIERS.length : 0;
  const filled = Math.round(progress * TIERS.length * G.per);
  const angle = (slot) => Math.PI - ((slot + 0.5) * Math.PI) / slots;
  const point = (a, radius) => [G.cx + radius * Math.cos(a), G.cy - radius * Math.sin(a)];
  const on = [];
  const off = [];
  TIERS.forEach((x, ti) => {
    for (let j = 0; j < G.per; j++) {
      const a = angle(ti * (G.per + 1) + j);
      const [x1, y1] = point(a, G.r - G.len);
      const [x2, y2] = point(a, G.r);
      (ti * G.per + j < filled ? on : off).push(`M${x1.toFixed(1)} ${y1.toFixed(1)}L${x2.toFixed(1)} ${y2.toFixed(1)}`);
    }
    const [lx, ly] = point(angle(ti * (G.per + 1) + (G.per - 1) / 2), G.r + 14);
    const anchor = Math.abs(lx - G.cx) < 30 ? 'middle' : lx < G.cx ? 'end' : 'start';
    doc.text(x.name, { x: lx, y: ly + 4, size: 11, weight: ti === tierIndex ? 600 : 500, anchor, fill: ti === tierIndex ? 'ink' : 'ink3' });
  });
  const notch = (d, opacity) => d.length && doc.add(`<path d="${d.join('')}" stroke="${t.ink}" stroke-opacity="${opacity}" stroke-width="3.2" stroke-linecap="round"/>`);
  notch(off, t.empty * 2);
  notch(on, 1);
  doc.text(r ? `#${r.rank}` : '—', { x: G.cx, y: G.cy - 8, size: 44, weight: FIGURE_WEIGHT, tracking: -0.03, anchor: 'middle' });
  // Caption on the same row as the week card's day names.
  doc.text(r ? `${tier.name} tier on ${r.source ?? 'wakapi.dev'}` : 'outside the public top 100', { x: G.cx, y: CHART_BASE + 18, size: 11, anchor: 'middle', fill: 'ink3' });

  // This week's languages as rings, mirroring the week card's projects.
  const all = (r?.languages ?? []).filter((l) => l.name.toLowerCase() !== 'unknown');
  const langTotal = (r?.languages ?? []).reduce((sum, l) => sum + l.seconds, 0) || 1;
  const langs = all.slice(0, 4).map((l) => [langName(l.name), l.seconds]);
  const bottom = ringList(doc, 'LANGUAGES THIS WEEK', langs, langTotal, LIST_TOP);

  return doc.svg(
    Math.max(bottom + 14, HALF_HEIGHT),
    'Wakapi leaderboard',
    r ? `Rank ${r.rank} on the ${r.source ?? 'wakapi.dev'} weekly leaderboard, ${tier.name} tier. ${duration(r.seconds)} ranked time, ${duration(r.dailyAverage)} daily average.` : 'Not in the public top 100 this week.',
  );
}

// ── Stargazers: Equal Earth square-grid map ─────────────────────────────────
function stargazers(theme) {
  const doc = new Doc(theme, FULL);
  const t = doc.t;
  const { total, located } = data.stargazers;
  const byCountry = new Map();
  for (const s of located) {
    const entry = byCountry.get(s.cc) ?? { name: s.country, count: 0 };
    entry.count++;
    byCountry.set(s.cc, entry);
  }
  const countries = [...byCountry.values()].sort((a, b) => b.count - a.count);
  doc.header('STARGAZERS', `${fmt(total)} people · ${countries.length} countries`);

  const topRepo = data.repos[0];
  const tiles = [
    { label: 'STARGAZERS', value: fmt(total), sub: `across ${data.repos.length} starred repos` },
    { label: 'COUNTRIES', value: fmt(countries.length), sub: `from ${located.length} located profiles` },
    { label: 'LOCATED', value: `${Math.round((located.length / total) * 100)}%`, sub: `${located.length} of ${total} list a location` },
    { label: 'MOST STARRED', value: fmt(topRepo.stars), unit: 'stars', sub: topRepo.name },
  ];
  const colW = (FULL - 2 * PAD) / tiles.length;
  tiles.forEach((tile, i) => {
    const x = PAD + i * colW;
    doc.label(tile.label, x, 66);
    doc.figure(tile.value, tile.unit, x, 104, 32);
    doc.text(tile.sub, { x, y: 126, size: 12, fill: 'ink3' });
  });

  // Map grid (India's official worldview, so all of Jammu & Kashmir is India): land is faint,
  // stargazer countries are shaded by count, and the people themselves are solid.
  const mapTop = 160;
  const pitch = (FULL - 2 * PAD) / world.cols;
  const size = pitch - 1.6;
  const cellOf = (lat, lon) => [
    Math.min(world.cols - 1, Math.max(0, Math.floor(((lon + 180) / 360) * world.cols))),
    Math.min(world.rows - 1, Math.max(0, Math.floor(((world.latTop - lat) / (world.latTop - world.latBottom)) * world.rows))),
  ];
  const people = new Map();
  for (const s of located) {
    const k = cellOf(s.lat, s.lon).join(',');
    people.set(k, (people.get(k) || 0) + 1);
  }
  const maxCountry = countries[0]?.count || 1;
  const landOpacity = t.empty * 1.5;

  // Squares batched per opacity into single paths to keep the file small.
  const layers = new Map();
  const square = (col, row, opacity) => {
    const x = PAD + col * pitch + 0.8;
    const y = mapTop + row * pitch + 0.8;
    const key = opacity.toFixed(2);
    if (!layers.has(key)) layers.set(key, []);
    layers.get(key).push(`M${x.toFixed(1)} ${y.toFixed(1)}h${size.toFixed(1)}v${size.toFixed(1)}h-${size.toFixed(1)}z`);
  };
  for (const [col, row, cc] of world.cells) {
    if (people.has(`${col},${row}`)) continue;
    const country = byCountry.get(cc);
    square(col, row, country ? 0.2 + 0.25 * Math.sqrt(country.count / maxCountry) : landOpacity);
  }
  for (const [k, n] of people) {
    const [col, row] = k.split(',').map(Number);
    square(col, row, n > 1 ? 1 : 0.8);
  }
  for (const [opacity, cmds] of layers) doc.add(`<path fill="${t.ink}" fill-opacity="${opacity}" d="${cmds.join('')}"/>`);

  // Legend stacked in the empty South Pacific corner.
  const mapBottom = mapTop + world.rows * pitch;
  [['Stargazer', 1], ['Their country', 0.36], ['Land', landOpacity]].forEach(([label, op], i) => {
    const ly = mapBottom - 44 + i * 18;
    doc.add(`<rect x="${PAD}" y="${ly - 8}" width="8" height="8" fill="${t.ink}" fill-opacity="${op}"/>`);
    doc.text(label, { x: PAD + 14, y: ly, size: 11, fill: 'ink3' });
  });

  // Top countries as tiles: the map already shows where, so no bars.
  const listRule = mapBottom + 14;
  const top = countries.slice(0, 8);
  const tileW = (FULL - 2 * PAD) / 4;
  top.forEach((c, i) => {
    const x = PAD + (i % 4) * tileW;
    const y = listRule + 30 + Math.floor(i / 4) * 78;
    doc.label(c.name.toUpperCase(), x, y);
    doc.text(fmt(c.count), { x: x - 1, y: y + 30, size: 24, weight: FIGURE_WEIGHT, tracking: -0.02 });
    doc.text(`${Math.round((c.count / located.length) * 100)}% of located`, { x, y: y + 48, size: 11.5, fill: 'ink3' });
  });

  // Credit the geocoder with its mark: "Locations from GitHub profiles · [logo] OpenStreetMap".
  const creditY = listRule + 30 + 78 + 76;
  const osm = ICONS.openstreetmap.d[0];
  const osmW = doc.text('OpenStreetMap', { x: FULL - PAD, y: creditY, size: 11.5, anchor: 'end', fill: 'ink3' });
  const osmX = FULL - PAD - osmW - 6 - 12;
  doc.add(`<g transform="translate(${osmX.toFixed(2)} ${creditY - 9.5}) scale(0.5)" fill="${t.ink3}"><path d="${osm}"/></g>`);
  doc.text('Locations from GitHub profiles ·', { x: osmX - 6, y: creditY, size: 11.5, anchor: 'end', fill: 'ink3' });

  return doc.svg(
    creditY + 8,
    'Stargazers around the world',
    `${fmt(total)} stargazers; ${located.length} list a location, across ${countries.length} countries. Top: ${top.map((c) => `${c.name} ${c.count}`).join(', ')}.`,
  );
}

// ── Contribution activity: last 30 days as a smooth area ───────────────────
const DAYS = 30;

// Monotone cubic (Fritsch–Carlson): smooth, but never dips below zero or overshoots a peak.
function smoothPath(pts) {
  const n = pts.length;
  const slope = pts.slice(1).map(([x, y], i) => (y - pts[i][1]) / (x - pts[i][0]));
  const tangent = pts.map((_, i) => {
    if (i === 0) return slope[0];
    if (i === n - 1) return slope[n - 2];
    const [a, b] = [slope[i - 1], slope[i]];
    return a * b <= 0 ? 0 : 2 / (1 / a + 1 / b);
  });
  let d = `M${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < n - 1; i++) {
    const [x0, y0] = pts[i];
    const [x1, y1] = pts[i + 1];
    const h = (x1 - x0) / 3;
    d += `C${(x0 + h).toFixed(1)} ${(y0 + tangent[i] * h).toFixed(1)} ${(x1 - h).toFixed(1)} ${(y1 - tangent[i + 1] * h).toFixed(1)} ${x1.toFixed(1)} ${y1.toFixed(1)}`;
  }
  return d;
}

function activity(theme) {
  const doc = new Doc(theme, FULL);
  const t = doc.t;
  const cal = data.contributions.calendar;
  const days = cal.slice(-DAYS);
  const prev = cal.slice(-2 * DAYS, -DAYS);
  const total = days.reduce((sum, d) => sum + d.count, 0);
  const prevTotal = prev.reduce((sum, d) => sum + d.count, 0);
  const peak = days.reduce((a, b) => (b.count > a.count ? b : a));
  const active = days.filter((d) => d.count > 0).length;
  const change = prevTotal ? Math.round(((total - prevTotal) / prevTotal) * 100) : null;
  doc.header('CONTRIBUTION ACTIVITY', `last ${DAYS} days`);

  // Headline number with its change inline, then three supporting stats on the same baseline.
  doc.label('CONTRIBUTIONS', PAD, 66);
  const w = doc.text(fmt(total), { x: PAD - 2, y: 116, size: 46, weight: FIGURE_WEIGHT, tracking: -0.03 });
  if (change !== null) {
    const delta = change === 0 ? '0%' : `${change > 0 ? '↑' : '↓'} ${Math.abs(change)}%`;
    // Direction is the one place a card uses colour: green when up, red when down.
    doc.text(delta, { x: PAD + w + 10, y: 116, size: 14, weight: 600, fill: change > 0 ? 'up' : change < 0 ? 'down' : 'ink2' });
  }
  doc.text(prevTotal ? `vs ${fmt(prevTotal)} in the 30 days before` : `in the last ${DAYS} days`, { x: PAD, y: 142, size: 12, fill: 'ink3' });

  const side = [
    { label: 'DAILY AVERAGE', value: (total / DAYS).toFixed(1), sub: 'per day' },
    { label: 'BUSIEST DAY', value: fmt(peak.count), sub: weekdayDate(peak.date) },
    { label: 'ACTIVE DAYS', value: String(active), unit: `of ${DAYS}`, sub: `${DAYS - active} quiet ${plural(DAYS - active, 'day')}` },
  ];
  const sideX = PAD + 330;
  const sideW = (FULL - PAD - sideX) / side.length;
  side.forEach((item, i) => {
    const x = sideX + i * sideW;
    doc.label(item.label, x, 66);
    const vw = doc.text(item.value, { x: x - 1, y: 116, size: 32, weight: FIGURE_WEIGHT, tracking: -0.03 });
    if (item.unit) doc.text(item.unit, { x: x + vw + 5, y: 116, size: 13, fill: 'ink3' });
    doc.text(item.sub, { x, y: 142, size: 12, fill: 'ink3' });
  });

  // Chart: dashed recessive grid, gradient area, a 2px line, faded in at the left edge.
  const left = PAD;
  const right = FULL - PAD - 8;
  const top = 196;
  const base = 362;
  const max = Math.max(peak.count, 1) * 1.12;
  for (let k = 0; k <= 4; k++) {
    const y = base - (k / 4) * (base - top);
    doc.add(`<line x1="${left}" x2="${FULL - PAD}" y1="${y.toFixed(1)}" y2="${y.toFixed(1)}" stroke="${t.ink}" stroke-opacity="${k ? 0.1 : 0.16}" stroke-dasharray="${k ? '3 5' : '0'}"/>`);
  }

  const pts = days.map((d, i) => [left + (i * (right - left)) / (DAYS - 1), base - (d.count / max) * (base - top)]);
  const line = smoothPath(pts);
  doc.defs.set('area', `<linearGradient id="area" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${t.ink}" stop-opacity="0.22"/><stop offset="0.6" stop-color="${t.ink}" stop-opacity="0.06"/><stop offset="1" stop-color="${t.ink}" stop-opacity="0"/></linearGradient>`);
  doc.defs.set('fade', `<linearGradient id="fadeX" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0.15"/><stop offset="0.12" stop-color="#fff"/><stop offset="1" stop-color="#fff"/></linearGradient><mask id="fade" maskUnits="userSpaceOnUse" x="0" y="0" width="${FULL}" height="${base + 10}"><rect x="0" y="0" width="${FULL}" height="${base + 10}" fill="url(#fadeX)"/></mask>`);
  doc.add(`<g mask="url(#fade)"><path d="${line}L${right} ${base}L${left} ${base}Z" fill="url(#area)"/><path d="${line}" fill="none" stroke="${t.ink}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/></g>`);

  // Peak gets a value; today gets a dot with a soft halo.
  const [px, py] = pts[days.indexOf(peak)];
  doc.add(`<circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="3.5" fill="${t.ink}" stroke="${t.surface}" stroke-width="2"/>`);
  doc.text(fmt(peak.count), { x: px, y: py - 12, size: 12, weight: 600, anchor: 'middle' });
  const [ex, ey] = pts.at(-1);
  doc.add(`<circle cx="${ex.toFixed(1)}" cy="${ey.toFixed(1)}" r="8" fill="${t.ink}" fill-opacity="0.14"/><circle cx="${ex.toFixed(1)}" cy="${ey.toFixed(1)}" r="3.5" fill="${t.ink}"/>`);

  // Weekly date ticks counted back from today.
  days.forEach((d, i) => {
    if ((DAYS - 1 - i) % 7) return;
    const anchor = i === DAYS - 1 ? 'end' : i === 0 ? 'start' : 'middle';
    doc.text(i === DAYS - 1 ? 'Today' : dayMonth(d.date), { x: i === DAYS - 1 ? FULL - PAD : pts[i][0], y: base + 22, size: 11, anchor, fill: 'ink3' });
  });

  return doc.svg(
    base + 30,
    'Contribution activity, last 30 days',
    `${fmt(total)} contributions in the last ${DAYS} days${change === null ? '' : `, ${change >= 0 ? 'up' : 'down'} ${Math.abs(change)}% on the 30 days before`}. ` +
      `Busiest day ${peak.date} with ${peak.count}. Active on ${active} of ${DAYS} days. Daily counts: ${days.map((d) => d.count).join(', ')}.`,
  );
}

const CARDS = { github, languages, week, rank, stargazers, activity };
const outDir = process.argv[2] || here('../../profile').pathname;
fs.mkdirSync(outDir, { recursive: true });
for (const [name, render] of Object.entries(CARDS)) {
  for (const theme of Object.keys(THEMES)) {
    const svg = render(theme);
    fs.writeFileSync(`${outDir}/${name}-${theme}.svg`, svg);
    if (theme === 'dark') console.log(`${name}: ${(svg.length / 1024).toFixed(1)} KB, ${svg.match(/height="(\d+)"/)[1]}px tall`);
  }
}
for (const [name, t] of Object.entries(THEMES)) {
  console.log(name, ['ink', 'ink2', 'ink3'].map((k) => `${k} ${contrast(t[k], t.surface).toFixed(2)}:1`).join(' · '));
}
