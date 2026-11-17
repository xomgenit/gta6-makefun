// Cars: arcade driving physics, traffic that follows the road grid, parked
// cars waiting to be stolen, and the collisions between them all.

import {
  CAR_MODELS, HORIZONTAL_ROADS, ROAD_WIDTH, TRAFFIC,
  VERTICAL_ROADS, WORLD,
} from './config.js';
import { isRoadPoint, nearestRoadPoint } from './city.js';

/** Build one car at a position. driver: 'player' | 'traffic' | 'police' | 'parked'. */
export function createCar(model, x, y, angle, driver, color) {
  const spec = CAR_MODELS[model];
  return {
    model, x, y, angle,
    speed: 0,
    vx: 0, vy: 0,
    driver,
    color: color || spec.colors[Math.floor(Math.random() * spec.colors.length)],
    health: 100,
    smokeTimer: 0,
    // Seconds until a wall can dent this car again: without it, sliding
    // along one wall melts a car in a second.
    buildingHitCooldown: 0,
    // Traffic state: which road it follows and which way.
    roadAxis: 'h',
    roadLine: y,
    roadDir: 1,
    laneOffset: 0,
    turnCooldown: 0,
    // Staged cars (screenshot oncoming traffic) never turn: a turn arcs
    // across the road and into the player's lane.
    noTurn: false,
    siren: model === 'cruiser',
    sirenPhase: Math.random() * Math.PI * 2,
  };
}

/** The two collision circles (front and rear) of a car. */
export function carCircles(car) {
  const spec = CAR_MODELS[car.model];
  const half = spec.length / 2 - 8;
  const fx = car.x + Math.cos(car.angle) * half;
  const fy = car.y + Math.sin(car.angle) * half;
  const bx = car.x - Math.cos(car.angle) * half;
  const by = car.y - Math.sin(car.angle) * half;
  return [
    { x: fx, y: fy, r: spec.width / 2 },
    { x: bx, y: by, r: spec.width / 2 },
  ];
}

