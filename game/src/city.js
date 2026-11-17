// SOLMAR — the city itself: a road grid with blocks of buildings, palm trees,
// a beach and the sea, plus the collision and road helpers every system uses.

import {
  BEACH_Y, DISTRICTS, HORIZONTAL_ROADS, LANDMARKS, PALETTE, ROAD_WIDTH,
  VERTICAL_ROADS, WATER_Y, WORLD,
} from './config.js';

/** How far a building sits back from the road edge, in pixels. */
const BLOCK_MARGIN = 46;
/** A building never overlaps a landmark's clearing. */
const LANDMARK_CLEARING = 190;

/** True when (x, y) lies on a road (including its sidewalk edge). */
export function isRoadPoint(x, y) {
  const half = ROAD_WIDTH / 2;
  for (const rx of VERTICAL_ROADS) {
    if (Math.abs(x - rx) <= half && y < BEACH_Y) return true;
  }
  for (const ry of HORIZONTAL_ROADS) {
    if (Math.abs(y - ry) <= half) return true;
  }
  return false;
}

/** True when (x, y) is on drivable ground: road, beach parking or the pier road. */
export function isDrivablePoint(x, y) {
  if (y >= WATER_Y) return false;
  if (isRoadPoint(x, y)) return true;
  // The beachfront promenade runs east-west along the sand.
  if (y > BEACH_Y && y < BEACH_Y + 70) return true;
  return false;
}

/** Distance from (x, y) to the nearest road centre line. */
export function distanceToRoad(x, y) {
  let best = Infinity;
  for (const rx of VERTICAL_ROADS) best = Math.min(best, Math.abs(x - rx));
  for (const ry of HORIZONTAL_ROADS) best = Math.min(best, Math.abs(y - ry));
  return best;
}

/** Snap a point to the nearest road centre. */
export function nearestRoadPoint(x, y) {
  let best = null;
  let bestD = Infinity;
  for (const rx of VERTICAL_ROADS) {
    const d = Math.abs(x - rx);
    if (d < bestD) { bestD = d; best = { x: rx, y, axis: 'v' }; }
  }
  for (const ry of HORIZONTAL_ROADS) {
    const d = Math.abs(y - ry);
    if (d < bestD) { bestD = d; best = { x, y: ry, axis: 'h' }; }
  }
  return best;
}

/** The district name for a world position, for the HUD zone label. */
export function districtAt(x, y) {
  for (const d of DISTRICTS) {
    if (x >= d.x0 && x < d.x1 && y >= d.y0 && y < d.y1) return d.name;
  }
  return 'SOLMAR BAY';
}

/**
 * Build the city from a seed: buildings fill the blocks between roads, palms
 * line the beachfront and the main avenues, and three cash stashes hide in
 * quiet corners. Landmarks keep a clearing around them.
 */
