// The camera and every pixel of Solmar Bay: warm ground, marked roads, pastel
// rooftops with long shadows, palms, cars, people and the mission beacon.

import {
  BEACH_Y, HORIZONTAL_ROADS, LANDMARKS, PALETTE, ROAD_WIDTH,
  VERTICAL_ROADS, WATER_Y, WORLD,
} from './config.js';
import { carCircles } from './vehicles.js';
import { createRandom } from './random.js';

/** Round a rectangle path (top-down cars and buildings). */
function roundRectPath(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Create the renderer for a canvas. */
export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  const camera = { x: 0, y: 0, zoom: 1 };
  let viewWidth = 1280;
  let viewHeight = 720;
  let time = 0;
  // Soft darker grass patches, fixed by seed so the ground never flickers.
  const grassPatches = [];
  {
    const rand = createRandom(20261117);
    for (let i = 0; i < 55; i += 1) {
      grassPatches.push({
        x: rand.range(0, WORLD.width),
        y: rand.range(0, BEACH_Y),
        r: rand.range(30, 85),
      });
    }
  }

  function resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    viewWidth = window.innerWidth;
    viewHeight = window.innerHeight;
    canvas.width = Math.floor(viewWidth * dpr);
    canvas.height = Math.floor(viewHeight * dpr);
    canvas.style.width = `${viewWidth}px`;
    canvas.style.height = `${viewHeight}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  resize();
  window.addEventListener('resize', resize);

  /** Follow the player smoothly, looking ahead in the direction of travel. */
  function updateCamera(player, dt, screen) {
    const targetZoom = player && player.inCar ? 0.82 : 1;
    camera.zoom += (targetZoom - camera.zoom) * Math.min(1, dt * 2.5);
    let tx;
    let ty;
    if (screen === 'title') {
      // A slow drift over downtown behind the title screen.
      tx = 1500 + Math.cos(time * 0.07) * 500 - viewWidth / 2 / camera.zoom;
      ty = 800 + Math.sin(time * 0.05) * 300 - viewHeight / 2 / camera.zoom;
    } else if (player) {
      const lookX = player.inCar ? player.car.vx * 0.45 : 0;
      const lookY = player.inCar ? player.car.vy * 0.45 : 0;
      tx = player.x + lookX - viewWidth / 2 / camera.zoom;
      ty = player.y + lookY - viewHeight / 2 / camera.zoom;
    } else {
      return;
    }
    const k = Math.min(1, dt * 4);
    camera.x += (tx - camera.x) * k;
    camera.y += (ty - camera.y) * k;
    const maxX = WORLD.width - viewWidth / camera.zoom;
    const maxY = WORLD.height - viewHeight / camera.zoom;
    camera.x = Math.max(-80, Math.min(maxX + 80, camera.x));
    camera.y = Math.max(-80, Math.min(maxY + 80, camera.y));
  }

  function drawGround(view) {
    // Grass base.
    ctx.fillStyle = PALETTE.grass;
    ctx.fillRect(view.x0, view.y0, view.x1 - view.x0, Math.min(view.y1, BEACH_Y) - view.y0);
    // Soft darker patches.
    ctx.fillStyle = PALETTE.grassDark;
    for (const p of grassPatches) {
      if (p.x + p.r < view.x0 || p.x - p.r > view.x1 || p.y + p.r < view.y0 || p.y - p.r > view.y1) continue;
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, p.r, p.r * 0.7, 0.4, 0, Math.PI * 2);
      ctx.fill();
    }
    // Sand, then the sea.
    if (view.y1 > BEACH_Y) {
      ctx.fillStyle = PALETTE.sand;
      ctx.fillRect(view.x0, BEACH_Y, view.x1 - view.x0, Math.min(view.y1, WATER_Y) - BEACH_Y);
    }
    if (view.y1 > WATER_Y) {
      ctx.fillStyle = PALETTE.water;
      ctx.fillRect(view.x0, WATER_Y, view.x1 - view.x0, view.y1 - WATER_Y);
      // Animated wave lines.
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.lineWidth = 2;
      for (let y = WATER_Y + 18; y < view.y1; y += 34) {
        ctx.beginPath();
        for (let x = view.x0; x < view.x1; x += 46) {
          const wob = Math.sin(x * 0.02 + time * 1.6 + y * 0.05) * 4;
          if (x === view.x0) ctx.moveTo(x, y + wob);
          else ctx.lineTo(x, y + wob);
        }
        ctx.stroke();
      }
    }
  }

  function drawRoads(view) {
    const half = ROAD_WIDTH / 2;
    // Sidewalks: a lighter border under each road.
    ctx.fillStyle = PALETTE.sidewalk;
    for (const rx of VERTICAL_ROADS) {
      if (rx + half + 14 < view.x0 || rx - half - 14 > view.x1) continue;
      ctx.fillRect(rx - half - 14, Math.max(view.y0, 0), ROAD_WIDTH + 28, Math.min(view.y1, BEACH_Y) - Math.max(view.y0, 0));
    }
    for (const ry of HORIZONTAL_ROADS) {
      if (ry + half + 14 < view.y0 || ry - half - 14 > view.y1) continue;
      ctx.fillRect(Math.max(view.x0, 0), ry - half - 14, Math.min(view.x1, WORLD.width) - Math.max(view.x0, 0), ROAD_WIDTH + 28);
    }
    // Asphalt.
    ctx.fillStyle = PALETTE.road;
    for (const rx of VERTICAL_ROADS) {
      if (rx + half < view.x0 || rx - half > view.x1) continue;
      ctx.fillRect(rx - half, Math.max(view.y0, 0), ROAD_WIDTH, Math.min(view.y1, BEACH_Y) - Math.max(view.y0, 0));
    }
    for (const ry of HORIZONTAL_ROADS) {
      if (ry + half < view.y0 || ry - half > view.y1) continue;
      ctx.fillRect(Math.max(view.x0, 0), ry - half, Math.min(view.x1, WORLD.width) - Math.max(view.x0, 0), ROAD_WIDTH);
    }
    // Beachfront promenade.
    if (view.y1 > BEACH_Y && view.y0 < BEACH_Y + 70) {
      ctx.fillStyle = PALETTE.road;
      ctx.fillRect(view.x0, BEACH_Y, view.x1 - view.x0, 70);
      ctx.fillStyle = PALETTE.sidewalk;
      ctx.fillRect(view.x0, BEACH_Y + 70, view.x1 - view.x0, 12);
    }
    // Centre dashes.
    ctx.fillStyle = PALETTE.lane;
    for (const rx of VERTICAL_ROADS) {
      if (rx < view.x0 || rx > view.x1) continue;
      for (let y = Math.max(0, Math.floor(view.y0 / 44) * 44); y < Math.min(view.y1, BEACH_Y); y += 44) {
        ctx.fillRect(rx - 2, y, 4, 22);
      }
    }
    for (const ry of HORIZONTAL_ROADS) {
      if (ry < view.y0 || ry > view.y1) continue;
      for (let x = Math.max(0, Math.floor(view.x0 / 44) * 44); x < Math.min(view.x1, WORLD.width); x += 44) {
        ctx.fillRect(x, ry - 2, 22, 4);
      }
    }
    // Crosswalks at every intersection.
    ctx.fillStyle = PALETTE.crosswalk;
    for (const rx of VERTICAL_ROADS) {
      for (const ry of HORIZONTAL_ROADS) {
        if (rx < view.x0 - 80 || rx > view.x1 + 80 || ry < view.y0 - 80 || ry > view.y1 + 80) continue;
        for (let i = -4; i <= 4; i += 1) {
          ctx.fillRect(rx - half + 8, ry + i * 11 - 3, 14, 6);
          ctx.fillRect(rx + half - 22, ry + i * 11 - 3, 14, 6);
          ctx.fillRect(rx + i * 11 - 3, ry - half + 8, 6, 14);
          ctx.fillRect(rx + i * 11 - 3, ry + half - 22, 6, 14);
        }
      }
    }
  }

  function drawBuildings(city, view) {
    for (const b of city.buildings) {
      if (b.x + b.w < view.x0 || b.x > view.x1 || b.y + b.h < view.y0 || b.y > view.y1) continue;
      // Long sun shadow to the south-east.
      ctx.fillStyle = PALETTE.shadow;
      const sh = 10 + b.height * 3;
      ctx.fillRect(b.x + sh, b.y + sh, b.w, b.h);
      // Walls, then the roof slab.
      ctx.fillStyle = b.wall;
      ctx.fillRect(b.x, b.y, b.w, b.h);
      ctx.fillStyle = b.roof;
      ctx.fillRect(b.x + 4, b.y + 4, b.w - 8, b.h - 8);
      // Rooftop detail: a darker inset, AC boxes and a skylight, placed from
      // the building's own position so they never move between frames.
      ctx.fillStyle = 'rgba(0,0,0,0.12)';
      ctx.fillRect(b.x + 10, b.y + 10, b.w - 20, b.h - 20);
      const hash = (Math.abs(b.x * 13 + b.y * 7) % 100) / 100;
      ctx.fillStyle = 'rgba(255,255,255,0.28)';
      ctx.fillRect(b.x + 14, b.y + 14, 18, 12);
      ctx.fillRect(b.x + b.w - 32, b.y + b.h - 26, 18, 12);
      ctx.fillStyle = 'rgba(90,90,90,0.55)';
      ctx.fillRect(b.x + 16 + hash * 24, b.y + b.h - 30, 16, 12);
      if (hash > 0.45) ctx.fillRect(b.x + b.w - 38, b.y + 16, 14, 14);
      if (hash > 0.6) {
        ctx.fillStyle = 'rgba(170,220,240,0.85)';
        ctx.fillRect(b.x + b.w / 2 - 14, b.y + b.h / 2 - 10, 28, 20);
      }
      // Windows along the south wall.
      ctx.fillStyle = 'rgba(30,60,90,0.85)';
      for (let i = 0; i < b.windows; i += 1) {
        const wx = b.x + 10 + (i * (b.w - 24)) / Math.max(1, b.windows - 1);
        ctx.fillRect(wx, b.y + b.h - 14, 10, 8);
      }
    }
    // Landmark labels.
    ctx.save();
    ctx.font = 'bold 13px "Trebuchet MS", sans-serif';
    ctx.textAlign = 'center';
    for (const key of Object.keys(LANDMARKS)) {
      const lm = LANDMARKS[key];
      if (lm.x < view.x0 - 100 || lm.x > view.x1 + 100 || lm.y < view.y0 - 100 || lm.y > view.y1 + 100) continue;
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      const w = ctx.measureText(lm.name).width + 12;
      roundRectPath(ctx, lm.x - w / 2, lm.y - 58, w, 20, 5);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.fillText(lm.name, lm.x, lm.y - 44);
    }
    ctx.restore();
  }

  function drawTrees(city, view) {
    for (const tree of city.trees) {
      if (tree.x < view.x0 - 40 || tree.x > view.x1 + 40 || tree.y < view.y0 - 40 || tree.y > view.y1 + 40) continue;
      // Shadow, trunk, canopy.
      ctx.fillStyle = PALETTE.shadow;
      ctx.beginPath();
      ctx.ellipse(tree.x + 10, tree.y + 12, 20, 10, 0.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#7a5230';
      ctx.fillRect(tree.x - 2, tree.y - 4, 4, 10);
      ctx.fillStyle = '#2e9e5b';
      for (let i = 0; i < 6; i += 1) {
        const a = (i / 6) * Math.PI * 2 + 0.3;
        ctx.beginPath();
        ctx.ellipse(tree.x + Math.cos(a) * 9, tree.y + Math.sin(a) * 9, 11, 5, a, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = '#37b96a';
      ctx.beginPath();
      ctx.arc(tree.x, tree.y, 7, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawCar(car) {
    const length = car.model === 'van' || car.model === 'pickup' ? 74 : car.model === 'sports' ? 62 : 64;
    const width = car.model === 'van' || car.model === 'pickup' ? 32 : 30;
    ctx.save();
    ctx.translate(car.x, car.y);
    ctx.rotate(car.angle);
    // Shadow.
    ctx.fillStyle = PALETTE.shadow;
    roundRectPath(ctx, -length / 2 + 5, -width / 2 + 7, length, width, 8);
    ctx.fill();
    // Wheels.
    ctx.fillStyle = '#151515';
    const wy = width / 2 - 3;
    ctx.fillRect(-length / 2 + 8, -wy - 3, 14, 6);
    ctx.fillRect(-length / 2 + 8, wy - 3, 14, 6);
    ctx.fillRect(length / 2 - 22, -wy - 3, 14, 6);
    ctx.fillRect(length / 2 - 22, wy - 3, 14, 6);
    // Body.
    ctx.fillStyle = car.color;
    roundRectPath(ctx, -length / 2, -width / 2, length, width, 8);
    ctx.fill();
    // Windshield and rear window.
    ctx.fillStyle = 'rgba(180,230,245,0.9)';
    ctx.fillRect(length / 2 - 26, -width / 2 + 4, 10, width - 8);
    ctx.fillRect(-length / 2 + 12, -width / 2 + 4, 8, width - 8);
    // Roof.
    ctx.fillStyle = car.model === 'cruiser' ? '#e8e8e8' : shade(car.color, -18);
    roundRectPath(ctx, -length / 2 + 22, -width / 2 + 5, length - 50, width - 10, 5);
    ctx.fill();
    // Taxi sign.
    if (car.model === 'taxi') {
      ctx.fillStyle = '#222';
      ctx.fillRect(-6, -5, 12, 10);
      ctx.fillStyle = '#f1c40f';
      ctx.font = 'bold 8px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('TAXI', 0, 3);
    }
    // Police light bar, flashing red and blue.
    if (car.model === 'cruiser') {
      const phase = Math.sin(car.sirenPhase) > 0;
      ctx.fillStyle = phase ? '#ff2d2d' : '#2d5bff';
      ctx.fillRect(-8, -width / 2 + 2, 16, 7);
      ctx.fillStyle = phase ? '#2d5bff' : '#ff2d2d';
      ctx.fillRect(-8, width / 2 - 9, 16, 7);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 9px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('SBPD', 0, 3);
    }
    // Damage: dark scorch marks when battered.
    if (car.health < 55) {
      ctx.fillStyle = 'rgba(20,20,20,0.5)';
      ctx.beginPath();
      ctx.arc(-length / 2 + 14, 0, 9, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  /** Darken a hex colour by `amount`. */
  function shade(hex, amount) {
    const n = parseInt(hex.slice(1), 16);
    const r = Math.max(0, Math.min(255, (n >> 16) + amount));
    const g = Math.max(0, Math.min(255, ((n >> 8) & 0xff) + amount));
    const b = Math.max(0, Math.min(255, (n & 0xff) + amount));
    return `rgb(${r},${g},${b})`;
  }

  function drawPerson(x, y, angle, shirt, skin, walkPhase, down, gun) {
    ctx.save();
    ctx.translate(x, y);
    if (down) {
      ctx.rotate(angle + Math.PI / 2);
      ctx.fillStyle = PALETTE.shadow;
      ctx.beginPath();
      ctx.ellipse(4, 6, 16, 8, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = shirt;
      ctx.beginPath();
      ctx.ellipse(0, 0, 15, 7, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = skin;
      ctx.beginPath();
      ctx.arc(16, 0, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      return;
    }
    const bob = Math.sin(walkPhase) * 1.6;
    ctx.fillStyle = PALETTE.shadow;
    ctx.beginPath();
    ctx.ellipse(3, 5, 11, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    // Legs (two dots stepping).
    ctx.fillStyle = '#2c3e50';
    ctx.beginPath();
    ctx.arc(-Math.cos(angle) * 4 + Math.sin(walkPhase) * 3, -Math.sin(angle) * 4 + bob * 0.4, 3.4, 0, Math.PI * 2);
    ctx.arc(-Math.cos(angle) * 4 - Math.sin(walkPhase) * 3, -Math.sin(angle) * 4 - bob * 0.4, 3.4, 0, Math.PI * 2);
    ctx.fill();
    // Body and head.
    ctx.fillStyle = shirt;
    ctx.beginPath();
    ctx.arc(0, 0, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = skin;
    ctx.beginPath();
    ctx.arc(Math.cos(angle) * 2, Math.sin(angle) * 2, 6, 0, Math.PI * 2);
    ctx.fill();
    // A held gun points where the person aims.
    if (gun) {
      ctx.fillStyle = '#1a1a1a';
      ctx.save();
      ctx.rotate(angle);
      ctx.fillRect(6, -2, 13, 4);
      ctx.restore();
    }
    ctx.restore();
  }

  function drawMissionBeacon(marker) {
    if (!marker) return;
    const pulse = 0.6 + Math.sin(time * 4) * 0.4;
    // A column of light and a pulsing diamond on the ground.
    const grad = ctx.createLinearGradient(0, marker.y - 190, 0, marker.y);
    grad.addColorStop(0, 'rgba(255,210,63,0)');
    grad.addColorStop(1, `rgba(255,210,63,${0.45 * pulse})`);
    ctx.fillStyle = grad;
    ctx.fillRect(marker.x - 14, marker.y - 190, 28, 190);
    ctx.save();
    ctx.translate(marker.x, marker.y);
    ctx.rotate(Math.PI / 4);
    ctx.fillStyle = `rgba(255,210,63,${0.85 * pulse})`;
    ctx.fillRect(-13, -13, 26, 26);
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.strokeRect(-13, -13, 26, 26);
    ctx.restore();
  }

  function drawWaypointArrow(marker) {
    if (!marker) return;
    const sx = (marker.x - camera.x) * camera.zoom;
    const sy = (marker.y - camera.y) * camera.zoom;
    if (sx > -20 && sx < viewWidth + 20 && sy > -20 && sy < viewHeight + 20) return;
    const cx = viewWidth / 2;
    const cy = viewHeight / 2;
    const angle = Math.atan2(sy - cy, sx - cx);
    const ex = cx + Math.cos(angle) * (Math.min(viewWidth, viewHeight) / 2 - 70);
    const ey = cy + Math.sin(angle) * (Math.min(viewWidth, viewHeight) / 2 - 70);
    ctx.save();
    ctx.translate(ex, ey);
    ctx.rotate(angle);
    ctx.fillStyle = '#ffd23f';
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(18, 0);
    ctx.lineTo(-10, -12);
    ctx.lineTo(-4, 0);
    ctx.lineTo(-10, 12);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  return {
    camera,
    resize,
    /** Paint one frame of the game. */
    draw(state, dt) {
      time += dt;
      const { city, player, vehicles, peds, enemies, police, missions, effects } = state;
      updateCamera(player, dt, state.screen);
      const shake = effects.shakeOffset();
      const view = {
        x0: camera.x - shake.x / camera.zoom,
        y0: camera.y - shake.y / camera.zoom,
        x1: camera.x + viewWidth / camera.zoom,
        y1: camera.y + viewHeight / camera.zoom,
      };
      ctx.save();
      ctx.scale(camera.zoom, camera.zoom);
      ctx.translate(-camera.x + shake.x, -camera.y + shake.y);

      drawGround(view);
      drawRoads(view);
      effects.drawSkids(ctx);
      drawBuildings(city, view);
      drawTrees(city, view);

      // Hidden cash stashes glow green.
      for (const stash of city.stashes) {
        if (stash.taken) continue;
        if (stash.x < view.x0 - 30 || stash.x > view.x1 + 30 || stash.y < view.y0 - 30 || stash.y > view.y1 + 30) continue;
        const glow = 0.5 + Math.sin(time * 3 + stash.x) * 0.3;
        ctx.fillStyle = `rgba(124,252,0,${glow})`;
        ctx.beginPath();
        ctx.arc(stash.x, stash.y, 14, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#1e8449';
        ctx.beginPath();
        ctx.arc(stash.x, stash.y, 8, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 11px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('$', stash.x, stash.y + 4);
      }

      drawMissionBeacon(missions.activeMarker());

      // Cars, lowest first so overlaps read naturally.
      const sortedCars = [...vehicles.cars].sort((a, b) => a.y - b.y);
      for (const car of sortedCars) {
        if (car.x < view.x0 - 60 || car.x > view.x1 + 60 || car.y < view.y0 - 60 || car.y > view.y1 + 60) continue;
        drawCar(car);
      }
      for (const ped of peds.peds) {
        if (ped.x < view.x0 - 30 || ped.x > view.x1 + 30 || ped.y < view.y0 - 30 || ped.y > view.y1 + 30) continue;
        drawPerson(ped.x, ped.y, ped.angle, ped.shirt, ped.skin, ped.walkPhase, ped.state === 'down', false);
      }
      for (const enemy of enemies.list) {
        if (!enemy.alive) continue;
        drawPerson(enemy.x, enemy.y, enemy.angle, '#c0392b', '#d9a066', enemy.walkPhase, false, true);
      }
      for (const cop of police.footCops) {
        drawPerson(cop.x, cop.y, cop.angle, '#1f3a5f', '#f2c9a0', cop.walkPhase, false, true);
        // Cap brim.
        ctx.fillStyle = '#12263f';
        ctx.beginPath();
        ctx.arc(cop.x + Math.cos(cop.angle) * 5, cop.y + Math.sin(cop.angle) * 5, 4, 0, Math.PI * 2);
        ctx.fill();
      }
      if (player && player.isAlive() && !player.inCar) {
        drawPerson(player.x, player.y, player.angle, '#00b4a0', '#f2c9a0', player.walkPhase, false, true);
        // Aim line, subtle.
        ctx.strokeStyle = 'rgba(255,255,255,0.35)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(player.x + Math.cos(player.angle) * 20, player.y + Math.sin(player.angle) * 20);
        ctx.lineTo(player.x + Math.cos(player.angle) * 52, player.y + Math.sin(player.angle) * 52);
        ctx.stroke();
      }

      effects.draw(ctx);
      ctx.restore();

      // Screen-space: the waypoint arrow to an off-screen marker.
      drawWaypointArrow(missions.activeMarker());
    },
  };
}