/** Create the traffic manager for a city. */
export function createVehicles(city, random) {
  const cars = [];
  const parkedSpots = [];
  let respawnTimer = 0;

  /** Scatter parked cars along road edges and in lot corners. */
  function spawnParkedCars() {
    let placed = 0;
    let guard = 0;
    while (placed < 16 && guard < 300) {
      guard += 1;
      const vertical = random.chance(0.5);
      const road = vertical ? random.pick(VERTICAL_ROADS) : random.pick(HORIZONTAL_ROADS);
      const along = vertical
        ? random.range(180, 2000)
        : random.range(180, WORLD.width - 180);
      const side = random.chance(0.5) ? 1 : -1;
      const x = vertical ? road + side * (ROAD_WIDTH / 2 + 24) : along;
      const y = vertical ? along : road + side * (ROAD_WIDTH / 2 + 24);
      if (city.isBlocked(x, y, 26)) continue;
      if (isRoadPoint(x, y)) continue;
      const model = random.pick(['sedan', 'sedan', 'pickup', 'van', 'taxi', 'sports']);
      cars.push(createCar(model, x, y, vertical ? Math.PI / 2 : 0, 'parked'));
      parkedSpots.push({ x, y });
      placed += 1;
    }
  }

  /** Spawn a traffic car on a random road, driving along it. */
  function spawnTrafficCar() {
    const vertical = random.chance(0.5);
    const road = vertical ? random.pick(VERTICAL_ROADS) : random.pick(HORIZONTAL_ROADS);
    const along = vertical ? random.range(120, 1950) : random.range(120, WORLD.width - 120);
    const dir = random.chance(0.5) ? 1 : -1;
    const lane = dir === 1 ? 27 : -27;
    const x = vertical ? road + lane : along;
    const y = vertical ? along : road + lane;
    const angle = vertical ? (dir === 1 ? Math.PI / 2 : -Math.PI / 2) : (dir === 1 ? 0 : Math.PI);
    const model = random.pick(['sedan', 'sedan', 'sedan', 'taxi', 'pickup', 'van', 'sports']);
    const car = createCar(model, x, y, angle, 'traffic');
    car.roadAxis = vertical ? 'v' : 'h';
    car.roadLine = road;
    car.roadDir = dir;
    car.laneOffset = lane;
    car.speed = TRAFFIC.cruiseSpeed * random.range(0.8, 1.1);
    cars.push(car);
    return car;
  }

  function spawnInitialTraffic() {
    for (let i = 0; i < TRAFFIC.count; i += 1) spawnTrafficCar();
  }

  spawnParkedCars();
  spawnInitialTraffic();

  /** Arcade drive step: throttle, steering and drift toward the heading. */
  function driveStep(car, dt, throttle, steer, handbrake) {
    const spec = CAR_MODELS[car.model];
    const forward = throttle > 0 ? spec.accel : throttle < 0 ? spec.accel * 0.9 : 0;
    car.speed += forward * throttle * dt;
    // Drag and rolling resistance.
    car.speed -= car.speed * (handbrake ? 2.2 : 0.55) * dt;
    if (throttle === 0) car.speed -= car.speed * 0.9 * dt;
    car.speed = Math.max(-spec.topSpeed * 0.45, Math.min(spec.topSpeed, car.speed));
    if (Math.abs(car.speed) < 4 && throttle === 0) car.speed = 0;

    const steerAuthority = Math.min(1, Math.abs(car.speed) / 90);
    car.angle += steer * spec.grip * 0.55 * steerAuthority * dt * (car.speed >= 0 ? 1 : -1);

    // Velocity eases toward the heading: grip decides how much it slides.
    const targetVx = Math.cos(car.angle) * car.speed;
    const targetVy = Math.sin(car.angle) * car.speed;
    const grip = handbrake ? 1.6 : spec.grip;
    const k = Math.min(1, grip * dt);
    car.vx += (targetVx - car.vx) * k;
    car.vy += (targetVy - car.vy) * k;
    car.x += car.vx * dt;
    car.y += car.vy * dt;
    return Math.hypot(car.vx - targetVx, car.vy - targetVy);
  }

  /** Traffic AI: follow the road, stop for cars ahead, sometimes turn. */
  function trafficStep(car, dt) {
    const spec = CAR_MODELS[car.model];
    // Is another car close ahead?
    let blocked = false;
    const aheadX = car.x + Math.cos(car.angle) * TRAFFIC.stopDistance;
    const aheadY = car.y + Math.sin(car.angle) * TRAFFIC.stopDistance;
    for (const other of cars) {
      if (other === car) continue;
      if (Math.hypot(other.x - aheadX, other.y - aheadY) < 46) { blocked = true; break; }
    }
    car.turnCooldown -= dt;
    // At an intersection, maybe turn onto the crossing road.
    const onCross = car.roadAxis === 'v'
      ? HORIZONTAL_ROADS.some((ry) => Math.abs(car.y - ry) < 12)
      : VERTICAL_ROADS.some((rx) => Math.abs(car.x - rx) < 12);
    if (onCross && car.turnCooldown <= 0 && !car.noTurn && random.chance(TRAFFIC.turnChance)) {
      car.turnCooldown = 4;
      if (car.roadAxis === 'v') {
        const ry = HORIZONTAL_ROADS.find((r) => Math.abs(car.y - r) < 12);
        car.roadAxis = 'h';
        car.roadLine = ry;
        car.roadDir = random.chance(0.5) ? 1 : -1;
        car.laneOffset = car.roadDir === 1 ? 27 : -27;
      } else {
        const rx = VERTICAL_ROADS.find((r) => Math.abs(car.x - r) < 12);
        car.roadAxis = 'v';
        car.roadLine = rx;
        car.roadDir = random.chance(0.5) ? 1 : -1;
        car.laneOffset = car.roadDir === 1 ? 27 : -27;
      }
    }
    // Steer back onto the lane centre and toward the road direction.
    const laneX = car.roadAxis === 'v' ? car.roadLine + car.laneOffset : car.x;
    const laneY = car.roadAxis === 'h' ? car.roadLine + car.laneOffset : car.y;
    const wantAngle = car.roadAxis === 'v'
      ? (car.roadDir === 1 ? Math.PI / 2 : -Math.PI / 2)
      : (car.roadDir === 1 ? 0 : Math.PI);
    let diff = wantAngle - car.angle;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    const lateral = car.roadAxis === 'v' ? (laneX - car.x) : (laneY - car.y);
    const steer = Math.max(-1, Math.min(1, diff * 2.2 + lateral * 0.03 * (car.roadDir === 1 ? 1 : -1)));
    const target = blocked ? 0 : TRAFFIC.cruiseSpeed * random.range(0.85, 1.05);
    const throttle = car.speed < target ? 1 : 0;
    driveStep(car, dt, throttle, steer, false);
    // Keep traffic on the roads: nudge a lost car back to the nearest road.
    if (!isRoadPoint(car.x, car.y) && Math.hypot(car.vx, car.vy) < 20) {
      const near = nearestRoadPoint(car.x, car.y);
      car.x = near.x;
      car.y = near.y;
    }
    if (Math.abs(car.speed) > spec.topSpeed * 0.95) car.speed = spec.topSpeed * 0.95;
  }

  return {
    cars,
    /** The nearest stealable car (parked or traffic) within range of a point. */
    nearestStealable(x, y, range) {
      let best = null;
      let bestD = range;
      for (const car of cars) {
        if (car.driver !== 'parked' && car.driver !== 'traffic') continue;
        const d = Math.hypot(car.x - x, car.y - y);
        if (d < bestD) { bestD = d; best = car; }
      }
      return best;
    },
    /**
     * Spawn a police cruiser on a road 450-750 px from a point: close enough
     * to join the chase at once, never on top of the player — and never in
     * front of a moving player, where it would drive head-on into them.
     * (vx, vy) is the player's velocity; a stationary player takes any side.
     */
    spawnCruiserNear(x, y, vx, vy) {
      const speed = Math.hypot(vx || 0, vy || 0);
      let px = x;
      let py = y;
      for (let tries = 0; tries < 14; tries += 1) {
        const vertical = Math.random() < 0.5;
        const road = vertical
          ? VERTICAL_ROADS[Math.floor(Math.random() * VERTICAL_ROADS.length)]
          : HORIZONTAL_ROADS[Math.floor(Math.random() * HORIZONTAL_ROADS.length)];
        const along = vertical ? 120 + Math.random() * 1830 : 120 + Math.random() * 3360;
        const cx = vertical ? road : along;
        const cy = vertical ? along : road;
        const d = Math.hypot(cx - x, cy - y);
        if (d < 450 || d > 750) {
          px = cx;
          py = cy;
          continue;
        }
        // Ahead of a fast player means a head-on: keep looking.
        if (speed > 150 && (cx - x) * vx + (cy - y) * vy > 0) {
          px = cx;
          py = cy;
          continue;
        }
        px = cx;
        py = cy;
        break;
      }
      const car = createCar('cruiser', px, py, Math.atan2(y - py, x - px), 'police');
      car.speed = 200;
      cars.push(car);
      return car;
    },
    /** Spawn a car of a model at a place (mission rewards, hideout unlocks). */
    spawnCarAt(model, x, y, driver) {
      const car = createCar(model, x, y, 0, driver || 'parked');
      cars.push(car);
      return car;
    },
    /** Remove a car from the world. */
    removeCar(car) {
      const i = cars.indexOf(car);
      if (i >= 0) cars.splice(i, 1);
    },
    /** Drive the player's car with the input state; returns slide amount. */
    drivePlayer(car, dt, input) {
      const throttle = (input.isDown('up') ? 1 : 0) - (input.isDown('down') ? 1 : 0);
      const steer = (input.isDown('left') ? -1 : 0) + (input.isDown('right') ? 1 : 0);
      const handbrake = input.isDown('handbrake');
      return driveStep(car, dt, throttle, steer, handbrake);
    },
    update(dt, context) {
      const { effects, audio, player, onTrafficDriverFlees } = context;
      for (const car of cars) {
        if (car.driver === 'traffic') trafficStep(car, dt);
        if (car.driver === 'police') continue; // police.js steers cruisers
        if (car.driver === 'parked') continue;
        if (car.buildingHitCooldown > 0) car.buildingHitCooldown -= dt;
        // Buildings and the sea stop cars cold.
        for (const c of carCircles(car)) {
          const body = { x: c.x, y: c.y };
          if (city.collideCircle(body, c.r)) {
            const hit = Math.hypot(car.vx, car.vy);
            if (hit > 120 && car.buildingHitCooldown <= 0) {
              car.buildingHitCooldown = 0.5;
              car.health -= hit * 0.045;
              effects.burst(c.x, c.y, '#ffb703', 8);
              effects.smoke(c.x, c.y, 3);
              effects.shake(0.18, 4);
              audio.crash(hit / 600);
            }
            car.x += body.x - c.x;
            car.y += body.y - c.y;
            car.vx *= -0.25;
            car.vy *= -0.25;
            car.speed *= 0.3;
          }
        }
        // Smoke when badly damaged.
        if (car.health < 35) {
          car.smokeTimer -= dt;
          if (car.smokeTimer <= 0) {
            car.smokeTimer = 0.12;
            effects.smoke(car.x, car.y, 1);
          }
        }
        if (car.health <= 0 && car.driver !== 'parked') {
          // A wrecked car stops where it is: the player is forced out, a
          // traffic driver bails out on foot, and it never drives again.
          if (car.driver === 'player') {
            car.driver = 'parked';
            car.speed = 0;
            car.vx = 0;
            car.vy = 0;
            if (player) player.ejectFromWreck(car);
          } else if (car.driver === 'traffic') {
            car.speed = 0;
            car.vx = 0;
            car.vy = 0;
            if (onTrafficDriverFlees) onTrafficDriverFlees(car);
            else car.driver = 'parked';
          }
        }
      }
      // Car-to-car collisions: each car is two circles (front and rear), so
      // cars in adjacent lanes (54 px apart) pass cleanly and only a real
      // overlap pushes, sparks and dents.
      for (let i = 0; i < cars.length; i += 1) {
        for (let j = i + 1; j < cars.length; j += 1) {
          const a = cars[i];
          const b = cars[j];
          if (Math.abs(b.x - a.x) > 80 || Math.abs(b.y - a.y) > 80) continue;
          const aCircles = carCircles(a);
          const bCircles = carCircles(b);
          // Damage, sparks, sound and the push-apart apply once per car pair
          // per step, however many circle pairs overlap: several pairs at
          // once used to shove a car clean off the road.
          let resolvedThisStep = false;
          for (const ca of aCircles) {
            for (const cb of bCircles) {
              const ox = cb.x - ca.x;
              const oy = cb.y - ca.y;
              const d = Math.hypot(ox, oy);
              const minD = ca.r + cb.r;
              if (d === 0 || d >= minD) continue;
              if (resolvedThisStep) continue;
              resolvedThisStep = true;
              const overlap = minD - d;
              const nx = ox / d;
              const ny = oy / d;
              const impact = Math.abs((a.vx - b.vx) * nx + (a.vy - b.vy) * ny);
              const aFixed = a.driver === 'parked';
              const bFixed = b.driver === 'parked';
              const pushApart = overlap * 0.5;
              if (!aFixed) { a.x -= nx * pushApart * (bFixed ? 2 : 1); a.y -= ny * pushApart * (bFixed ? 2 : 1); }
              if (!bFixed) { b.x += nx * pushApart * (aFixed ? 2 : 1); b.y += ny * pushApart * (aFixed ? 2 : 1); }
              if (impact > 90) {
                a.health -= impact * 0.03;
                b.health -= impact * 0.03;
                effects.burst((ca.x + cb.x) / 2, (ca.y + cb.y) / 2, '#ffd23f', 6);
                audio.crash(impact / 600);
                if (impact > 260 && a.driver === 'traffic' && onTrafficDriverFlees) onTrafficDriverFlees(a);
                if (impact > 260 && b.driver === 'traffic' && onTrafficDriverFlees) onTrafficDriverFlees(b);
                const push = impact * 0.22;
                if (!aFixed) { a.vx -= nx * push; a.vy -= ny * push; }
                if (!bFixed) { b.vx += nx * push; b.vy += ny * push; }
              }
            }
          }
        }
      }
      // Keep the streets full: at most one replacement every 1.5 seconds, and
      // never near the player — and never on the player's own road ahead of
      // a speeding player, where it would be a crash nobody could avoid.
      respawnTimer -= dt;
      if (respawnTimer <= 0) {
        respawnTimer = 1.5;
        const trafficCount = cars.filter((c) => c.driver === 'traffic').length;
        if (trafficCount < TRAFFIC.count && player) {
          const car = spawnTrafficCar();
          let tooClose = Math.hypot(car.x - player.x, car.y - player.y) < 1000;
          if (!tooClose && player.inCar) {
            const playerRoad = nearestRoadPoint(player.x, player.y);
            const onSameRoad = car.roadAxis === playerRoad.axis
              && Math.abs(car.roadLine - (playerRoad.axis === 'v' ? playerRoad.x : playerRoad.y)) < 60;
            const ahead = (car.x - player.x) * player.car.vx + (car.y - player.y) * player.car.vy > 0;
            const near = Math.hypot(car.x - player.x, car.y - player.y) < 1400;
            if (onSameRoad && ahead && near) tooClose = true;
          }
          if (tooClose) cars.splice(cars.indexOf(car), 1);
        }
      }
    },
  };
}
