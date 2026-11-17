// Danny "Dice" Marlow: on-foot movement and shooting, getting in and out of
// cars, health and the cash he carries.

import { PLAYER } from './config.js';

/** Create the player at the hideout. */
export function createPlayer(city, spawn) {
  const player = {
    x: spawn.x,
    y: spawn.y,
    angle: -Math.PI / 2,
    health: PLAYER.health,
    money: 0,
    car: null,
    fireTimer: 0,
    walkPhase: 0,
    moving: false,
    damageFlash: 0,
    get inCar() {
      return this.car !== null;
    },
    isAlive() {
      return this.health > 0;
    },
    speed() {
      if (this.car) return Math.hypot(this.car.vx, this.car.vy);
      return this.moving ? PLAYER.walkSpeed : 0;
    },
    damage(amount) {
      if (!this.isAlive()) return;
      this.health = Math.max(0, this.health - amount);
      this.damageFlash = 0.35;
    },
    heal(amount) {
      this.health = Math.min(PLAYER.health, this.health + amount);
    },
    earn(amount) {
      this.money += amount;
    },
    spend(amount) {
      if (this.money < amount) return false;
      this.money -= amount;
      return true;
    },
    /** Forced out of a wrecked car onto the street beside it. */
    ejectFromWreck(car) {
      this.car = null;
      this.x = car.x + Math.cos(car.angle + Math.PI / 2) * 44;
      this.y = car.y + Math.sin(car.angle + Math.PI / 2) * 44;
      city.collideCircle(this, PLAYER.radius);
    },
    /** Step the player on foot: move, aim at the mouse, fire. */
    updateOnFoot(dt, input, context) {
      const { effects, audio, enemies, police, peds, onShoot, onKillCop } = context;
      this.fireTimer -= dt;
      if (this.damageFlash > 0) this.damageFlash -= dt;
      const move = input.moveVector();
      this.moving = move.x !== 0 || move.y !== 0;
      const speed = input.isDown('sprint') ? PLAYER.sprintSpeed : PLAYER.walkSpeed;
      if (this.moving) {
        this.walkPhase += dt * (input.isDown('sprint') ? 15 : 10);
        this.x += move.x * speed * dt;
        this.y += move.y * speed * dt;
        city.collideCircle(this, PLAYER.radius);
      }
      // Face the mouse.
      this.angle = Math.atan2(input.mouse.worldY - this.y, input.mouse.worldX - this.x);
      // Fire while the mouse is held.
      if (input.mouse.down && this.fireTimer <= 0 && this.isAlive()) {
        this.fireTimer = PLAYER.fireInterval;
        effects.muzzle(this.x, this.y, this.angle, PLAYER.bulletRange);
        audio.gunshot();
        effects.shake(0.06, 1.5);
        if (onShoot) onShoot(this.x, this.y);
        if (peds) peds.scatter(this.x, this.y, 420);
        // Hitscan: the first enemy, cop or pedestrian on the bullet's line.
        const enemy = enemies ? enemies.hitTest(this.x, this.y, this.angle, PLAYER.bulletRange) : null;
        const cop = police ? police.hitTest(this.x, this.y, this.angle, PLAYER.bulletRange) : null;
        let target = null;
        let targetKind = null;
        if (enemy && cop) {
          const de = Math.hypot(enemy.x - this.x, enemy.y - this.y);
          const dc = Math.hypot(cop.x - this.x, cop.y - this.y);
          target = de < dc ? enemy : cop;
          targetKind = de < dc ? 'enemy' : 'cop';
        } else if (enemy) {
          target = enemy;
          targetKind = 'enemy';
        } else if (cop) {
          target = cop;
          targetKind = 'cop';
        }
        if (target) {
          target.health -= PLAYER.bulletDamage;
          effects.burst(target.x, target.y, '#ff5252', 7);
          if (target.health <= 0) {
            if (targetKind === 'enemy') {
              target.alive = false;
              effects.burst(target.x, target.y, '#c0392b', 14);
            } else if (onKillCop) {
              onKillCop(target);
            }
          }
        } else if (peds) {
          // A stray bullet can still drop a pedestrian.
          for (const ped of peds.peds) {
            if (ped.state === 'down') continue;
            const dx = ped.x - this.x;
            const dy = ped.y - this.y;
            const along = dx * Math.cos(this.angle) + dy * Math.sin(this.angle);
            if (along < 0 || along > PLAYER.bulletRange) continue;
            const across = Math.abs(-dx * Math.sin(this.angle) + dy * Math.cos(this.angle));
            if (across < 14) {
              ped.state = 'down';
              ped.stateTimer = 6;
              effects.burst(ped.x, ped.y, '#ff5252', 8);
              if (police) police.addWanted(1);
              break;
            }
          }
        }
      }
    },
    /** Step the player while driving: position follows the car. */
    updateInCar(dt, input, vehicles, effects) {
      if (!this.car) return;
      this.x = this.car.x;
      this.y = this.car.y;
      this.angle = this.car.angle;
      const slide = vehicles.drivePlayer(this.car, dt, input);
      if (slide > 120 && Math.hypot(this.car.vx, this.car.vy) > 200) {
        const backX = this.car.x - Math.cos(this.car.angle) * 26;
        const backY = this.car.y - Math.sin(this.car.angle) * 26;
        effects.skidMark(backX, backY, this.car.angle);
      }
    },
    /** Get into a car (stealing it if it had a driver). */
    enterCar(car, audio) {
      this.car = car;
      car.driver = 'player';
      this.x = car.x;
      this.y = car.y;
      if (audio) {
        audio.doorSlam();
        audio.startEngine();
      }
    },
    /** Get out of the car onto the street beside it. */
    exitCar(cityRef, audio) {
      if (!this.car) return;
      const car = this.car;
      car.driver = 'parked';
      car.speed *= 0.4;
      this.car = null;
      this.x = car.x + Math.cos(car.angle + Math.PI / 2) * 46;
      this.y = car.y + Math.sin(car.angle + Math.PI / 2) * 46;
      cityRef.collideCircle(this, PLAYER.radius);
      if (audio) {
        audio.doorSlam();
        audio.stopEngine();
      }
    },
  };
  return player;
}
