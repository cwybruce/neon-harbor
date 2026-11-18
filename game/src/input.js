// Keyboard and mouse input. Held keys steer and drive; one-shot presses (enter a
// vehicle, punch, pause, save, load, mute) are queued as flags and taken once by the
// loop, so a press between two frames is never lost and never counted twice.

export const ACT_CONFIRM = 1;
export const ACT_PAUSE = 2;
export const ACT_ENTER = 4;
export const ACT_MELEE = 8;
export const ACT_SAVE = 16;
export const ACT_LOAD = 32;
export const ACT_MUTE = 64;

const UP = new Set(['ArrowUp', 'KeyW']);
const DOWN = new Set(['ArrowDown', 'KeyS']);
const LEFT = new Set(['ArrowLeft', 'KeyA']);
const RIGHT = new Set(['ArrowRight', 'KeyD']);
const CONFIRM = new Set(['Space', 'Enter']);
const PAUSE = new Set(['KeyP', 'Escape']);
const ENTER = new Set(['KeyE']);
const MELEE = new Set(['KeyF']);
const SAVE = new Set(['KeyG']);
const LOAD = new Set(['KeyL']);
const MUTE = new Set(['KeyM']);

export function createInput(canvas) {
  const held = new Set();
  let actions = 0;
  let mouseX = 0;
  let mouseY = 0;
  let mouseDown = false;
  let mousePressed = false;

  function press(code) {
    if (CONFIRM.has(code)) actions |= ACT_CONFIRM;
    else if (PAUSE.has(code)) actions |= ACT_PAUSE;
    else if (ENTER.has(code)) actions |= ACT_ENTER;
    else if (MELEE.has(code)) actions |= ACT_MELEE;
    else if (SAVE.has(code)) actions |= ACT_SAVE;
    else if (LOAD.has(code)) actions |= ACT_LOAD;
    else if (MUTE.has(code)) actions |= ACT_MUTE;
  }

  window.addEventListener('keydown', (event) => {
    if (UP.has(event.code) || DOWN.has(event.code) || LEFT.has(event.code) || RIGHT.has(event.code)) {
      held.add(event.code);
      event.preventDefault();
    } else if (CONFIRM.has(event.code) || PAUSE.has(event.code) || ENTER.has(event.code) ||
               MELEE.has(event.code) || SAVE.has(event.code) || LOAD.has(event.code) || MUTE.has(event.code)) {
      if (!event.repeat) press(event.code);
      event.preventDefault();
    }
  });
  window.addEventListener('keyup', (event) => {
    held.delete(event.code);
  });
  window.addEventListener('blur', () => {
    held.clear();
    mouseDown = false;
  });
  canvas.addEventListener('pointermove', (event) => {
    const rect = canvas.getBoundingClientRect();
    mouseX = (event.clientX - rect.left) * (canvas.width / rect.width);
    mouseY = (event.clientY - rect.top) * (canvas.height / rect.height);
  });
  canvas.addEventListener('pointerdown', (event) => {
    const rect = canvas.getBoundingClientRect();
    mouseX = (event.clientX - rect.left) * (canvas.width / rect.width);
    mouseY = (event.clientY - rect.top) * (canvas.height / rect.height);
    mouseDown = true;
    mousePressed = true;
  });
  window.addEventListener('pointerup', () => {
    mouseDown = false;
  });

  return {
    /** Steering and throttle as -1/0/1 pairs, plus the mouse aim in canvas pixels. */
    read() {
      const has = (set) => [...set].some((code) => held.has(code));
      return {
        steer: (has(RIGHT) ? 1 : 0) - (has(LEFT) ? 1 : 0),
        throttle: (has(UP) ? 1 : 0) - (has(DOWN) ? 1 : 0),
        moveX: (has(RIGHT) ? 1 : 0) - (has(LEFT) ? 1 : 0),
        moveY: (has(DOWN) ? 1 : 0) - (has(UP) ? 1 : 0),
        mouseX,
        mouseY,
        mouseDown,
        mousePressed: (() => { const p = mousePressed; mousePressed = false; return p; })(),
      };
    },
    /** The one-shot presses since the last call, as ACT_* flags. */
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
  };
}
