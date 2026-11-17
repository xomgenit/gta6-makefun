// SOLMAR — boot and the one loop. The world advances in fixed 1/60 s steps,
// the renderer paints what is there, and the screens (title, play, paused,
// wasted, busted) decide what updates. ?shot=chase|foot|drive|mission stages
// a screenshot scene instead of running the loop, paints it twice and sets
// window.__shotReady for the screenshot tool.

import { LANDMARKS, PLAYER, POLICE, STASH_REWARD, STEP } from './config.js';
import { createRandom } from './random.js';
import { createCity } from './city.js';
import { createInput } from './input.js';
import { createAudio } from './audio.js';
import { createEffects } from './effects.js';
import { createVehicles } from './vehicles.js';
import { createPedestrians } from './pedestrians.js';
import { createEnemies } from './enemies.js';
import { createPolice } from './police.js';
import { createPlayer } from './player.js';
import { createMissions } from './missions.js';
import { createRenderer } from './render.js';
import { createHud } from './hud.js';
import { applySave, hasSave, loadGame, saveGame } from './save.js';
import { stageShot } from './shots.js';

/** The longest frame the loop catches up on; a longer stall is dropped. */
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const titleScreen = document.getElementById('title-screen');
const pauseScreen = document.getElementById('pause-screen');
const endScreen = document.getElementById('end-screen');

/** Build a fresh game world from a seed. */
function buildGame(gameSeed) {
  const random = createRandom(gameSeed);
  const city = createCity(random);
  const effects = createEffects();
  const audio = createAudio();
  const vehicles = createVehicles(city, random);
  const peds = createPedestrians(city, random);
  const enemies = createEnemies(city);
  const police = createPolice(city, random);
  const player = createPlayer(city, city.landmarks.hideout);
  const missions = createMissions();
  const renderer = createRenderer(canvas);
  const hud = createHud();
  const input = createInput(canvas);
  return {
    random, city, effects, audio, vehicles, peds, enemies, police,
    player, missions, renderer, hud, input,
    screen: 'title',
    time: 0,
    sportsUnlocked: false,
    lastShotHeat: -10,
    // The city's seed travels with the save, so CONTINUE rebuilds the same
    // city the player saved in — not a fresh random one.
    seed: gameSeed,
  };
}

let game = buildGame(seed);

/** A debug handle for play-testing from the console (read-only use). */
window.__solmar = game;

/** Steal the car the player is standing by. */
function stealCar(car) {
  const { player, peds, police, missions, hud, audio } = game;
  if (car.driver === 'traffic') {
    peds.addFleeingDriver(car.x, car.y);
  }
  player.enterCar(car, audio);
  missions.onCarStolen();
  if (police.playerSeen(player, game.vehicles)) {
    police.addWanted(1);
    hud.showToast('The cops saw you steal that car!');
  }
}

/** Take a hidden cash stash. */
function collectStash(stash) {
  const { player, effects, audio, hud } = game;
  stash.taken = true;
  player.earn(STASH_REWARD);
  effects.floater(player.x, player.y - 30, `+$${STASH_REWARD}`, '#7CFC00');
  effects.burst(stash.x, stash.y, '#7CFC00', 12);
  audio.cash();
  hud.showToast(`Hidden stash found: $${STASH_REWARD}!`);
}

/** End the run: wasted (health gone) or busted (caught by the cops). */
function endRun(kind) {
  const { player, police, missions, enemies, audio, hud } = game;
  if (game.screen !== 'play') return;
  game.screen = kind;
  const fine = kind === 'wasted' ? POLICE.wastedFine : POLICE.bustedFine;
  if (player.inCar) {
    player.car.driver = 'parked';
    player.car = null;
  }
  player.money = Math.max(0, player.money - fine);
  police.clearWanted();
  enemies.clear();
  missions.failMission(hud, kind === 'wasted' ? 'You were wasted.' : 'You were busted.');
  audio.stopEngine();
  audio.stopSiren();
  if (kind === 'wasted') audio.wasted();
  else audio.busted();
  document.getElementById('end-title').textContent = kind === 'wasted' ? 'WASTED' : 'BUSTED';
  document.getElementById('end-text').textContent = kind === 'wasted'
    ? `The SBPD scraped you off the street. Hospital bill: $${fine}.`
    : `The SBPD caught you. Bail and fines: $${fine}.`;
  endScreen.classList.remove('hidden');
}

/** Back on the street after wasted/busted: hospital or police HQ. */
function respawn() {
  const { player } = game;
  const spot = game.screen === 'wasted' ? LANDMARKS.hospital : LANDMARKS.policeHq;
  player.x = spot.x;
  player.y = spot.y;
  player.health = PLAYER.health;
  game.screen = 'play';
  endScreen.classList.add('hidden');
}