export function createCity(random) {
  const buildings = [];
  const trees = [];
  const roofColors = PALETTE.buildingRoofs;
  const wallColors = PALETTE.buildingWalls;

  const vEdges = [0, ...VERTICAL_ROADS, WORLD.width];
  const hEdges = [0, ...HORIZONTAL_ROADS, BEACH_Y];

  for (let vi = 0; vi < vEdges.length - 1; vi += 1) {
    for (let hi = 0; hi < hEdges.length - 1; hi += 1) {
      const x0 = vEdges[vi] + (vi === 0 ? ROAD_WIDTH / 2 : ROAD_WIDTH / 2) + BLOCK_MARGIN;
      const x1 = vEdges[vi + 1] - ROAD_WIDTH / 2 - BLOCK_MARGIN;
      const y0 = hEdges[hi] + (hi === 0 ? ROAD_WIDTH / 2 : ROAD_WIDTH / 2) + BLOCK_MARGIN;
      const y1 = hEdges[hi + 1] - ROAD_WIDTH / 2 - BLOCK_MARGIN;
      if (x1 - x0 < 90 || y1 - y0 < 90) continue;
      const count = random.int(2, 4);
      for (let b = 0; b < count; b += 1) {
        const w = random.range(90, Math.min(220, x1 - x0));
        const h = random.range(80, Math.min(190, y1 - y0));
        const x = random.range(x0, x1 - w);
        const y = random.range(y0, y1 - h);
        const cx = x + w / 2;
        const cy = y + h / 2;
        let nearLandmark = false;
        for (const key of Object.keys(LANDMARKS)) {
          const lm = LANDMARKS[key];
          if (Math.hypot(cx - lm.x, cy - lm.y) < LANDMARK_CLEARING) { nearLandmark = true; break; }
        }
        if (nearLandmark) continue;
        let overlaps = false;
        for (const other of buildings) {
          if (x < other.x + other.w + 18 && x + w + 18 > other.x && y < other.y + other.h + 18 && y + h + 18 > other.y) {
            overlaps = true;
            break;
          }
        }
        if (overlaps) continue;
        const ci = random.int(0, roofColors.length - 1);
        buildings.push({
          x, y, w, h,
          roof: roofColors[ci],
          wall: wallColors[ci],
          height: random.int(2, 6),
          windows: random.int(3, 8),
        });
      }
      // A tree or two in the block's spare corners.
      if (random.chance(0.6)) {
        trees.push({ x: random.range(x0, x1), y: random.range(y0, y1), kind: 'palm' });
      }
    }
  }

  // Palms along the beachfront promenade and the main north-south avenue.
  for (let x = 120; x < WORLD.width - 60; x += 130) {
    if (random.chance(0.75)) trees.push({ x: x + random.range(-14, 14), y: BEACH_Y + 34, kind: 'palm' });
  }
  for (let y = 140; y < BEACH_Y; y += 170) {
    if (random.chance(0.6)) trees.push({ x: 1500 + 78, y, kind: 'palm' });
    if (random.chance(0.6)) trees.push({ x: 1500 - 78, y, kind: 'palm' });
  }

  // Three hidden cash stashes in quiet corners of the city.
  const stashes = [
    { x: 420, y: 1720, taken: false },
    { x: 3220, y: 480, taken: false },
    { x: 2050, y: 2060, taken: false },
  ];

  const city = { buildings, trees, stashes, landmarks: LANDMARKS };

  /** Push a circle out of every solid shape; returns true when it was pushed. */
  city.collideCircle = function collideCircle(body, radius) {
    let pushed = false;
    // World bounds and the sea.
    if (body.x < radius) { body.x = radius; pushed = true; }
    if (body.x > WORLD.width - radius) { body.x = WORLD.width - radius; pushed = true; }
    if (body.y < radius) { body.y = radius; pushed = true; }
    if (body.y > WATER_Y - radius) { body.y = WATER_Y - radius; pushed = true; }
    for (const b of buildings) {
      const cx = Math.max(b.x, Math.min(body.x, b.x + b.w));
      const cy = Math.max(b.y, Math.min(body.y, b.y + b.h));
      const dx = body.x - cx;
      const dy = body.y - cy;
      const d2 = dx * dx + dy * dy;
      if (d2 < radius * radius) {
        if (d2 > 0.01) {
          const d = Math.sqrt(d2);
          body.x = cx + (dx / d) * radius;
          body.y = cy + (dy / d) * radius;
        } else {
          body.y = b.y - radius;
        }
        pushed = true;
      }
    }
    return pushed;
  };

  /** True when a circle at (x, y) overlaps a building or the sea. */
  city.isBlocked = function isBlocked(x, y, radius) {
    if (y > WATER_Y - radius) return true;
    for (const b of buildings) {
      const cx = Math.max(b.x, Math.min(x, b.x + b.w));
      const cy = Math.max(b.y, Math.min(y, b.y + b.h));
      if ((x - cx) * (x - cx) + (y - cy) * (y - cy) < radius * radius) return true;
    }
    return false;
  };

  return city;
}
