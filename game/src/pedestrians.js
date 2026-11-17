// The people of Solmar Bay: walkers on the sidewalks who turn at corners,
// run from gunfire and dive out of the way of speeding cars.

import { HORIZONTAL_ROADS, PEDS, ROAD_WIDTH, VERTICAL_ROADS, WORLD } from './config.js';
import { nearestRoadPoint } from './city.js';

const SHIRT_COLORS = ['#e74c3c', '#3498db', '#2ecc71', '#f39c12', '#9b59b6', '#1abc9c', '#e67e22', '#ecf0f1', '#fd79a8', '#00cec9'];
const SKIN_COLORS = ['#f2c9a0', '#d9a066', '#a06a35', '#f7d7b0', '#8a5a2b'];

/** Create one pedestrian on a sidewalk near a road. */
export function createPed(random, x, y) {
  const vertical = random.chance(0.5);
  const road = vertical ? random.pick(VERTICAL_ROADS) : random.pick(HORIZONTAL_ROADS);
  const side = random.chance(0.5) ? 1 : -1;
  const px = x !== undefined ? x : (vertical ? road + side * (ROAD_WIDTH / 2 + 16) : random.range(100, WORLD.width - 100));
  const py = y !== undefined ? y : (vertical ? random.range(100, 2000) : road + side * (ROAD_WIDTH / 2 + 16));
  return {
    x: px, y: py,
    angle: random.range(0, Math.PI * 2),
    speed: PEDS.walkSpeed * random.range(0.8, 1.2),
    shirt: random.pick(SHIRT_COLORS),
    skin: random.pick(SKIN_COLORS),
    walkPhase: random.range(0, Math.PI * 2),
    state: 'walk', // walk | flee | down
    stateTimer: 0,
    fleeX: 0, fleeY: 0,
    axis: vertical ? 'v' : 'h',
    dir: random.chance(0.5) ? 1 : -1,
  };
}

/** Create the pedestrian manager for a city. */
export function createPedestrians(city, random) {
  const peds = [];
  for (let i = 0; i < PEDS.count; i += 1) peds.push(createPed(random));

  /** Everyone near a point runs away from it. */
  function scatter(x, y, radius) {
    for (const ped of peds) {
      if (ped.state === 'down') continue;
      if (Math.hypot(ped.x - x, ped.y - y) < radius) {
        ped.state = 'flee';
        ped.stateTimer = 2.5 + random.range(0, 1.5);
        ped.fleeX = x;
        ped.fleeY = y;
      }
    }
  }

  return {
    peds,
    scatter,
    /** A traffic driver bails out of their car and flees on foot. */
    addFleeingDriver(x, y) {
      const ped = createPed(random, x, y);
      ped.state = 'flee';
      ped.stateTimer = 3;
      ped.fleeX = x;
      ped.fleeY = y;
      peds.push(ped);
      if (peds.length > PEDS.count + 12) peds.shift();
      return ped;
    },
    /** Knock a pedestrian down (hit by a car); returns true when one was hit. */
    knockDownAt(x, y, radius) {
      for (const ped of peds) {
        if (ped.state === 'down') continue;
        if (Math.hypot(ped.x - x, ped.y - y) < radius) {
          ped.state = 'down';
          ped.stateTimer = 4;
          return true;
        }
      }
      return false;
    },
    update(dt, playerCar) {
      for (const ped of peds) {
        ped.walkPhase += dt * (ped.state === 'flee' ? 14 : 8);
        if (ped.state === 'down') {
          ped.stateTimer -= dt;
          if (ped.stateTimer <= 0) {
            ped.state = 'flee';
            ped.stateTimer = 3;
            ped.fleeX = ped.x;
            ped.fleeY = ped.y - 1;
          }
          continue;
        }
        if (ped.state === 'flee') {
          ped.stateTimer -= dt;
          const dx = ped.x - ped.fleeX;
          const dy = ped.y - ped.fleeY;
          const d = Math.hypot(dx, dy) || 1;
          ped.angle = Math.atan2(dy, dx);
          ped.x += (dx / d) * PEDS.fleeSpeed * dt;
          ped.y += (dy / d) * PEDS.fleeSpeed * dt;
          if (ped.stateTimer <= 0) ped.state = 'walk';
        } else {
          // Stroll along the sidewalk; turn at intersections.
          const onCross = ped.axis === 'v'
            ? HORIZONTAL_ROADS.some((ry) => Math.abs(ped.y - ry) < 10)
            : VERTICAL_ROADS.some((rx) => Math.abs(ped.x - rx) < 10);
          if (onCross && random.chance(0.01)) {
            ped.axis = ped.axis === 'v' ? 'h' : 'v';
            ped.dir = random.chance(0.5) ? 1 : -1;
          }
          const vx = ped.axis === 'h' ? ped.dir * ped.speed : 0;
          const vy = ped.axis === 'v' ? ped.dir * ped.speed : 0;
          ped.x += vx * dt;
          ped.y += vy * dt;
          ped.angle = Math.atan2(vy, vx);
          // Turn around at the world edge or the beach.
          if (ped.x < 60 || ped.x > WORLD.width - 60 || ped.y < 60 || ped.y > 2100) ped.dir *= -1;
          // Dive away from a fast car heading at them.
          if (playerCar && Math.hypot(playerCar.x - ped.x, playerCar.y - ped.y) < 130) {
            const carSpeed = Math.hypot(playerCar.vx, playerCar.vy);
            if (carSpeed > 220) {
              ped.state = 'flee';
              ped.stateTimer = 1.6;
              ped.fleeX = playerCar.x;
              ped.fleeY = playerCar.y;
            }
          }
        }
        city.collideCircle(ped, 11);
      }
      // Replace pedestrians who wandered off the map.
      for (let i = 0; i < peds.length; i += 1) {
        const ped = peds[i];
        if (ped.x < 0 || ped.x > WORLD.width || ped.y < 0 || ped.y > 2400) {
          peds[i] = createPed(random);
        }
      }
    },
  };
}