/** One fixed step of the live game. */
function stepGame(dt, input) {
  const { city, effects, audio, vehicles, peds, enemies, police, player, missions, hud } = game;
  game.time += dt;
  input.updateMouseWorld(game.renderer.camera);

  if (player.isAlive()) {
    if (player.inCar) {
      player.updateInCar(dt, input, vehicles, effects);
      // Running a pedestrian over is a crime when the cops see it.
      if (Math.hypot(player.car.vx, player.car.vy) > 160) {
        const frontX = player.car.x + Math.cos(player.car.angle) * 34;
        const frontY = player.car.y + Math.sin(player.car.angle) * 34;
        if (peds.knockDownAt(frontX, frontY, 30)) {
          effects.burst(frontX, frontY, '#ff5252', 8);
          audio.crash(0.4);
          if (police.playerSeen(player, vehicles)) {
            police.addWanted(1);
            hud.showToast('You ran someone over — the cops saw it!');
          }
        }
      }
    } else {
      player.updateOnFoot(dt, input, {
        effects, audio, enemies, police, peds,
        onShoot: () => {
          if (police.playerSeen(player, vehicles) && game.time - game.lastShotHeat > 5) {
            game.lastShotHeat = game.time;
            police.addWanted(1);
          }
        },
        onKillCop: () => {
          police.addWanted(2);
          hud.showToast('You took down a cop — the heat is on!');
        },
      });
    }
  }

  vehicles.update(dt, {
    effects, audio, player,
    onTrafficDriverFlees: (car) => {
      car.driver = 'parked';
      peds.addFleeingDriver(car.x, car.y);
    },
  });
  peds.update(dt, player.inCar ? player.car : null);
  enemies.update(dt, player, effects, audio, null);
  police.update(dt, {
    player, vehicles, effects, audio,
    onBusted: () => endRun('busted'),
  });
  missions.update(dt, {
    player, enemies, police, input, hud, audio, effects,
    onAutosave: () => {
      saveGame(game);
      // The sports car unlock: after the hot delivery, Vera leaves one at the hideout.
      if (missions.state.index === 3 && !game.sportsUnlocked) {
        game.sportsUnlocked = true;
        vehicles.spawnCarAt('sports', LANDMARKS.hideout.x + 60, LANDMARKS.hideout.y + 40, 'parked');
        hud.showToast('Vera left a sports car at your hideout!');
      }
    },
  });
  effects.update(dt);

  // Interactions on E: respray, get out, steal, stash.
  if (input.wasPressed('interact')) {
    if (player.inCar) {
      const spa = LANDMARKS.autoSpa;
      const nearSpa = Math.hypot(player.x - spa.x, player.y - spa.y) < 130;
      if (nearSpa && police.stars > 0) {
        if (player.spend(POLICE.resprayCost)) {
          police.clearWanted();
          player.car.health = 100;
          audio.cash();
          hud.showToast('Respray done — the heat is off, and the car is fixed.');
        } else {
          hud.showToast(`Respray costs $${POLICE.resprayCost} — you are short.`);
        }
      } else {
        player.exitCar(city, audio);
      }
    } else {
      const step = missions.currentStep();
      const missionPickup = missions.state.active && step && (step.type === 'pickup' || step.type === 'channel');
      const car = vehicles.nearestStealable(player.x, player.y, PLAYER.enterCarRange);
      const stash = city.stashes.find((s) => !s.taken && Math.hypot(player.x - s.x, player.y - s.y) < 44);
      if (!missionPickup && car) {
        stealCar(car);
      } else if (!missionPickup && stash) {
        collectStash(stash);
      }
    }
  }

  // The contextual hint line.
  if (player.inCar) {
    const spa = LANDMARKS.autoSpa;
    if (police.stars > 0 && Math.hypot(player.x - spa.x, player.y - spa.y) < 130) {
      hud.setHint(`E — Respray ($${POLICE.resprayCost}): clear your wanted level`);
    } else {
      hud.setHint('E — Get out of the car · Space — Handbrake');
    }
  } else {
    const step = missions.currentStep();
    const car = vehicles.nearestStealable(player.x, player.y, PLAYER.enterCarRange);
    const stash = city.stashes.find((s) => !s.taken && Math.hypot(player.x - s.x, player.y - s.y) < 44);
    if (missions.state.active && step && (step.type === 'pickup' || step.type === 'channel')) {
      const target = LANDMARKS[step.at];
      if (target && Math.hypot(player.x - target.x, player.y - target.y) < step.radius) {
        hud.setHint(step.type === 'pickup' ? 'E — Pick it up' : 'Hold E — Grab the cash');
      } else {
        hud.setHint('WASD move · Shift sprint · Mouse aim · Click shoot');
      }
    } else if (car) {
      hud.setHint('E — Steal car');
    } else if (stash) {
      hud.setHint(`E — Take the hidden stash ($${STASH_REWARD})`);
    } else {
      hud.setHint('WASD move · Shift sprint · Mouse aim · Click shoot');
    }
  }

  // Engine and siren follow the action.
  if (player.inCar && player.car) {
    audio.startEngine();
    audio.setEngineSpeed(Math.min(1, Math.hypot(player.car.vx, player.car.vy) / 600));
  } else {
    audio.stopEngine();
  }
  if (police.stars > 0) audio.startSiren();
  else audio.stopSiren();

  hud.update(dt, game);

  if (!player.isAlive() && game.screen === 'play') endRun('wasted');
}

