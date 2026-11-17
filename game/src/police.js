// The Solmar Bay Police Department: a wanted level from 0 to 5 stars, foot
// cops who chase and shoot, cruisers that ram, busted and heat cooldowns.

import { HORIZONTAL_ROADS, POLICE, ROAD_WIDTH, VERTICAL_ROADS } from './config.js';
import { isRoadPoint, nearestRoadPoint } from './city.js';
import { carCircles } from './vehicles.js';

const COP_SPEED = 175;
const COP_SHOOT_RANGE = 330;
const COP_FIRE_INTERVAL = 1.1;
const CRUISER_TOP_SPEED = 545;

/** Steering input (-1..1) to point a car at a target. */
function steerToward(car, tx, ty, gain) {
  const wantAngle = Math.atan2(ty - car.y, tx - car.x);
  let diff = wantAngle - car.angle;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return Math.max(-1, Math.min(1, diff * gain));
}

/**
 * Make sure a cruiser's tracked road matches where it actually is: when it
 * has drifted off its road (a shove, a spawn), snap it to the nearest one,
 * facing the way it already heads.
 */
function resnapCruiserRoad(car) {
  const offRoad = car.roadAxis === 'v'
    ? Math.abs(car.x - car.roadLine) > ROAD_WIDTH / 2
    : Math.abs(car.y - car.roadLine) > ROAD_WIDTH / 2;
  if (!offRoad) return;
  let bestAxis = 'v';
  let bestLine = VERTICAL_ROADS[0];
  let bestD = Infinity;
  for (const rx of VERTICAL_ROADS) {
    const d = Math.abs(car.x - rx);
    if (d < bestD) { bestD = d; bestAxis = 'v'; bestLine = rx; }
  }
  for (const ry of HORIZONTAL_ROADS) {
    const d = Math.abs(car.y - ry);
    if (d < bestD) { bestD = d; bestAxis = 'h'; bestLine = ry; }
  }
  car.roadAxis = bestAxis;
  car.roadLine = bestLine;
  const headingEast = Math.cos(car.angle) > 0;
  const headingSouth = Math.sin(car.angle) > 0;
  car.roadDir = bestAxis === 'v' ? (headingSouth ? 1 : -1) : (headingEast ? 1 : -1);
  car.laneOffset = car.roadDir === 1 ? 27 : -27;
}

