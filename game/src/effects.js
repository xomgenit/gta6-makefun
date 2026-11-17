// Juice: particles, muzzle flashes, tracers, skid marks, floating score text
// and screen shake. Nothing here changes the rules — only how they feel.

/** Create the effects manager. */
export function createEffects() {
  const particles = [];
  const skids = [];
  const tracers = [];
  const floaters = [];
  let shakeTime = 0;
  let shakePower = 0;

  function spawn(x, y, vx, vy, life, size, color, gravity) {
    particles.push({ x, y, vx, vy, life, maxLife: life, size, color, gravity: gravity || 0 });
  }

  return {
    /** A burst of sparks (impacts, hits). */
    burst(x, y, color, count) {
      for (let i = 0; i < (count || 10); i += 1) {
        const a = Math.random() * Math.PI * 2;
        const s = 60 + Math.random() * 220;
        spawn(x, y, Math.cos(a) * s, Math.sin(a) * s, 0.25 + Math.random() * 0.3, 2 + Math.random() * 3, color, 300);
      }
    },
    /** Muzzle flash plus a short tracer line toward the target. */
    muzzle(x, y, angle, range) {
      for (let i = 0; i < 5; i += 1) {
        const a = angle + (Math.random() - 0.5) * 0.5;
        const s = 260 + Math.random() * 240;
        spawn(x, y, Math.cos(a) * s, Math.sin(a) * s, 0.08 + Math.random() * 0.06, 2, '#ffd23f', 0);
      }
      tracers.push({
        x1: x, y1: y,
        x2: x + Math.cos(angle) * range,
        y2: y + Math.sin(angle) * range,
        life: 0.12,
      });
    },
    /** Grey smoke from a damaged car or a crash. */
    smoke(x, y, count) {
      for (let i = 0; i < (count || 4); i += 1) {
        spawn(x + (Math.random() - 0.5) * 14, y + (Math.random() - 0.5) * 14,
          (Math.random() - 0.5) * 30, -30 - Math.random() * 40,
          0.6 + Math.random() * 0.5, 5 + Math.random() * 6, 'rgba(120,120,120,0.5)', -40);
      }
    },
    /** A skid-mark segment behind a sliding tyre. */
    skidMark(x, y, angle) {
      skids.push({ x, y, angle, life: 5 });
      if (skids.length > 220) skids.shift();
    },
    /** Rising text such as "+$250". */
    floater(x, y, text, color) {
      floaters.push({ x, y, text, color: color || '#7CFC00', life: 1.4 });
    },
    /** Shake the camera for `seconds` at `power` pixels. */
    shake(seconds, power) {
      shakeTime = Math.max(shakeTime, seconds);
      shakePower = Math.max(shakePower, power);
    },
    /** Current shake offset; the camera adds it to its position. */
    shakeOffset() {
      if (shakeTime <= 0) return { x: 0, y: 0 };
      return {
        x: (Math.random() - 0.5) * 2 * shakePower,
        y: (Math.random() - 0.5) * 2 * shakePower,
      };
    },
    update(dt) {
      if (shakeTime > 0) {
        shakeTime -= dt;
        if (shakeTime <= 0) shakePower = 0;
      }
      for (let i = particles.length - 1; i >= 0; i -= 1) {
        const p = particles[i];
        p.life -= dt;
        if (p.life <= 0) { particles.splice(i, 1); continue; }
        p.vy += p.gravity * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vx *= 0.96;
        p.vy *= 0.96;
      }
      for (let i = skids.length - 1; i >= 0; i -= 1) {
        skids[i].life -= dt;
        if (skids[i].life <= 0) skids.splice(i, 1);
      }
      for (let i = tracers.length - 1; i >= 0; i -= 1) {
        tracers[i].life -= dt;
        if (tracers[i].life <= 0) tracers.splice(i, 1);
      }
      for (let i = floaters.length - 1; i >= 0; i -= 1) {
        floaters[i].life -= dt;
        floaters[i].y -= 34 * dt;
        if (floaters[i].life <= 0) floaters.splice(i, 1);
      }
    },
    /** Draw skid marks under everything else. */
    drawSkids(ctx) {
      ctx.save();
      ctx.strokeStyle = 'rgba(20, 20, 20, 0.4)';
      ctx.lineWidth = 5;
      ctx.lineCap = 'round';
      for (const s of skids) {
        ctx.globalAlpha = Math.min(1, s.life / 2) * 0.55;
        ctx.beginPath();
        ctx.moveTo(s.x - Math.cos(s.angle) * 9, s.y - Math.sin(s.angle) * 9);
        ctx.lineTo(s.x + Math.cos(s.angle) * 9, s.y + Math.sin(s.angle) * 9);
        ctx.stroke();
      }
      ctx.restore();
    },
    /** Draw particles, tracers and floating text above the world. */
    draw(ctx) {
      ctx.save();
      for (const t of tracers) {
        ctx.globalAlpha = Math.min(1, t.life / 0.12);
        ctx.strokeStyle = '#fff3b0';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(t.x1, t.y1);
        ctx.lineTo(t.x2, t.y2);
        ctx.stroke();
      }
      for (const p of particles) {
        ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.textAlign = 'center';
      ctx.font = 'bold 17px "Trebuchet MS", sans-serif';
      for (const f of floaters) {
        ctx.globalAlpha = Math.min(1, f.life);
        ctx.fillStyle = f.color;
        ctx.strokeStyle = 'rgba(0,0,0,0.7)';
        ctx.lineWidth = 3;
        ctx.strokeText(f.text, f.x, f.y);
        ctx.fillText(f.text, f.x, f.y);
      }
      ctx.restore();
    },
  };
}
