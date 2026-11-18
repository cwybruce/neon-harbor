// The harbor city: a road grid on the land, the harbour water to the east, three
// wooden piers reaching into it, a container yard in the south, and buildings filling
// the blocks between the roads. Everything is built from one seed, so the city is
// the same every time the game loads.

import { WORLD } from './config.js';
import { pick, range } from './random.js';

const ROADS_V = [300, 700, 1100, 1500, 1850];
const ROADS_H = [300, 700, 1100, 1500];
const ROAD_W = 64;

/** A tiny deterministic hash of two integers, for window lights and details. */
export function hash2(a, b) {
  let h = (a * 374761393 + b * 668265263) | 0;
  h = (h ^ (h >>> 13)) | 0;
  h = Math.imul(h, 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export function buildCity(random) {
  const solids = [];
  const piers = [
    { x: WORLD.waterX, y: 140, w: 190, h: 80, name: 'Pier 1' },
    { x: WORLD.waterX, y: 910, w: 160, h: 80, name: 'Pier 3' },
    { x: WORLD.waterX, y: 1460, w: 160, h: 80, name: 'Pier 5' },
  ];
  const yard = { x: 240, y: 1560, w: 1400, h: 300 };

  // Container stacks in the yard: rows with aisles between them.
  const containerColors = ['containerA', 'containerB', 'containerC', 'containerD'];
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 7; col++) {
      if (random() < 0.18) continue;
      solids.push({
        x: yard.x + 20 + col * 190,
        y: yard.y + 20 + row * 90,
        w: 150,
        h: 58,
        kind: 'container',
        color: pick(random, containerColors),
      });
    }
  }

  // Buildings fill every block between the roads, except the yard band and two lots.
  const lots = new Set(['2,0', '0,3']);
  for (let ci = 0; ci < ROADS_V.length; ci++) {
    for (let ri = 0; ri < ROADS_H.length; ri++) {
      const key = `${ci},${ri}`;
      const bx0 = ci === 0 ? 60 : ROADS_V[ci - 1] + ROAD_W / 2 + 24;
      const bx1 = ROADS_V[ci] - ROAD_W / 2 - 24;
      const by0 = ri === 0 ? 60 : ROADS_H[ri - 1] + ROAD_W / 2 + 24;
      const by1 = ROADS_H[ri] - ROAD_W / 2 - 24;
      if (by0 > 1500) continue; // the yard band
      if (lots.has(key)) continue; // parking lots
      const bw = bx1 - bx0;
      const bh = by1 - by0;
      if (bw < 90 || bh < 90) continue;
      // One or two buildings per block, sized to the block.
      const split = bw > 260 && random() < 0.6;
      const parts = split ? 2 : 1;
      for (let p = 0; p < parts; p++) {
        const w = split ? (bw - 30) / 2 : bw;
        const h = bh * (0.55 + random() * 0.35);
        solids.push({
          x: bx0 + (split ? p * (w + 30) : 0),
          y: by0 + (bh - h) / 2,
          w,
          h,
          kind: 'building',
          seed: Math.floor(random() * 100000),
        });
      }
    }
  }

  // Parked cars: on the open waterfront strip east of the dock road, and in the
  // two parking lots. Never on a driving lane, so traffic never drives through one.
  const carSpawns = [
    { x: 1950, y: 500, angle: Math.PI / 2 },
    { x: 1950, y: 900, angle: -Math.PI / 2 },
    { x: 1950, y: 1300, angle: Math.PI / 2 },
    { x: 1950, y: 1650, angle: -Math.PI / 2 },
    { x: 800, y: 150, angle: 0 },
    { x: 950, y: 150, angle: 0 },
    { x: 880, y: 210, angle: 0 },
    { x: 150, y: 1220, angle: Math.PI / 2 },
    { x: 150, y: 1320, angle: Math.PI / 2 },
    { x: 150, y: 1420, angle: Math.PI / 2 },
  ];

  // Moored boats in the water, beside the piers.
  const boatSpawns = [
    { x: 2140, y: 270, angle: Math.PI / 2 },
    { x: 2140, y: 1030, angle: -Math.PI / 2 },
    { x: 2140, y: 1420, angle: Math.PI / 2 },
    { x: 2320, y: 700, angle: -Math.PI / 2 },
    { x: 2200, y: 1650, angle: Math.PI / 2 },
  ];

  const markers = {
    start: { x: 1850, y: 980 },
    yardCrate: { x: 700, y: 1654 },
    pier3: { x: 2150, y: 950 },
    northGate: { x: 1100, y: 300 },
    buoy: { x: 2380, y: 700 },
    lighthouse: { x: 2190, y: 180 },
    truck: { x: 1000, y: 1654 },
  };

  return {
    width: WORLD.width,
    height: WORLD.height,
    waterX: WORLD.waterX,
    roadsV: ROADS_V,
    roadsH: ROADS_H,
    roadWidth: ROAD_W,
    solids,
    piers,
    yard,
    carSpawns,
    boatSpawns,
    markers,
  };
}

