// The story of Danny "Dice" Marlow: five missions for fixer Vera Santos, each
// a chain of steps — steal, drive, pick up, deliver, fight, escape — with a
// cash reward and an autosave at the end of each one.

import { LANDMARKS } from './config.js';

/** The mission chain, in order. Steps run in sequence; each names its goal. */
export const MISSION_LIST = [
  {
    id: 'first-wheels',
    title: 'FIRST WHEELS',
    intro: 'Vera: "Dice, I need wheels. Steal any car and bring it to your hideout."',
    reward: 250,
    startAt: 'hideout',
    steps: [
      { type: 'steal_car', text: 'Steal a car — walk up to one and press E.' },
      { type: 'goto', at: 'hideout', radius: 90, text: 'Drive the car to your hideout.' },
    ],
  },
  {
    id: 'the-pickup',
    title: 'THE PICKUP',
    intro: 'Vera: "A package is waiting at Sunset Docks. Get it to Tiny — no questions."',
    reward: 400,
    startAt: 'diner',
    steps: [
      { type: 'goto', at: 'docks', radius: 80, text: 'Drive to Sunset Docks.' },
      { type: 'pickup', at: 'docks', radius: 70, text: 'Grab the package — press E.' },
      { type: 'goto', at: 'garage', radius: 90, text: 'Deliver the package to Tiny\u2019s Garage.' },
    ],
  },
  {
    id: 'hot-delivery',
    title: 'HOT DELIVERY',
    intro: 'Vera: "Rosa\u2019s holding a hot parcel. Grab it fast — the cops are already circling."',
    reward: 600,
    startAt: 'diner',
    steps: [
      { type: 'goto', at: 'diner', radius: 80, text: 'Drive to Mama Rosa\u2019s Diner.' },
      { type: 'pickup', at: 'diner', radius: 70, text: 'Grab the parcel — press E. The heat is coming.', heat: 2 },
      { type: 'goto', at: 'pier', radius: 90, seconds: 100, text: 'Deliver to Solmar Pier — 100 seconds, cops on your tail!' },
    ],
  },
  {
    id: 'payback',
    title: 'PAYBACK AT THE PIER',
    intro: 'Vera: "The Harbor Kings robbed one of mine. Go to the pier and settle it."',
    reward: 800,
    startAt: 'diner',
    steps: [
      { type: 'goto', at: 'pier', radius: 130, text: 'Drive to Solmar Pier.', spawnSquad: 4 },
      { type: 'eliminate', count: 4, text: 'Take out the Harbor Kings at the pier.' },
      { type: 'goto', at: 'diner', radius: 90, text: 'Report back to Vera at the diner.' },
    ],
  },
  {
    id: 'the-score',
    title: 'THE SOLMAR SCORE',
    intro: 'Vera: "The big one, Dice. Solmar National Bank. In, out, and gone."',
    reward: 1500,
    startAt: 'diner',
    steps: [
      { type: 'goto', at: 'bank', radius: 100, text: 'Drive to Solmar National Bank.' },
      { type: 'channel', at: 'bank', radius: 80, seconds: 4, text: 'Grab the cash — hold E at the vault door.', heat: 3 },
      { type: 'goto', at: 'hideout', radius: 90, text: 'Escape to your hideout with the cash!' },
    ],
  },
];

