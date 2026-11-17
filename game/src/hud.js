// The heads-up display: health, cash, wanted stars, the mission objective,
// contextual hints — and the round minimap with its blips.

import {
  BEACH_Y, HORIZONTAL_ROADS, LANDMARKS, ROAD_WIDTH,
  VERTICAL_ROADS, WATER_Y, WORLD,
} from './config.js';
import { districtAt } from './city.js';

/** Create the HUD, bound to the page's HUD elements. */
export function createHud() {
  const root = document.getElementById('hud');
  const healthBar = document.getElementById('health-bar');
  const healthText = document.getElementById('health-text');
  const objectiveTitle = document.getElementById('objective-title');
  const objectiveText = document.getElementById('objective-text');
  const money = document.getElementById('money');
  const stars = document.getElementById('stars');
  const clock = document.getElementById('clock');
  const zoneLabel = document.getElementById('zone-label');
  const speedBox = document.getElementById('speed-box');
  const speed = document.getElementById('speed');
  const hint = document.getElementById('hint');
  const banner = document.getElementById('banner');
  const toast = document.getElementById('toast');
  const vignette = document.getElementById('damage-vignette');
  const minimap = document.getElementById('minimap');
  const mapCtx = minimap.getContext('2d');
  let bannerTimer = null;
  let toastTimer = null;
  let elapsed = 0;

  /** Draw the minimap: roads, sea, and blips for the player and the world. */
  function drawMinimap(state) {
    const { city, player, police, missions, vehicles, enemies } = state;
    const size = minimap.width;
    const scale = size / WORLD.width;
    mapCtx.clearRect(0, 0, size, size);
    // Ground and sea.
    mapCtx.fillStyle = '#2f6b3a';
    mapCtx.fillRect(0, 0, size, size);
    mapCtx.fillStyle = '#d9b96a';
    mapCtx.fillRect(0, BEACH_Y * scale, size, (WATER_Y - BEACH_Y) * scale);
    mapCtx.fillStyle = '#1e87ad';
    mapCtx.fillRect(0, WATER_Y * scale, size, size - WATER_Y * scale);
    // Roads.
    mapCtx.strokeStyle = '#9aa0a8';
    mapCtx.lineWidth = Math.max(2, ROAD_WIDTH * scale);
    for (const rx of VERTICAL_ROADS) {
      mapCtx.beginPath();
      mapCtx.moveTo(rx * scale, 0);
      mapCtx.lineTo(rx * scale, BEACH_Y * scale);
      mapCtx.stroke();
    }
    for (const ry of HORIZONTAL_ROADS) {
      mapCtx.beginPath();
      mapCtx.moveTo(0, ry * scale);
      mapCtx.lineTo(size, ry * scale);
      mapCtx.stroke();
    }
    // Buildings as faint blocks.
    mapCtx.fillStyle = 'rgba(220,220,200,0.5)';
    for (const b of city.buildings) {
      mapCtx.fillRect(b.x * scale, b.y * scale, Math.max(1, b.w * scale), Math.max(1, b.h * scale));
    }
    // Landmark dots.
    mapCtx.fillStyle = '#ffffff';
    for (const key of Object.keys(LANDMARKS)) {
      const lm = LANDMARKS[key];
      mapCtx.fillRect(lm.x * scale - 1, lm.y * scale - 1, 2, 2);
    }
    // Stashes.
    mapCtx.fillStyle = '#7CFC00';
    for (const stash of city.stashes) {
      if (stash.taken) continue;
      mapCtx.beginPath();
      mapCtx.arc(stash.x * scale, stash.y * scale, 3, 0, Math.PI * 2);
      mapCtx.fill();
    }
    // Enemies.
    mapCtx.fillStyle = '#ff5252';
    for (const enemy of enemies.list) {
      if (!enemy.alive) continue;
      mapCtx.beginPath();
      mapCtx.arc(enemy.x * scale, enemy.y * scale, 3, 0, Math.PI * 2);
      mapCtx.fill();
    }
    // Police cruisers, flashing.
    const flash = Math.floor(elapsed * 3) % 2 === 0;
    mapCtx.fillStyle = flash ? '#2d5bff' : '#ff2d2d';
    for (const car of vehicles.cars) {
      if (car.driver !== 'police') continue;
      mapCtx.beginPath();
      mapCtx.arc(car.x * scale, car.y * scale, 3.5, 0, Math.PI * 2);
      mapCtx.fill();
    }
    // Mission marker, pulsing yellow.
    const marker = missions.activeMarker();
    if (marker) {
      const pulse = 4 + Math.sin(elapsed * 5) * 1.5;
      mapCtx.fillStyle = '#ffd23f';
      mapCtx.strokeStyle = '#fff';
      mapCtx.lineWidth = 1.5;
      mapCtx.beginPath();
      mapCtx.arc(marker.x * scale, marker.y * scale, pulse, 0, Math.PI * 2);
      mapCtx.fill();
      mapCtx.stroke();
    }
    // The player: a white arrow pointing where they face.
    mapCtx.save();
    mapCtx.translate(player.x * scale, player.y * scale);
    mapCtx.rotate(player.angle);
    mapCtx.fillStyle = '#ffffff';
    mapCtx.strokeStyle = '#000';
    mapCtx.lineWidth = 1;
    mapCtx.beginPath();
    mapCtx.moveTo(7, 0);
    mapCtx.lineTo(-5, -5);
    mapCtx.lineTo(-2, 0);
    mapCtx.lineTo(-5, 5);
    mapCtx.closePath();
    mapCtx.fill();
    mapCtx.stroke();
    mapCtx.restore();
  }

  return {
    show() {
      root.classList.remove('hidden');
    },
    hide() {
      root.classList.add('hidden');
    },
    /** A big centre-screen banner with a subtitle, shown for a few seconds. */
    showBanner(title, subtitle) {
      banner.innerHTML = `${title}${subtitle ? `<small>${subtitle}</small>` : ''}`;
      banner.classList.remove('hidden');
      const status = document.getElementById('status');
      if (status) status.textContent = subtitle ? `${title}. ${subtitle}` : title;
      if (bannerTimer) window.clearTimeout(bannerTimer);
      bannerTimer = window.setTimeout(() => banner.classList.add('hidden'), 3600);
    },
    /** A small toast near the bottom centre. */
    showToast(text) {
      toast.textContent = text;
      toast.classList.add('show');
      if (toastTimer) window.clearTimeout(toastTimer);
      toastTimer = window.setTimeout(() => toast.classList.remove('show'), 2600);
    },
    update(dt, state) {
      elapsed += dt;
      const { player, police, missions } = state;
      healthBar.style.width = `${Math.max(0, player.health)}%`;
      healthBar.style.background = player.health > 50
        ? 'linear-gradient(90deg, #37d67a, #a4e86a)'
        : player.health > 25
          ? 'linear-gradient(90deg, #f39c12, #f7dc6f)'
          : 'linear-gradient(90deg, #e74c3c, #ff7675)';
      healthText.textContent = Math.ceil(player.health);
      objectiveTitle.textContent = missions.objectiveTitle();
      objectiveText.textContent = missions.objectiveText();
      money.textContent = `$${player.money.toLocaleString('en-US')}`;
      const filled = '\u2605'.repeat(police.stars);
      const empty = '\u2606'.repeat(5 - police.stars);
      stars.textContent = filled + empty;
      stars.classList.toggle('hot', police.stars >= 3);
      const minutes = Math.floor(elapsed / 60);
      const hours = 9 + Math.floor(minutes / 60);
      clock.textContent = `DAY 1 — ${String(hours).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
      zoneLabel.textContent = districtAt(player.x, player.y);
      if (player.inCar) {
        speedBox.classList.remove('hidden');
        speed.textContent = Math.round(Math.hypot(player.car.vx, player.car.vy) * 0.36);
      } else {
        speedBox.classList.add('hidden');
      }
      vignette.style.opacity = player.damageFlash > 0 ? 0.85 : 0;
      drawMinimap(state);
    },
    /** The contextual hint line ("E — steal car", ...). */
    setHint(text) {
      hint.textContent = text || '';
    },
  };
}
