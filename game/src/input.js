// Keyboard and mouse input: a held-key set, edge-triggered actions, and the
// mouse position in both screen and world coordinates (for aiming).

/** Action names the game polls each frame. */
export const ACTIONS = {
  up: ['KeyW', 'ArrowUp'],
  down: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  sprint: ['ShiftLeft', 'ShiftRight'],
  handbrake: ['Space'],
  interact: ['KeyE'],
  pause: ['KeyP', 'Escape'],
  mute: ['KeyM'],
};

/** Create the input state for a canvas; call update() once per frame. */
export function createInput(canvas) {
  const held = new Set();
  const pressedThisFrame = new Set();
  const mouse = { x: 0, y: 0, down: false, clicked: false, worldX: 0, worldY: 0 };

  function onKeyDown(event) {
    if (event.repeat) return;
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(event.code)) {
      event.preventDefault();
    }
    held.add(event.code);
    pressedThisFrame.add(event.code);
  }

  function onKeyUp(event) {
    held.delete(event.code);
  }

  function onMouseMove(event) {
    const rect = canvas.getBoundingClientRect();
    mouse.x = event.clientX - rect.left;
    mouse.y = event.clientY - rect.top;
  }

  function onMouseDown(event) {
    if (event.button === 0) {
      mouse.down = true;
      mouse.clicked = true;
    }
  }

  function onMouseUp(event) {
    if (event.button === 0) mouse.down = false;
  }

  function onBlur() {
    held.clear();
    mouse.down = false;
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);
  canvas.addEventListener('mousemove', onMouseMove);
  canvas.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mouseup', onMouseUp);

  return {
    mouse,
    /** True while any key of the action is held. */
    isDown(action) {
      return ACTIONS[action].some((code) => held.has(code));
    },
    /**
     * True only on the first read of the frame an action's key went down.
     * Reading consumes it, so several fixed steps in one frame never see the
     * same press twice (stealing a car and getting out of it at once).
     */
    wasPressed(action) {
      const hit = ACTIONS[action].some((code) => pressedThisFrame.has(code));
      if (hit) {
        for (const code of ACTIONS[action]) pressedThisFrame.delete(code);
      }
      return hit;
    },
    /** True only on the frame the left mouse button went down. */
    mouseClicked() {
      return mouse.clicked;
    },
    /** Movement vector from the held keys, normalised. */
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
    /** Convert the mouse to world coordinates with the camera's transform. */
    updateMouseWorld(camera) {
      mouse.worldX = camera.x + mouse.x / camera.zoom;
      mouse.worldY = camera.y + mouse.y / camera.zoom;
    },
    /** Clear the frame's edge triggers; call at the end of each update. */
    endFrame() {
      pressedThisFrame.clear();
      mouse.clicked = false;
    },
    detach() {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      canvas.removeEventListener('mousemove', onMouseMove);
      canvas.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mouseup', onMouseUp);
    },
  };
}