/** Create the police manager for a city. */
export function createPolice(city, random) {
  const footCops = [];
  let stars = 0;
  let unseenTimer = 0;
  let coolTimer = 0;
  let bustedTimer = 0;
  let spawnTimer = 0;

  /** A foot cop spawns at the edge of the player's view and runs in. */
  function spawnFootCop(player) {
    const angle = random.range(0, Math.PI * 2);
    const dist = 620 + random.range(0, 120);
    const x = player.x + Math.cos(angle) * dist;
    const y = player.y + Math.sin(angle) * dist;
    footCops.push({
      x: Math.max(40, Math.min(3560, x)),
      y: Math.max(40, Math.min(2360, y)),
      angle: 0,
      health: 100,
      fireTimer: 1,
      walkPhase: random.range(0, Math.PI * 2),
    });
  }

  return {
    footCops,
    get stars() {
      return stars;
    },
    setStars(value) {
      stars = Math.max(0, Math.min(POLICE.maxStars, value));
      unseenTimer = 0;
      coolTimer = 0;
    },
    addWanted(amount) {
      if (amount <= 0) return;
      stars = Math.min(POLICE.maxStars, stars + amount);
      unseenTimer = 0;
      coolTimer = 0;
    },
    clearWanted() {
      stars = 0;
      unseenTimer = 0;
      coolTimer = 0;
      bustedTimer = 0;
    },
    /** True when any cop can currently see the player. */
    playerSeen(player, vehicles) {
      for (const cop of footCops) {
        if (Math.hypot(cop.x - player.x, cop.y - player.y) < 480) return true;
      }
      for (const car of vehicles.cars) {
        if (car.driver === 'police' && Math.hypot(car.x - player.x, car.y - player.y) < 520) return true;
      }
      return false;
    },
    /** How many cruisers are currently in pursuit. */
    cruiserCount(vehicles) {
      return vehicles.cars.filter((c) => c.driver === 'police').length;
    },
    update(dt, context) {
      const { player, vehicles, effects, audio, onBusted } = context;
      const wantedCruisers = stars >= 1 ? Math.min(4, stars) : 0;
      const wantedFoot = stars >= 1 ? Math.min(6, stars * POLICE.footPerStar) : 0;

      spawnTimer -= dt;
      if (stars > 0 && spawnTimer <= 0) {
        spawnTimer = 1.2;
        if (this.cruiserCount(vehicles) < wantedCruisers && player.inCar) {
          vehicles.spawnCruiserNear(player.x, player.y, player.car.vx, player.car.vy);
        } else if (footCops.length < wantedFoot) {
          spawnFootCop(player);
        }
      }
      if (stars === 0) {
        // The heat is off: cops give up and walk away, cruisers park.
        for (let i = footCops.length - 1; i >= 0; i -= 1) {
          const cop = footCops[i];
          const dx = cop.x - player.x;
          const dy = cop.y - player.y;
          const d = Math.hypot(dx, dy) || 1;
          cop.x += (dx / d) * 90 * dt;
          cop.y += (dy / d) * 90 * dt;
          if (d > 800) footCops.splice(i, 1);
        }
        for (const car of vehicles.cars) {
          if (car.driver === 'police') {
            car.speed -= car.speed * dt;
            if (Math.hypot(car.x - player.x, car.y - player.y) > 700) {
              car.driver = 'parked';
            }
          }
        }
        return;
      }

      // Heat cools when nobody has seen the player for a while.
      if (this.playerSeen(player, vehicles)) {
        unseenTimer = 0;
        coolTimer = 0;
      } else {
        unseenTimer += dt;
        if (unseenTimer > POLICE.unseenGrace) {
          coolTimer += dt;
          if (coolTimer > POLICE.coolDownPerStar) {
            coolTimer = 0;
            stars -= 1;
            if (stars <= 0) this.clearWanted();
          }
        }
      }

      // Foot cops: run at the player, shoot when in range.
      let busted = false;
      for (let i = footCops.length - 1; i >= 0; i -= 1) {
        const cop = footCops[i];
        if (cop.health <= 0) {
          effects.burst(cop.x, cop.y, '#4a6fa5', 8);
          footCops.splice(i, 1);
          continue;
        }
        const dx = player.x - cop.x;
        const dy = player.y - cop.y;
        const dist = Math.hypot(dx, dy) || 1;
        cop.angle = Math.atan2(dy, dx);
        cop.walkPhase += dt * 10;
        if (dist > 120) {
          cop.x += (dx / dist) * COP_SPEED * dt;
          cop.y += (dy / dist) * COP_SPEED * dt;
        }
        city.collideCircle(cop, 12);
        cop.fireTimer -= dt;
        if (dist < COP_SHOOT_RANGE && cop.fireTimer <= 0 && player.isAlive() && !player.inCar) {
          cop.fireTimer = COP_FIRE_INTERVAL * (0.85 + Math.random() * 0.4);
          const spread = (Math.random() - 0.5) * 0.3;
          const aim = Math.atan2(dy, dx) + spread;
          effects.muzzle(cop.x, cop.y, aim, Math.min(dist, COP_SHOOT_RANGE));
          audio.enemyShot();
          if (Math.abs(spread) < 0.08) player.damage(8);
        }
        // Busted: a cop holds the player still at arm's length.
        if (!player.inCar && dist < POLICE.bustedRange && player.speed() < 30) {
          bustedTimer += dt;
          if (bustedTimer > POLICE.bustedHoldSeconds) busted = true;
        }
      }
      if (footCops.length === 0 || player.inCar || player.speed() >= 30) {
        if (!busted) bustedTimer = Math.max(0, bustedTimer - dt * 2);
      }
      if (busted && onBusted) onBusted();

      // Cruisers: follow the road grid toward the player — turning at
      // intersections for the route that closes the distance fastest — and
      // steer straight at the player to ram once they are close.
      for (const car of vehicles.cars) {
        if (car.driver !== 'police') continue;
        car.sirenPhase += dt * 9;
        const dx = player.x - car.x;
        const dy = player.y - car.y;
        const dist = Math.hypot(dx, dy) || 1;
        // Aim slightly ahead of a moving player.
        const lead = 0.45;
        const tx = player.x + (player.inCar ? player.car.vx * lead : 0);
        const ty = player.y + (player.inCar ? player.car.vy * lead : 0);
        const top = CRUISER_TOP_SPEED * (0.85 + stars * 0.05);
        const throttle = car.speed < top ? 1 : 0;
        let steer = 0;

        if (dist < 240) {
          // Close in: ram from behind, or sideswipe when the player is
          // coming at the cruiser head-on — a head-on helps nobody.
          const playerVx = player.inCar ? player.car.vx : 0;
          const playerVy = player.inCar ? player.car.vy : 0;
          const closingHeadOn = (playerVx * dx + playerVy * dy) < 0
            && Math.hypot(playerVx, playerVy) > 200;
          if (closingHeadOn) {
            const side = (car.x - player.x) * -playerVy + (car.y - player.y) * playerVx > 0 ? 1 : -1;
            const speed = Math.hypot(playerVx, playerVy) || 1;
            const px = -playerVy / speed;
            const py = playerVx / speed;
            steer = steerToward(car, tx + px * 70 * side, ty + py * 70 * side, 2.4);
          } else {
            steer = steerToward(car, tx, ty, 2.4);
          }
        } else if (!isRoadPoint(car.x, car.y)) {
          // Off the roads: head for the nearest road.
          const near = nearestRoadPoint(car.x, car.y);
          steer = steerToward(car, near.x, near.y, 2.4);
        } else {
          // On a road: keep to the lane, and at each intersection pick the
          // turn (or straight on) that gets closest to the player.
          resnapCruiserRoad(car);
          car.turnCooldown -= dt;
          const onCross = car.roadAxis === 'v'
            ? HORIZONTAL_ROADS.some((ry) => Math.abs(car.y - ry) < 14)
            : VERTICAL_ROADS.some((rx) => Math.abs(car.x - rx) < 14);
          if (onCross && car.turnCooldown <= 0) {
            car.turnCooldown = 2.5;
            const options = [{ axis: car.roadAxis, line: car.roadLine, dir: car.roadDir }];
            if (car.roadAxis === 'v') {
              const ry = HORIZONTAL_ROADS.find((r) => Math.abs(car.y - r) < 14);
              options.push({ axis: 'h', line: ry, dir: 1 });
              options.push({ axis: 'h', line: ry, dir: -1 });
            } else {
              const rx = VERTICAL_ROADS.find((r) => Math.abs(car.x - r) < 14);
              options.push({ axis: 'v', line: rx, dir: 1 });
              options.push({ axis: 'v', line: rx, dir: -1 });
            }
            let best = options[0];
            let bestScore = Infinity;
            for (const o of options) {
              const px = o.axis === 'v' ? o.line : car.x + o.dir * 150;
              const py = o.axis === 'h' ? o.line : car.y + o.dir * 150;
              const score = Math.abs(px - tx) + Math.abs(py - ty);
              if (score < bestScore) {
                bestScore = score;
                best = o;
              }
            }
            car.roadAxis = best.axis;
            car.roadLine = best.line;
            car.roadDir = best.dir;
            car.laneOffset = best.dir === 1 ? 27 : -27;
          }
          const wantAngle = car.roadAxis === 'v'
            ? (car.roadDir === 1 ? Math.PI / 2 : -Math.PI / 2)
            : (car.roadDir === 1 ? 0 : Math.PI);
          let diff = wantAngle - car.angle;
          while (diff > Math.PI) diff -= Math.PI * 2;
          while (diff < -Math.PI) diff += Math.PI * 2;
          const laneTarget = car.roadAxis === 'v'
            ? car.roadLine + car.laneOffset - car.x
            : car.roadLine + car.laneOffset - car.y;
          steer = Math.max(-1, Math.min(1, diff * 2.2 + laneTarget * 0.012 * car.roadDir));
        }

        // Arcade drive step, as the player's car uses.
        const accel = 430;
        car.speed += accel * throttle * dt;
        car.speed -= car.speed * 0.5 * dt;
        car.speed = Math.max(-200, Math.min(top, car.speed));
        const steerAuthority = Math.min(1, Math.abs(car.speed) / 90);
        car.angle += steer * 4.0 * 0.55 * steerAuthority * dt * (car.speed >= 0 ? 1 : -1);
        const targetVx = Math.cos(car.angle) * car.speed;
        const targetVy = Math.sin(car.angle) * car.speed;
        const k = Math.min(1, 4.0 * dt);
        car.vx += (targetVx - car.vx) * k;
        car.vy += (targetVy - car.vy) * k;
        car.x += car.vx * dt;
        car.y += car.vy * dt;
        // A wrecked cruiser stops where it is instead of chasing on fumes.
        if (car.health <= 0) {
          car.driver = 'parked';
          car.speed = 0;
          car.vx = 0;
          car.vy = 0;
          continue;
        }
        // Buildings stop a cruiser just like any other car.
        for (const c of carCircles(car)) {
          const body = { x: c.x, y: c.y };
          if (city.collideCircle(body, c.r)) {
            car.x += body.x - c.x;
            car.y += body.y - c.y;
            car.vx *= -0.25;
            car.vy *= -0.25;
            car.speed *= 0.3;
          }
        }
        // Cruisers that lose the player for good give up and park.
        if (dist > 1100) {
          car.driver = 'parked';
          car.speed = 0;
        }
        // Ramming the player's car dents it.
        if (player.inCar && dist < 66) {
          player.car.health -= 8 * dt;
          effects.shake(0.1, 2);
        }
      }
    },
    /** Damage the foot cop nearest a bullet's path; returns the cop hit. */
    hitTest(x, y, angle, range) {
      let best = null;
      let bestD = range;
      for (const cop of footCops) {
        const dx = cop.x - x;
        const dy = cop.y - y;
        const along = dx * Math.cos(angle) + dy * Math.sin(angle);
        if (along < 0 || along > range) continue;
        const across = Math.abs(-dx * Math.sin(angle) + dy * Math.cos(angle));
        if (across < 16 && along < bestD) {
          bestD = along;
          best = cop;
        }
      }
      return best;
    },
  };
}
