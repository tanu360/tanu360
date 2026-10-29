// One-off: rasterise Natural Earth country borders into the square grid the map card draws.
// Source: ne_10m_admin_0_countries_ind.geojson (India's worldview) from github.com/nvkelso/natural-earth-vector,
// saved under geo/ (not committed).
// Plain longitude/latitude grid: wide, even squares across the whole card.
import fs from 'node:fs';

const COLS = 104;
const LAT_TOP = 84;
const LAT_BOTTOM = -58;

// India's official worldview: all of Jammu & Kashmir and Ladakh rasterise as India.
const geo = JSON.parse(fs.readFileSync(new URL('./geo/ne_10m_admin_0_countries_ind.geojson', import.meta.url)));
const code = (p) => [p.ISO_A2_EH, p.ISO_A2, p.ADM0_A3].find((c) => c && c !== '-99');
const bboxOf = (ring) =>
  ring.reduce(([x0, y0, x1, y1], [x, y]) => [Math.min(x0, x), Math.min(y0, y), Math.max(x1, x), Math.max(y1, y)], [Infinity, Infinity, -Infinity, -Infinity]);
// 10m data is dense, so test against per-polygon bounding boxes rather than per-country ones.
const polygons = geo.features
  .filter((f) => f.properties.CONTINENT !== 'Antarctica')
  .flatMap((f) =>
    (f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates).map((poly) => {
      const rings = poly;
      return { cc: code(f.properties), rings, bbox: bboxOf(rings[0]) };
    }),
  );

function inRing(x, y, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function countryAt(x, y) {
  for (const { cc, rings, bbox } of polygons) {
    const [x0, y0, x1, y1] = bbox;
    if (x < x0 || x > x1 || y < y0 || y > y1) continue;
    const [outer, ...holes] = rings;
    if (inRing(x, y, outer) && !holes.some((h) => inRing(x, y, h))) return cc;
  }
  return null;
}

const ROWS = Math.round((COLS * (LAT_TOP - LAT_BOTTOM)) / 360);
const cellLon = 360 / COLS;
const cellLat = (LAT_TOP - LAT_BOTTOM) / ROWS;
const cells = [];
for (let row = 0; row < ROWS; row++) {
  for (let col = 0; col < COLS; col++) {
    const hits = new Map();
    for (const fy of [0.2, 0.5, 0.8]) {
      for (const fx of [0.2, 0.5, 0.8]) {
        const cc = countryAt(-180 + (col + fx) * cellLon, LAT_TOP - (row + fy) * cellLat);
        if (cc) hits.set(cc, (hits.get(cc) || 0) + 1);
      }
    }
    const total = [...hits.values()].reduce((a, b) => a + b, 0);
    if (total >= 3) cells.push([col, row, [...hits].sort((a, b) => b[1] - a[1])[0][0]]);
  }
}

fs.writeFileSync(new URL('./assets/world-grid.json', import.meta.url), JSON.stringify({ cols: COLS, rows: ROWS, latTop: LAT_TOP, latBottom: LAT_BOTTOM, cells }));
console.log(`${COLS}×${ROWS} grid, ${cells.length} land cells`);
