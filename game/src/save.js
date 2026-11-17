// Saving to localStorage: cash, mission progress, the player's place in the
// city, hidden stashes and the unlocked sports car. Nothing leaves the browser.

import { SAVE_KEY } from './config.js';

/** Write the game's progress. Returns true when it stuck. */
export function saveGame(state) {
  try {
    const data = {
      version: 1,
      seed: state.seed,
      money: state.player.money,
      missionIndex: state.missions.state.index,
      x: Math.round(state.player.x),
      y: Math.round(state.player.y),
      health: Math.ceil(state.player.health),
      stashes: state.city.stashes.map((s) => s.taken),
      sportsUnlocked: state.sportsUnlocked,
      savedAt: Date.now(),
    };
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

/** Read the saved progress, or null when there is none. */
export function loadGame() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || data.version !== 1) return null;
    return data;
  } catch {
    return null;
  }
}

/** True when a save exists (the title screen shows CONTINUE then). */
export function hasSave() {
  return loadGame() !== null;
}

/** Apply a loaded save to a freshly built game. */
export function applySave(state, save) {
  state.player.money = save.money || 0;
  state.player.health = save.health > 0 ? save.health : 100;
  state.player.x = save.x;
  state.player.y = save.y;
  state.missions.state.index = save.missionIndex || 0;
  state.city.stashes.forEach((stash, i) => {
    stash.taken = !!(save.stashes && save.stashes[i]);
  });
  state.sportsUnlocked = !!save.sportsUnlocked;
  if (state.sportsUnlocked) {
    state.vehicles.spawnCarAt('sports', state.city.landmarks.hideout.x + 60, state.city.landmarks.hideout.y + 40, 'parked');
  }
}