/** The title screen's living backdrop: traffic and pedestrians only. */
function titleStep(dt) {
  const { vehicles, peds, effects, audio, player } = game;
  vehicles.update(dt, { effects, audio, player, onTrafficDriverFlees: null });
  peds.update(dt, null);
  effects.update(dt);
}

/** Show the title screen over the drifting city. */
function showTitle() {
  game.screen = 'title';
  game.hud.hide();
  titleScreen.classList.remove('hidden');
  pauseScreen.classList.add('hidden');
  endScreen.classList.add('hidden');
  document.getElementById('btn-continue').classList.toggle('hidden', !hasSave());
}

/** Start playing: hide the menus, show the HUD, unlock the sound. */
function startPlaying() {
  game.screen = 'play';
  // The debug handle must follow the reassigned game (NEW GAME / CONTINUE
  // both build a fresh world before calling this).
  window.__solmar = game;
  titleScreen.classList.add('hidden');
  pauseScreen.classList.add('hidden');
  endScreen.classList.add('hidden');
  game.hud.show();
  game.audio.unlock();
}

/** Pause and resume. */
function togglePause() {
  if (game.screen === 'play') {
    game.screen = 'paused';
    const { player, missions } = game;
    document.getElementById('pause-stats').innerHTML =
      `Cash: $${player.money.toLocaleString('en-US')}<br>` +
      `Missions complete: ${missions.state.index} / 5<br>` +
      `Wanted level: ${game.police.stars} star${game.police.stars === 1 ? '' : 's'}<br>` +
      `Health: ${Math.ceil(player.health)}`;
    document.getElementById('save-note').textContent = '';
    pauseScreen.classList.remove('hidden');
  } else if (game.screen === 'paused') {
    game.screen = 'play';
    pauseScreen.classList.add('hidden');
  }
}

/** Wire the menu buttons. */
function wireMenus() {
  document.getElementById('btn-new').addEventListener('click', () => {
    game = buildGame(Math.floor(Math.random() * 4294967296));
    startPlaying();
    game.hud.showToast('Welcome to Solmar Bay, Dice. The yellow marker is your first job.');
  });
  document.getElementById('btn-continue').addEventListener('click', () => {
    const save = loadGame();
    // Rebuild the saved city from its own seed; fall back to this page's
    // seed for old saves that predate the seed field.
    game = buildGame(save && Number.isInteger(save.seed) ? save.seed : seed);
    if (save) applySave(game, save);
    startPlaying();
    game.hud.showToast('Welcome back, Dice.');
  });
  document.getElementById('btn-how').addEventListener('click', () => {
    document.getElementById('how-to').classList.toggle('hidden');
  });
  document.getElementById('btn-resume').addEventListener('click', togglePause);
  document.getElementById('btn-save').addEventListener('click', () => {
    const ok = saveGame(game);
    document.getElementById('save-note').textContent = ok ? 'Game saved.' : 'Save failed — storage is unavailable.';
  });
  document.getElementById('btn-restart').addEventListener('click', () => {
    const { player, police, enemies, missions } = game;
    if (player.inCar) {
      player.car.driver = 'parked';
      player.car = null;
    }
    missions.failMission(game.hud, 'Mission restarted.');
    enemies.clear();
    police.clearWanted();
    player.health = PLAYER.health;
    const marker = missions.offerMarker() || LANDMARKS.hideout;
    player.x = marker.x;
    player.y = marker.y;
    game.screen = 'play';
    pauseScreen.classList.add('hidden');
  });
  document.getElementById('btn-quit').addEventListener('click', showTitle);
  document.getElementById('btn-respawn').addEventListener('click', respawn);
  // Mute is global, even on the title screen.
  window.addEventListener('keydown', (event) => {
    if (event.code === 'KeyM' && !event.repeat) {
      const muted = game.audio.toggleMute();
      if (game.screen === 'play') game.hud.showToast(muted ? 'Sound muted.' : 'Sound on.');
    }
  });
}

