import fs from 'node:fs';
import { Doc, THEMES, PAD, FULL, HALF, FIGURE_WEIGHT, fmt, duration, monthYear, monthShort, dayMonth, weekdayDate, fullDate, contrast } from './lib.mjs';

const here = (p) => new URL(p, import.meta.url);
const data = JSON.parse(fs.readFileSync(here('./data.json')));
const world = JSON.parse(fs.readFileSync(here('./assets/world-grid.json')));
const ICONS = JSON.parse(fs.readFileSync(here('./assets/icons.json')));
const updated = fullDate(data.generatedAt);
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

// A bar on its own track; a 2px surface gap separates the fill from the rest of the track.
const BAR = 5;
const BAR_GAP = 2;
function meter(doc, { x, y, width, ratio, on = 0.92 }) {
  const fill = ratio >= 1 ? width : ratio > 0 ? Math.min(width, Math.max(BAR, width * ratio)) : 0;
  if (fill) doc.rect(x, y, fill, BAR, { opacity: on, rx: 1.5 });
  const rest = fill ? fill + BAR_GAP : 0;
  if (width - rest > 1) doc.rect(x + rest, y, width - rest, BAR, { opacity: doc.t.empty, rx: 1.5 });
}

// The same bar standing up, filled from the baseline.
function meterUp(doc, { x, base, width, height, ratio, on }) {
  const fill = ratio > 0 ? Math.min(height, Math.max(3, height * ratio)) : 0;
  if (fill) doc.rect(x, base - fill, width, fill, { opacity: on, rx: 1.5 });
  const rest = fill ? fill + BAR_GAP : 0;
  if (height - rest > 1) doc.rect(x, base - height, width, height - rest, { opacity: doc.t.empty, rx: 1.5 });
}

// A ranked row: name, value on the right, bar underneath.
const ROW = 37;
function barRow(doc, { x, y, width, name, value, ratio }) {
  doc.text(name, { x, y, size: 13 });
  doc.text(value, { x: x + width, y, size: 12.5, anchor: 'end', fill: 'ink2' });
  meter(doc, { x, y: y + 9, width, ratio });
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
  const stripRule = gridBottom + 34;
  doc.rule(stripRule);
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
    if (item.unit) doc.text(item.unit, { x: x + w + 5, y: stripRule + 60, size: 13, fill: 'ink2' });
    doc.text(item.sub, { x, y: stripRule + 80, size: 11.5, fill: 'ink3' });
  });

  const footRule = stripRule + 100;
  doc.rule(footRule);
  doc.text(`Updated ${updated}`, { x: PAD, y: footRule + 22, size: 11.5, fill: 'ink3' });

  return doc.svg(
    footRule + 30,
    `GitHub stats for ${data.login}`,
    `${fmt(c.allTime)} contributions since ${monthYear(c.since)}; current streak ${c.current.days} days; longest streak ${c.longest.days} days; grade ${s.grade}. ` +
      `${fmt(c.lastYear)} contributions in the last 12 months. ${fmt(s.stars)} stars, ${fmt(s.commits)} commits in the last 12 months, ${s.prs} pull requests, ${s.issues} issues, contributed to ${s.contributedTo} repos, ${s.followers} followers.`,
  );
}