/** True when the point is harbour water (not on a pier deck). */
export function isWaterAt(city, x, y) {
  if (x < city.waterX || y < 0 || y > city.height) return false;
  for (const p of city.piers) {
    if (x >= p.x && x <= p.x + p.w && y >= p.y && y <= p.y + p.h) return false;
  }
  return true;
}

/** True when the point is on a pier deck. */
export function onPier(city, x, y) {
  for (const p of city.piers) {
    if (x >= p.x && x <= p.x + p.w && y >= p.y && y <= p.y + p.h) return true;
  }
  return false;
}

function circleHitsRect(cx, cy, r, rect) {
  const nx = Math.max(rect.x, Math.min(cx, rect.x + rect.w));
  const ny = Math.max(rect.y, Math.min(cy, rect.y + rect.h));
  const dx = cx - nx;
  const dy = cy - ny;
  return dx * dx + dy * dy < r * r;
}

/** Push a circle out of every solid it overlaps; returns true when it moved. */
export function resolveSolids(city, pos, r) {
  let moved = false;
  for (const s of city.solids) {
    if (!circleHitsRect(pos.x, pos.y, r, s)) continue;
    const nx = Math.max(s.x, Math.min(pos.x, s.x + s.w));
    const ny = Math.max(s.y, Math.min(pos.y, s.y + s.h));
    let dx = pos.x - nx;
    let dy = pos.y - ny;
    let d = Math.hypot(dx, dy);
    if (d < 0.001) {
      // Centre inside the rectangle: push out along the smallest overlap.
      const left = pos.x - s.x;
      const right = s.x + s.w - pos.x;
      const top = pos.y - s.y;
      const bottom = s.y + s.h - pos.y;
      const m = Math.min(left, right, top, bottom);
      if (m === left) { pos.x = s.x - r; }
      else if (m === right) { pos.x = s.x + s.w + r; }
      else if (m === top) { pos.y = s.y - r; }
      else { pos.y = s.y + s.h + r; }
    } else {
      dx /= d;
      dy /= d;
      pos.x = nx + dx * r;
      pos.y = ny + dy * r;
    }
    moved = true;
  }
  return moved;
}

/** Keep a land creature (on foot or in a car) out of the water and inside the map. */
export function resolveLand(city, pos, r) {
  resolveSolids(city, pos, r);
  pos.x = Math.max(r, Math.min(city.width - r, pos.x));
  pos.y = Math.max(r, Math.min(city.height - r, pos.y));
  if (isWaterAt(city, pos.x, pos.y)) {
    // Pushed into the harbour: step back to the waterline.
    pos.x = city.waterX - r - 1;
    resolveSolids(city, pos, r);
  }
}

/** Keep a boat in the water: land and piers are solid for it. */
export function resolveBoat(city, pos, r) {
  resolveSolids(city, pos, r);
  if (pos.x < city.waterX + r) pos.x = city.waterX + r;
  if (pos.x > city.width - r) pos.x = city.width - r;
  pos.y = Math.max(r, Math.min(city.height - r, pos.y));
  for (const p of city.piers) {
    const rect = { x: p.x - r, y: p.y - r, w: p.w + 2 * r, h: p.h + 2 * r };
    if (circleHitsRect(pos.x, pos.y, r, rect)) {
      // Push out along the smallest side.
      const left = pos.x - rect.x;
      const right = rect.x + rect.w - pos.x;
      const top = pos.y - rect.y;
      const bottom = rect.y + rect.h - pos.y;
      const m = Math.min(left, right, top, bottom);
      if (m === left) pos.x = rect.x - r;
      else if (m === right) pos.x = rect.x + rect.w + r;
      else if (m === top) pos.y = rect.y - r;
      else pos.y = rect.y + rect.h + r;
    }
  }
}

/** The nearest point on the road grid to (x, y), for traffic and pedestrians. */
export function nearestRoadPoint(city, x, y) {
  let best = null;
  let bestD = Infinity;
  for (const rx of city.roadsV) {
    const d = Math.abs(x - rx);
    if (d < bestD) { bestD = d; best = { x: rx, y: Math.max(80, Math.min(city.height - 80, y)) }; }
  }
  for (const ry of city.roadsH) {
    const d = Math.abs(y - ry);
    if (d < bestD) { bestD = d; best = { x: Math.max(80, Math.min(city.width - 80, x)), y: ry }; }
  }
  return best;
}