/** Create the mission manager. */
export function createMissions() {
  const state = {
    index: 0, // next mission to offer
    active: null, // the mission currently running
    stepIndex: 0,
    timer: 0,
    channel: 0,
    carrying: false,
    failedFlash: 0,
  };

  function currentStep() {
    if (!state.active) return null;
    return state.active.steps[state.stepIndex] || null;
  }

  function stepTarget(step) {
    if (!step || !step.at) return null;
    return LANDMARKS[step.at];
  }

  return {
    state,
    /** The mission currently offered (not yet started). */
    offered() {
      return MISSION_LIST[state.index] || null;
    },
    /** Where the player goes to start the offered mission. */
    offerMarker() {
      const mission = this.offered();
      if (!mission) return null;
      return LANDMARKS[mission.startAt];
    },
    isStoryComplete() {
      return state.index >= MISSION_LIST.length && !state.active;
    },
    currentStep,
    /** The marker the HUD and minimap should point at right now. */
    activeMarker() {
      if (state.active) {
        const step = currentStep();
        if (step && step.type === 'eliminate') return LANDMARKS.pier;
        return stepTarget(step);
      }
      return this.offerMarker();
    },
    objectiveTitle() {
      if (state.active) return state.active.title;
      if (this.isStoryComplete()) return 'STORY COMPLETE';
      return 'FREE ROAM';
    },
    objectiveText() {
      if (state.active) {
        const step = currentStep();
        if (!step) return '';
        let text = step.text;
        if (step.type === 'eliminate') {
          text += ` (${state.remaining} left)`;
        }
        if (step.seconds && state.timer > 0) {
          text += ` — ${Math.ceil(state.timer)}s left`;
        }
        if (step.type === 'channel' && state.channel > 0) {
          text += ` — ${Math.round((state.channel / step.seconds) * 100)}%`;
        }
        return text;
      }
      if (this.isStoryComplete()) {
        return 'You beat the story! Free roam Solmar Bay — find the hidden cash stashes.';
      }
      const mission = this.offered();
      return `Go to the yellow marker to start "${mission.title}".`;
    },
    /** Begin the offered mission. */
    startMission(hud, audio) {
      const mission = this.offered();
      if (!mission) return;
      state.active = mission;
      state.stepIndex = 0;
      state.timer = 0;
      state.channel = 0;
      state.carrying = false;
      state.remaining = 0;
      hud.showBanner(mission.title, mission.intro);
      audio.missionStart();
    },
    /** The player stole a car — advance any steal_car step. */
    onCarStolen() {
      const step = currentStep();
      if (state.active && step && step.type === 'steal_car') {
        this.advanceStep();
      }
    },
    advanceStep() {
      state.stepIndex += 1;
      state.timer = 0;
      state.channel = 0;
    },
    /** Finish the mission: pay out, autosave, offer the next one. */
    completeMission(context) {
      const { player, hud, audio, effects, onAutosave } = context;
      const mission = state.active;
      // Clear the mission state FIRST: if any effect below ever throws, the
      // mission is already done and the reward can never pay out twice.
      state.index += 1;
      state.active = null;
      state.stepIndex = 0;
      state.carrying = false;
      player.earn(mission.reward);
      effects.floater(player.x, player.y - 30, `+$${mission.reward}`, '#7CFC00');
      hud.showBanner('MISSION COMPLETE', `${mission.title} — you earned $${mission.reward}.`);
      audio.missionComplete();
      audio.cash();
      if (onAutosave) onAutosave();
      if (state.index >= MISSION_LIST.length) {
        window.setTimeout(() => {
          hud.showBanner('STORY COMPLETE', 'Danny "Dice" Marlow owns Solmar Bay now.');
        }, 3600);
      }
    },
    /** Fail the mission (timer ran out, or the player was wasted/busted). */
    failMission(hud, reason) {
      if (!state.active) return;
      hud.showBanner('MISSION FAILED', reason || 'Try again — the marker is still there.');
      state.active = null;
      state.stepIndex = 0;
      state.timer = 0;
      state.channel = 0;
      state.carrying = false;
      state.failedFlash = 2;
    },
    update(dt, context) {
      const { player, enemies, police, input, hud } = context;
      if (state.failedFlash > 0) state.failedFlash -= dt;
      // No mission running: reaching the offer marker starts it.
      if (!state.active) {
        const marker = this.offerMarker();
        if (marker && Math.hypot(player.x - marker.x, player.y - marker.y) < 90) {
          this.startMission(hud, context.audio);
        }
        return;
      }
      const step = currentStep();
      if (!step) {
        this.completeMission(context);
        return;
      }
      const target = stepTarget(step);
      const dist = target ? Math.hypot(player.x - target.x, player.y - target.y) : Infinity;

      if (step.type === 'goto') {
        if (step.seconds && state.timer === 0) state.timer = step.seconds;
        if (step.seconds) {
          state.timer -= dt;
          if (state.timer <= 0) {
            this.failMission(hud, 'Out of time — the delivery window closed.');
            return;
          }
        }
        if (dist < step.radius) {
          if (step.spawnSquad) {
            enemies.spawnSquad(target.x, target.y, step.spawnSquad, 'Harbor Kings');
            state.remaining = step.spawnSquad;
          }
          this.advanceStep();
        }
        return;
      }
      if (step.type === 'pickup') {
        if (dist < step.radius && input.wasPressed('interact')) {
          state.carrying = true;
          context.audio.pickup();
          if (step.heat) police.setStars(step.heat);
          hud.showToast('Package secured.');
          this.advanceStep();
        }
        return;
      }
      if (step.type === 'channel') {
        if (dist < step.radius && input.isDown('interact')) {
          state.channel += dt;
          if (state.channel >= step.seconds) {
            state.carrying = true;
            context.audio.cash();
            if (step.heat) police.setStars(step.heat);
            hud.showToast('The cash is yours — run!');
            this.advanceStep();
          }
        } else {
          state.channel = Math.max(0, state.channel - dt * 2);
        }
        return;
      }
      if (step.type === 'eliminate') {
        state.remaining = enemies.aliveCount();
        if (state.remaining === 0) this.advanceStep();
      }
      // steal_car steps advance from onCarStolen.
    },
  };
}