// ── Languages: two ranked lists side by side ────────────────────────────────
function languages(theme) {
  const doc = new Doc(theme, FULL);
  doc.header('LANGUAGES');
  const gap = 40;
  const colW = (FULL - 2 * PAD - gap) / 2;
  const ROWS = 8;

  const repo = data.repoLanguages.slice(0, ROWS).map((l) => ({ name: l.name, share: l.share, value: `${(l.share * 100).toFixed(1)}%` }));
  const known = data.wakapi.languages.filter((l) => l.name.toLowerCase() !== 'unknown');
  const time = known.slice(0, ROWS).map((l) => ({ name: langName(l.name), share: l.seconds, value: `${fmt(l.seconds / 3600)} hrs` }));

  const listTop = 116;
  const column = (x, title, sub, rows) => {
    doc.text(title, { x, y: 62, size: 12.5, weight: 600, fill: 'ink2' });
    doc.text(sub, { x, y: 80, size: 11.5, fill: 'ink3' });
    rows.forEach((row, i) => barRow(doc, { x, y: listTop + i * ROW, width: colW, name: row.name, value: row.value, ratio: row.share / rows[0].share }));
  };
  column(PAD, 'Code in my repositories', 'share of bytes across owned repos', repo);
  column(PAD + colW + gap, 'Time spent writing code', `all time on ${data.wakapi.source ?? 'Wakapi'}, ${fmt(data.wakapi.totalSeconds / 3600)} hrs total`, time);

  const footRule = listTop + (ROWS - 1) * ROW + 38;
  doc.rule(footRule);
  doc.text(`Updated ${updated}`, { x: PAD, y: footRule + 22, size: 11.5, fill: 'ink3' });
  doc.text('Bars scale to the top language in each list', { x: FULL - PAD, y: footRule + 22, size: 11.5, anchor: 'end', fill: 'ink3' });

  return doc.svg(
    footRule + 30,
    'Languages',
    `By code: ${repo.map((r) => `${r.name} ${r.value}`).join(', ')}. By coding time: ${time.map((r) => `${r.name} ${r.value}`).join(', ')}.`,
  );
}

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
  const base = 284;
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

  // Projects across the week, "Other" always last.
  const totals = new Map();
  for (const d of days) for (const p of d.projects) totals.set(p.name, (totals.get(p.name) || 0) + p.seconds);
  const projects = [...totals].sort((a, b) => (a[0] === 'Other') - (b[0] === 'Other') || b[1] - a[1]).slice(0, 4);
  const maxProject = Math.max(...projects.map(([, sec]) => sec));
  const listTop = base + 46;
  doc.label('PROJECTS', PAD, listTop);
  projects.forEach(([name, seconds], i) =>
    barRow(doc, { x: PAD, y: listTop + 28 + i * ROW, width: HALF - 2 * PAD, name, value: duration(seconds), ratio: seconds / maxProject }),
  );

  return doc.svg(
    Math.max(listTop + 28 + (projects.length - 1) * ROW + 22, HALF_HEIGHT),
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

function rank(theme) {
  const doc = new Doc(theme, HALF);
  const r = data.wakapi.rank;
  doc.header('LEADERBOARD', WAKATIME_URL);
  const tierIndex = r ? TIERS.findIndex((t) => r.rank >= t.min && r.rank <= t.max) : -1;
  const tier = TIERS[tierIndex];

  doc.label('WEEKLY RANK', PAD, 66);
  doc.figure(r ? `#${r.rank}` : '—', null, PAD, 116);
  doc.text(r ? `${tier.name} tier on ${r.source ?? 'wakapi.dev'} · ${tier.max === Infinity ? `ranks ${tier.min}+` : `ranks ${tier.min}–${tier.max}`}` : 'outside the public top 100', { x: PAD, y: 142, size: 12.5, fill: 'ink3' });

  // Tier track, worst to best, filled up to the current rank.
  const trackY = 172;
  const bandGap = 4;
  const bandW = (HALF - 2 * PAD - bandGap * (TIERS.length - 1)) / TIERS.length;
  TIERS.forEach((t, i) => {
    const x = PAD + i * (bandW + bandGap);
    const progress = i < tierIndex ? 1 : i === tierIndex ? (t.max - r.rank) / (t.max - t.min) : 0;
    meter(doc, { x, y: trackY, width: bandW, ratio: progress, on: i === tierIndex ? 1 : 0.45 });
    doc.text(t.name, { x, y: trackY + 26, size: 11, weight: i === tierIndex ? 600 : 500, fill: i === tierIndex ? 'ink' : 'ink3' });
  });

  doc.rule(trackY + 48);
  const stats = r
    ? [
        { label: 'RANKED TIME', value: duration(r.seconds) },
        { label: 'DAILY AVERAGE', value: duration(r.dailyAverage) },
        { label: 'TOP LANGUAGE', value: langName(r.languages.find((l) => l.name.toLowerCase() !== 'unknown')?.name ?? '—') },
      ]
    : [];
  const colW = (HALF - 2 * PAD) / 3;
  stats.forEach((item, i) => {
    const x = PAD + i * colW;
    doc.label(item.label, x, trackY + 78);
    doc.text(item.value, { x: x - 1, y: trackY + 108, size: 24, weight: FIGURE_WEIGHT, tracking: -0.02 });
  });

  const listTop = 330;
  const langs = (r?.languages ?? []).filter((l) => l.name.toLowerCase() !== 'unknown').slice(0, 4);
  doc.label('LANGUAGES THIS WEEK', PAD, listTop);
  langs.forEach((l, i) =>
    barRow(doc, { x: PAD, y: listTop + 28 + i * ROW, width: HALF - 2 * PAD, name: langName(l.name), value: duration(l.seconds), ratio: l.seconds / langs[0].seconds }),
  );

  return doc.svg(
    Math.max(listTop + 28 + (langs.length - 1) * ROW + 22, HALF_HEIGHT),
    'Wakapi leaderboard',
    r ? `Rank ${r.rank} on the wakapi.dev weekly leaderboard, ${tier.name} tier. ${duration(r.seconds)} ranked time, ${duration(r.dailyAverage)} daily average.` : 'Not in the public top 100 this week.',
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

  // Top countries as two ranked columns.
  const listRule = mapBottom + 20;
  doc.rule(listRule);
  doc.label('TOP COUNTRIES', PAD, listRule + 30);
  const gap = 40;
  const listW = (FULL - 2 * PAD - gap) / 2;
  const top = countries.slice(0, 8);
  top.forEach((c, i) => {
    const x = PAD + Math.floor(i / 4) * (listW + gap);
    const y = listRule + 58 + (i % 4) * ROW;
    barRow(doc, { x, y, width: listW, name: c.name, value: `${c.count} · ${Math.round((c.count / located.length) * 100)}%`, ratio: c.count / top[0].count });
  });

  const footRule = listRule + 58 + 3 * ROW + 26;
  doc.rule(footRule);
  doc.text(`Updated ${updated}`, { x: PAD, y: footRule + 22, size: 11.5, fill: 'ink3' });
  // Credit the geocoder with its mark: "Locations from GitHub profiles · [logo] OpenStreetMap".
  const osm = ICONS.openstreetmap.d[0];
  const osmW = doc.text('OpenStreetMap', { x: FULL - PAD, y: footRule + 22, size: 11.5, anchor: 'end', fill: 'ink3' });
  const osmX = FULL - PAD - osmW - 6 - 12;
  doc.add(`<g transform="translate(${osmX.toFixed(2)} ${footRule + 12.5}) scale(0.5)" fill="${t.ink3}"><path d="${osm}"/></g>`);
  doc.text('Locations from GitHub profiles ·', { x: osmX - 6, y: footRule + 22, size: 11.5, anchor: 'end', fill: 'ink3' });

  return doc.svg(
    footRule + 30,
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
    if (item.unit) doc.text(item.unit, { x: x + vw + 5, y: 116, size: 13, fill: 'ink2' });
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

  const footRule = base + 40;
  doc.rule(footRule);
  doc.text(`Updated ${updated}`, { x: PAD, y: footRule + 22, size: 11.5, fill: 'ink3' });
  doc.text('Commits, pull requests, issues and reviews, as GitHub counts them', { x: FULL - PAD, y: footRule + 22, size: 11.5, anchor: 'end', fill: 'ink3' });

  return doc.svg(
    footRule + 30,
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