/** The live loop: fixed steps, then one paint. */
function runLoop() {
  let last = performance.now();
  let accumulator = 0;
  function frame(now) {
    requestAnimationFrame(frame);
    let dt = (now - last) / 1000;
    last = now;
    if (dt > MAX_FRAME) dt = MAX_FRAME;
    const input = game.input;
    if (input.wasPressed('pause')) togglePause();
    if (game.screen === 'play') {
      accumulator += dt;
      while (accumulator >= STEP) {
        stepGame(STEP, input);
        accumulator -= STEP;
      }
    } else if (game.screen === 'title') {
      accumulator += dt;
      while (accumulator >= STEP) {
        titleStep(STEP);
        accumulator -= STEP;
      }
    }
    game.renderer.draw(game, dt);
    input.endFrame();
  }
  requestAnimationFrame(frame);
}

/** A scripted stand-in for the real input, driven by a shot's autopilot. */
function createScriptedInput() {
  const held = new Set();
  const pressed = new Set();
  const mouse = { x: 0, y: 0, down: false, clicked: false, worldX: 0, worldY: 0 };
  const CODE = {
    up: 'KeyW', down: 'KeyS', left: 'KeyA', right: 'KeyD',
    sprint: 'ShiftLeft', handbrake: 'Space', interact: 'KeyE',
  };
  const ACTIONS = {
    up: ['KeyW'], down: ['KeyS'], left: ['KeyA'], right: ['KeyD'],
    sprint: ['ShiftLeft'], handbrake: ['Space'], interact: ['KeyE'],
  };
  return {
    mouse,
    applyAction(action) {
      held.clear();
      for (const key of Object.keys(CODE)) {
        if (action[key]) held.add(CODE[key]);
      }
      if (action.interact) pressed.add('KeyE');
      mouse.down = !!action.mouseDown;
      mouse.worldX = action.aimX || 0;
      mouse.worldY = action.aimY || 0;
    },
    isDown(actionName) {
      return ACTIONS[actionName].some((code) => held.has(code));
    },
    wasPressed(actionName) {
      const hit = ACTIONS[actionName].some((code) => pressed.has(code));
      if (hit) {
        for (const code of ACTIONS[actionName]) pressed.delete(code);
      }
      return hit;
    },
    moveVector() {
      let x = 0;
      let y = 0;
      if (this.isDown('left')) x -= 1;
      if (this.isDown('right')) x += 1;
      if (this.isDown('up')) y -= 1;
      if (this.isDown('down')) y += 1;
      if (x !== 0 && y !== 0) {
        x *= Math.SQRT1_2;
        y *= Math.SQRT1_2;
      }
      return { x, y };
    },
    updateMouseWorld() {
      // The pilot sets world coordinates directly.
    },
    endFrame() {
      pressed.clear();
      mouse.clicked = false;
    },
  };
}

/** Stage one screenshot scene, play it forward, paint it, signal readiness. */
function runShot(name) {
  game.screen = 'play';
  titleScreen.classList.add('hidden');
  game.hud.show();
  const scene = stageShot(name, game);
  const scripted = createScriptedInput();
  const steps = Math.floor(scene.seconds / STEP);
  // ?damageLog=1 records the player car's health through the scene, for tuning.
  const trace = params.get('damageLog') === '1' ? [] : null;
  if (trace) {
    window.__healthTrace = trace;
    window.__stagingCars = game.vehicles.cars.map((c) => (
      `${c.driver}:${c.model}@(${Math.round(c.x)},${Math.round(c.y)}) ${c.roadAxis}${c.roadLine} d${c.roadDir}`
    ));
  }
  let t = 0;
  for (let i = 0; i < steps; i += 1) {
    scripted.applyAction(scene.pilot(t, game));
    stepGame(STEP, scripted);
    // Paint every step, as the live loop does: the camera eases onto the
    // player during staging instead of jumping at the end.
    game.renderer.draw(game, STEP);
    if (trace && i % 10 === 0) {
      const nearby = game.vehicles.cars
        .filter((c) => c !== game.player.car && Math.hypot(c.x - game.player.x, c.y - game.player.y) < 220)
        .map((c) => `${c.driver}:${c.model}@(${Math.round(c.x)},${Math.round(c.y)}) hp${Math.round(c.health)}`);
      trace.push({
        t: +t.toFixed(2),
        health: game.player.car ? Math.round(game.player.car.health) : 0,
        x: Math.round(game.player.x),
        y: Math.round(game.player.y),
        stars: game.police.stars,
        nearby,
      });
    }
    scripted.endFrame();
    t += STEP;
  }
  let painted = 0;
  function paint() {
    game.renderer.draw(game, 0.016);
    game.hud.update(0.016, game);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

wireMenus();
if (shot) {
  runShot(shot);
} else {
  showTitle();
  runLoop();
}
