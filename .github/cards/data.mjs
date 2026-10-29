// Fetches everything the cards show and writes data.json.
// Each source is independent: if one fails (say Wakapi is down), its previous data is
// kept, so a bad day never blanks a card.
import fs from 'node:fs';

const LOGIN = process.env.GH_LOGIN || 'tanu360';
const WAKAPI_USER = process.env.WAKAPI_USERNAME || 'tanu1337';
const WAKAPI = 'https://wakapi.dev/api/compat/wakatime/v1';
const token = process.env.GITHUB_TOKEN;
if (!token) throw new Error('GITHUB_TOKEN is required');

const here = (p) => new URL(p, import.meta.url);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const dataPath = here('./data.json');
const prev = fs.existsSync(dataPath) ? JSON.parse(fs.readFileSync(dataPath)) : {};

async function gql(query, variables = {}) {
  const res = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: { Authorization: `bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (!res.ok || json.errors) throw new Error(JSON.stringify(json.errors || json));
  return json.data;
}

async function getJson(url, headers = {}) {
  const res = await fetch(url, { headers: { Accept: 'application/json', ...headers } });
  if (!res.ok) throw new Error(`${url} → ${res.status}`);
  return res.json();
}

// Runs one source; on failure falls back to its previous value (or rethrows if there is none).
async function source(name, fallback, fn) {
  try {
    return await fn();
  } catch (error) {
    if (fallback === undefined || fallback === null) throw error;
    console.log(`::warning::${name} failed, keeping previous data: ${error.message}`);
    return fallback;
  }
}

// ── GitHub profile, stats and languages ─────────────────────────────────────
const prevProfile = prev.stats && prev.createdAt && { createdAt: prev.createdAt, stats: prev.stats, repoLanguages: prev.repoLanguages, starred: prev.repos };
const profile = await source('github profile', prevProfile, async () => {
  const { user } = await gql(
    `query($login: String!) {
      user(login: $login) {
        createdAt
        followers { totalCount }
        pullRequests { totalCount }
        openIssues: issues(states: OPEN) { totalCount }
        closedIssues: issues(states: CLOSED) { totalCount }
        repositoriesContributedTo(first: 1, contributionTypes: [COMMIT, ISSUE, PULL_REQUEST, REPOSITORY]) { totalCount }
        contributionsCollection { totalCommitContributions restrictedContributionsCount totalPullRequestReviewContributions }
        repositories(ownerAffiliations: OWNER, isFork: false, first: 100) {
          nodes {
            name isPrivate stargazerCount
            languages(first: 10, orderBy: { field: SIZE, direction: DESC }) { edges { size node { name } } }
          }
        }
      }
    }`,
    { login: LOGIN },
  );

  const repos = user.repositories.nodes;
  const publicRepos = repos.filter((r) => !r.isPrivate);

  const langBytes = new Map();
  for (const repo of repos) {
    for (const { size, node } of repo.languages.edges) langBytes.set(node.name, (langBytes.get(node.name) || 0) + size);
  }
  const totalBytes = [...langBytes.values()].reduce((a, b) => a + b, 0);

  const stats = {
    stars: publicRepos.reduce((sum, r) => sum + r.stargazerCount, 0),
    // Private work only shows up as restricted contributions; the old card counted it too.
    commits: user.contributionsCollection.totalCommitContributions + user.contributionsCollection.restrictedContributionsCount,
    prs: user.pullRequests.totalCount,
    issues: user.openIssues.totalCount + user.closedIssues.totalCount,
    reviews: user.contributionsCollection.totalPullRequestReviewContributions,
    contributedTo: user.repositoriesContributedTo.totalCount,
    followers: user.followers.totalCount,
    publicRepos: publicRepos.length,
  };

  // Same grade formula as github-readme-stats, so the letter matches the old card.
  const exp = (x) => 1 - 2 ** -x;
  const logn = (x) => x / (1 + x);
  const score =
    1 -
    (2 * exp(stats.commits / 250) + 3 * exp(stats.prs / 50) + exp(stats.issues / 25) + exp(stats.reviews / 2) + 4 * logn(stats.stars / 50) + logn(stats.followers / 10)) / 12;
  const levels = ['S', 'A+', 'A', 'A-', 'B+', 'B', 'B-', 'C+', 'C'];
  stats.grade = levels[[1, 12.5, 25, 37.5, 50, 62.5, 75, 87.5, 100].findIndex((t) => score * 100 <= t)];
  stats.percentile = score * 100;

  return {
    createdAt: user.createdAt,
    stats,
    repoLanguages: [...langBytes].sort((a, b) => b[1] - a[1]).map(([name, bytes]) => ({ name, share: bytes / totalBytes })),
    starred: publicRepos.filter((r) => r.stargazerCount > 0).map((r) => ({ name: r.name, stars: r.stargazerCount })).sort((a, b) => b.stars - a.stars),
  };
});

// ── Contribution calendar, all years ────────────────────────────────────────
const contributions = await source('contributions', prev.contributions, async () => {
  const days = new Map();
  const now = new Date();
  for (let year = new Date(profile.createdAt).getUTCFullYear(); year <= now.getUTCFullYear(); year++) {
    const from = new Date(Date.UTC(year, 0, 1)).toISOString();
    const to = year === now.getUTCFullYear() ? now.toISOString() : new Date(Date.UTC(year, 11, 31, 23, 59, 59)).toISOString();
    const data = await gql(
      `query($login: String!, $from: DateTime!, $to: DateTime!) {
        user(login: $login) {
          contributionsCollection(from: $from, to: $to) {
            contributionCalendar { weeks { contributionDays { date contributionCount contributionLevel } } }
          }
        }
      }`,
      { login: LOGIN, from, to },
    );
    for (const week of data.user.contributionsCollection.contributionCalendar.weeks) {
      for (const d of week.contributionDays) days.set(d.date, d);
    }
  }
  const allDays = [...days.values()].sort((a, b) => a.date.localeCompare(b.date));
  const today = allDays.at(-1).date;

  // An empty today doesn't break the streak yet, so count back from yesterday.
  let current = { days: 0, start: null };
  let i = allDays.length - 1;
  if (allDays[i].contributionCount === 0) i--;
  for (; i >= 0 && allDays[i].contributionCount > 0; i--) current = { days: current.days + 1, start: allDays[i].date };

  let longest = { days: 0, start: null, end: null };
  let run = 0;
  for (const [index, d] of allDays.entries()) {
    run = d.contributionCount > 0 ? run + 1 : 0;
    if (run > longest.days) longest = { days: run, start: allDays[index - run + 1].date, end: d.date };
  }

  // Last 53 weeks, aligned so the final column ends on today's weekday.
  const end = new Date(`${today}T00:00:00Z`);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - end.getUTCDay() - 52 * 7);
  const calendar = [];
  for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    const key = d.toISOString().slice(0, 10);
    const day = days.get(key);
    calendar.push({ date: key, count: day?.contributionCount ?? 0, level: day?.contributionLevel ?? 'NONE' });
  }

  return {
    allTime: allDays.reduce((sum, d) => sum + d.contributionCount, 0),
    lastYear: calendar.slice(-365).reduce((sum, d) => sum + d.count, 0),
    since: allDays.find((d) => d.contributionCount > 0).date,
    current,
    longest,
    calendar,
  };
});

// ── Wakapi ──────────────────────────────────────────────────────────────────
const auth = process.env.WAKAPI_API_KEY ? { Authorization: `Basic ${Buffer.from(process.env.WAKAPI_API_KEY).toString('base64')}` } : null;

const allTime = await source('wakapi all-time', prev.wakapi && { totalSeconds: prev.wakapi.totalSeconds, since: prev.wakapi.since, languages: prev.wakapi.languages }, async () => {
  const { data } = await getJson(`${WAKAPI}/users/${WAKAPI_USER}/stats/all_time`);
  return { totalSeconds: data.total_seconds, since: data.start, languages: data.languages.map((l) => ({ name: l.name, seconds: l.total_seconds })) };
});

// Day-by-day totals need the API key; without one the last week on file is kept.
const week = await source('wakapi week', prev.wakapi?.week, async () => {
  if (!auth) throw new Error('WAKAPI_API_KEY is not set');
  const summaries = await getJson(`${WAKAPI}/users/${WAKAPI_USER}/summaries?range=last_7_days`, auth);
  // Wakapi repeats one value in range.date; range.start carries each day's own local date.
  return {
    days: summaries.data.slice(-7).map((d) => ({
      date: (d.range?.start || d.range?.date).slice(0, 10),
      seconds: d.grand_total.total_seconds,
      projects: (d.projects || []).map((p) => ({ name: p.name, seconds: p.total_seconds })),
    })),
  };
});

const rank = await source('wakapi leaderboard', prev.wakapi?.rank, async () => {
  const leaders = await getJson(`${WAKAPI}/leaders`, auth ?? {});
  const me = leaders.data.find((e) => e.user?.username === WAKAPI_USER);
  if (!me) return null; // outside the public top 100 this week
  return {
    rank: me.rank,
    of: leaders.data.length,
    seconds: me.running_total.total_seconds,
    dailyAverage: me.running_total.daily_average,
    languages: (me.running_total.languages || []).map((l) => ({ name: l.name, seconds: l.total_seconds })),
    range: { start: leaders.range.start_date, end: leaders.range.end_date },
  };
});

// ── Stargazers, geocoded with a persistent cache ────────────────────────────
const cachePath = here('./geocache.json');
const cache = fs.existsSync(cachePath) ? JSON.parse(fs.readFileSync(cachePath)) : {};
const key = (loc) => loc.toLowerCase().replace(/\s+/g, ' ');

async function geocode(query) {
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&addressdetails=1&accept-language=en&q=${encodeURIComponent(query)}`;
  const [hit] = await getJson(url, { 'User-Agent': `readme-cards (github.com/${LOGIN}/${LOGIN})` });
  await sleep(1100); // Nominatim allows one request per second.
  return hit ? { lat: +hit.lat, lon: +hit.lon, cc: hit.address?.country_code?.toUpperCase(), country: hit.address?.country } : null;
}

const stargazers = await source('stargazers', prev.stargazers, async () => {
  const people = new Map();
  for (const repo of profile.starred) {
    let after = null;
    do {
      const data = await gql(
        `query($owner: String!, $name: String!, $after: String) {
          repository(owner: $owner, name: $name) {
            stargazers(first: 100, after: $after) { pageInfo { hasNextPage endCursor } nodes { login location } }
          }
        }`,
        { owner: LOGIN, name: repo.name, after },
      );
      const page = data.repository.stargazers;
      for (const n of page.nodes) people.set(n.login, n.location?.trim() || null);
      after = page.pageInfo.hasNextPage ? page.pageInfo.endCursor : null;
    } while (after);
  }

  for (const loc of new Set([...people.values()].filter(Boolean))) {
    if (key(loc) in cache) continue;
    try {
      // Full street addresses often miss; fall back to the trailing "region, country" parts.
      const parts = loc.split(',').map((x) => x.trim()).filter((x) => x && !/^\d+$/.test(x));
      let hit = await geocode(loc);
      for (let from = 1; !hit && from < parts.length; from++) hit = await geocode(parts.slice(from).join(', '));
      cache[key(loc)] = hit;
    } catch (error) {
      console.log(`::warning::geocoding "${loc}" failed: ${error.message}`);
    }
  }
  fs.writeFileSync(cachePath, `${JSON.stringify(cache, null, 1)}\n`);

  const located = [...people.values()].map((loc) => (loc ? cache[key(loc)] : null)).filter((s) => s?.cc);
  return { total: people.size, located };
});

const out = {
  login: LOGIN,
  generatedAt: new Date().toISOString(),
  createdAt: profile.createdAt,
  stats: profile.stats,
  repoLanguages: profile.repoLanguages,
  repos: profile.starred,
  contributions,
  wakapi: { ...allTime, week, rank },
  stargazers,
};
fs.writeFileSync(dataPath, `${JSON.stringify(out, null, 1)}\n`);
console.log(
  `stars ${out.stats.stars} · contributions ${contributions.allTime} · streak ${contributions.current.days}/${contributions.longest.days} · ` +
    `coding ${Math.round(allTime.totalSeconds / 3600)} hrs · rank ${rank?.rank ?? '—'} · stargazers ${stargazers.total} (${stargazers.located.length} located)`,
);
