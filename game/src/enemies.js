// Hostile crews: rival gang members and the guards of a score. They hold a
// spot, shoot at the player when close, and fall after a few hits.

import { ENEMY } from './config.js';

/** Create the enemy manager. */
export function createEnemies(city) {
  const list = [];

  return {
    list,
    /** Spawn a squad of hostiles around a point; they guard that ground. */
    spawnSquad(x, y, count, label) {
      for (let i = 0; i < count; i += 1) {
        const angle = (i / count) * Math.PI * 2;
        const ex = x + Math.cos(angle) * (60 + i * 22);
        const ey = y + Math.sin(angle) * (60 + i * 22);
        list.push({
          x: ex, y: ey,
          homeX: ex, homeY: ey,
          angle: Math.random() * Math.PI * 2,
          health: ENEMY.health,
          fireTimer: 0.5 + Math.random(),
          label: label || 'Harbor Kings',
          alive: true,
          walkPhase: Math.random() * Math.PI * 2,
        });
      }
    },
    /** How many of the squad are still standing. */
    aliveCount() {
      return list.filter((e) => e.alive).length;
    },
    clear() {
      list.length = 0;
    },
    update(dt, player, effects, audio, onEnemyDown) {
      for (const enemy of list) {
        if (!enemy.alive) continue;
        enemy.walkPhase += dt * 6;
        const dx = player.x - enemy.x;
        const dy = player.y - enemy.y;
        const dist = Math.hypot(dx, dy);
        enemy.angle = Math.atan2(dy, dx);
        // Close in until in range, then hold and shoot.
        if (dist > ENEMY.range * 0.7 && dist < 700) {
          enemy.x += (dx / dist) * ENEMY.speed * dt;
          enemy.y += (dy / dist) * ENEMY.speed * dt;
        } else if (dist >= 700) {
          // Drift back to their post when the player is far away.
          const hx = enemy.homeX - enemy.x;
          const hy = enemy.homeY - enemy.y;
          const hd = Math.hypot(hx, hy);
          if (hd > 10) {
            enemy.x += (hx / hd) * ENEMY.speed * 0.5 * dt;
            enemy.y += (hy / hd) * ENEMY.speed * 0.5 * dt;
          }
        }
        city.collideCircle(enemy, 12);
        enemy.fireTimer -= dt;
        if (dist < ENEMY.range && enemy.fireTimer <= 0 && player.isAlive()) {
          enemy.fireTimer = ENEMY.fireInterval * (0.8 + Math.random() * 0.5);
          const spread = (Math.random() - 0.5) * 0.28;
          const aim = Math.atan2(dy, dx) + spread;
          effects.muzzle(enemy.x, enemy.y, aim, Math.min(dist, ENEMY.range));
          audio.enemyShot();
          // A shot lands when the spread is small and the player is close.
          if (Math.abs(spread) < 0.09 && dist < ENEMY.range) {
            player.damage(ENEMY.bulletDamage);
            effects.burst(player.x, player.y, '#ff5252', 5);
          }
        }
      }
      // Remove the fallen (their death effects already played where they fell).
      for (let i = list.length - 1; i >= 0; i -= 1) {
        if (!list[i].alive) {
          if (onEnemyDown) onEnemyDown(list[i]);
          list.splice(i, 1);
        }
      }
    },
    /** Damage the enemy nearest a bullet's path; returns the enemy hit. */
    hitTest(x, y, angle, range) {
      let best = null;
      let bestD = range;
      for (const enemy of list) {
        if (!enemy.alive) continue;
        const dx = enemy.x - x;
        const dy = enemy.y - y;
        const along = dx * Math.cos(angle) + dy * Math.sin(angle);
        if (along < 0 || along > range) continue;
        const across = Math.abs(-dx * Math.sin(angle) + dy * Math.cos(angle));
        if (across < 16 && along < bestD) {
          bestD = along;
          best = enemy;
        }
      }
      return best;
    },
  };
}
