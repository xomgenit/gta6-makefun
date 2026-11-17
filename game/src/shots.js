// The screenshot scenes behind ?shot=chase|foot|drive|mission. Each one sets
// up a real game state — a wanted chase, a walk downtown, a beach drive, a
// pier shootout — then plays the real rules forward with a small autopilot,
// so the frame is what a short game really looks like. The same seed always
// gives the same frame.

import { LANDMARKS, STEP } from './config.js';
import { MISSION_LIST } from './missions.js';

/** The beachfront promenade's y, matching the renderer's road drawing. */
const BEACH_PROMENADE_Y = 2215;

/** Steer a car along a road: aim at the lane centre ahead of it. */
function roadSteer(car, axis, line, dir) {
  const wantAngle = axis === 'v'
    ? (dir === 1 ? Math.PI / 2 : -Math.PI / 2)
    : (dir === 1 ? 0 : Math.PI);
  let diff = wantAngle - car.angle;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  const lateral = axis === 'v' ? (line + 27 - car.x) : (line + 27 - car.y);
  return Math.max(-1, Math.min(1, diff * 2.4 + lateral * 0.03 * dir));
}

/** A blank pilot action: nothing held, no mouse. */
function blankPilot() {
  return { up: false, down: false, left: false, right: false, sprint: false, handbrake: false, interact: false, mouseDown: false, aimX: 0, aimY: 0 };
}

/**
 * Set `game` to the named scene and return the seconds to simulate plus the
 * autopilot that drives it. Any other name stages the chase.
 */
export function stageShot(name, game) {
  const { player, vehicles, peds, enemies, police, missions, city } = game;

  if (name === 'foot') {
    // On foot downtown, mission 1 running, peds and traffic all around.
    player.x = 1500;
    player.y = 620;
    player.angle = 0;
    player.money = 250;
    missions.state.active = MISSION_LIST[0];
    missions.state.stepIndex = 0;
    // A parked car right ahead, so the "E — steal car" hint shows.
    const carX = 1620;
    const carY = 640;
    const parked = vehicles.spawnCarAt('sedan', carX, carY, 'parked');
    parked.color = '#c0392b';
    // Walk up to the car and stop beside it: the hint is on at capture time.
    const pilot = () => {
      const action = blankPilot();
      const dx = carX - player.x;
      const dy = carY - player.y;
      if (Math.hypot(dx, dy) > 48) {
        action.right = dx > 10;
        action.left = dx < -10;
        action.down = dy > 10;
        action.up = dy < -10;
      }
      action.aimX = carX;
      action.aimY = carY;
      return action;
    };
    return { seconds: 2.2, pilot };
  }

  if (name === 'drive') {
    // Cruising the beachfront promenade in a sedan, palms and sea beside.
    const car = vehicles.spawnCarAt('sedan', 900, BEACH_PROMENADE_Y, 'player');
    car.angle = 0;
    car.speed = 260;
    player.enterCar(car, null);
    player.money = 650;
    missions.state.index = 2; // two missions done; the next marker waits
    const pilot = () => {
      const action = blankPilot();
      action.up = true;
      const steer = roadSteer(car, 'h', BEACH_PROMENADE_Y, 1);
      action.left = steer < -0.15;
      action.right = steer > 0.15;
      action.aimX = car.x + 200;
      action.aimY = car.y;
      return action;
    };
    return { seconds: 3.2, pilot };
  }

  if (name === 'mission') {
    // Mission 4 at the pier: the shootout is on, rivals in sight.
    const pier = LANDMARKS.pier;
    player.x = pier.x - 150;
    player.y = pier.y - 60;
    player.angle = 0;
    player.money = 1250;
    missions.state.active = MISSION_LIST[3];
    missions.state.stepIndex = 1;
    missions.state.remaining = 4;
    enemies.spawnSquad(pier.x, pier.y, 4, 'Harbor Kings');
    // Hold fire until the last half-second: the rivals are still standing
    // and a fresh muzzle flash and tracer are in the frame at capture time.
    const pilot = (t) => {
      const action = blankPilot();
      const target = enemies.list.find((e) => e.alive);
      if (target) {
        action.aimX = target.x;
        action.aimY = target.y;
        action.mouseDown = t > 2.0;
      }
      return action;
    };
    return { seconds: 2.6, pilot };
  }

  // 'chase' (and the default): mission 3's hot delivery, three stars, two
  // cruisers already on the player's tail on a downtown avenue. The chase
  // line is cleared of traffic and pedestrians so the run stays clean, and
  // two oncoming cars in the far lane make the frame feel alive.
  const car = vehicles.spawnCarAt('sports', 1500, 1077, 'player');
  car.angle = 0;
  car.speed = 320;
  car.color = '#e74c3c';
  player.enterCar(car, null);
  player.money = 1050;
  missions.state.active = MISSION_LIST[2];
  missions.state.stepIndex = 2;
  missions.state.timer = 62;
  police.setStars(3);
  // Clear the chase line: every traffic car on the y=1050 avenue, wherever
  // it is, and every traffic car near enough to turn onto it during the
  // scene (500 px either side — a car further off cannot reach the avenue
  // in the time the scene runs). Removed in place so the managers' own
  // arrays stay the ones the game steps.
  for (let i = vehicles.cars.length - 1; i >= 0; i -= 1) {
    const c = vehicles.cars[i];
    if (c.driver !== 'traffic') continue;
    const onAvenue = c.roadAxis === 'h' && c.roadLine === 1050;
    const nearAvenue = c.x > 1200 && c.x < 3400 && c.y > 550 && c.y < 1550;
    if (onAvenue || nearAvenue) vehicles.cars.splice(i, 1);
  }
  for (let i = peds.peds.length - 1; i >= 0; i -= 1) {
    const p = peds.peds[i];
    if (p.x > 1200 && p.x < 3400 && p.y > 900 && p.y < 1200) {
      peds.peds.splice(i, 1);
    }
  }
  // Oncoming traffic in the westbound lane.
  for (const [ox, model] of [[2350, 'sedan'], [2850, 'taxi']]) {
    const oncoming = vehicles.spawnCarAt(model, ox, 1023, 'traffic');
    oncoming.angle = Math.PI;
    oncoming.speed = 190;
    oncoming.roadAxis = 'h';
    oncoming.roadLine = 1050;
    oncoming.roadDir = -1;
    oncoming.laneOffset = -27;
    oncoming.noTurn = true;
  }
  const cruiser1 = vehicles.spawnCruiserNear(1280, 1050);
  cruiser1.x = 1280;
  cruiser1.y = 1077;
  cruiser1.angle = 0;
  cruiser1.speed = 380;
  cruiser1.roadAxis = 'h';
  cruiser1.roadLine = 1050;
  cruiser1.roadDir = 1;
  const cruiser2 = vehicles.spawnCruiserNear(1340, 1050);
  cruiser2.x = 1340;
  cruiser2.y = 1077;
  cruiser2.angle = 0;
  cruiser2.speed = 360;
  cruiser2.roadAxis = 'h';
  cruiser2.roadLine = 1050;
  cruiser2.roadDir = 1;
  const pilot = () => {
    const action = blankPilot();
    action.up = true;
    const steer = roadSteer(car, 'h', 1050, 1);
    action.left = steer < -0.15;
    action.right = steer > 0.15;
    action.aimX = car.x + 200;
    action.aimY = car.y;
    return action;
  };
  return { seconds: 2.6, pilot };
}
