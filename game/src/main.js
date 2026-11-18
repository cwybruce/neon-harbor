// Boot and the one loop: input is read every frame, the world advances in fixed
// 1/60 s steps (several in a slow frame, none in a fast one), and the renderer
// paints what is there. The game moves between six screens: title, play, paused,
// busted, wasted and complete.
//
// ?seed=N fixes the city. ?shot=start|drive|chase|end (with &seed=N) stages that
// scene instead of running the loop, paints it twice and sets window.__shotReady
// for a screenshot.
import { BEST_KEY, STEP, VIEW } from './config.js';
import { createRandom } from './random.js';
import { createWorld, EVENT_BUSTED, EVENT_COMPLETE, EVENT_WASTED } from './world.js';
import {
  ACT_CONFIRM, ACT_ENTER, ACT_LOAD, ACT_MELEE, ACT_MUTE, ACT_PAUSE, ACT_SAVE, createInput,
} from './input.js';
import { createAudio } from './audio.js';
import {
  SCREEN_BUSTED, SCREEN_COMPLETE, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE, SCREEN_WASTED, createRenderer,
} from './render.js';
import { stageShot } from './shots.js';

const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const audio = createAudio();
const world = createWorld(createRandom(seed), audio);
const renderer = createRenderer(canvas);

function readBest() {
  try {
    return Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

function runShot(name) {
  const scene = stageShot(name, world, readBest());
  let painted = 0;
  function paint() {
    renderer.draw(world.state, scene.screen, scene.best, world.state.time);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  let screen = SCREEN_TITLE;
  let best = readBest();
  let accumulator = 0;
  let last = performance.now();

  function announce(message) {
    status.textContent = message;
  }

  function startGame() {
    audio.unlock();
    world.reset();
    accumulator = 0;
    screen = SCREEN_PLAY;
    announce('Neon Harbor. Job one: grab the crate in the container yard.');
  }

  function endGame(kind) {
    if (kind === EVENT_BUSTED) {
      world.applyBusted();
      screen = SCREEN_BUSTED;
      announce('Busted. Press Enter to get back on the street.');
    } else if (kind === EVENT_WASTED) {
      world.applyWasted();
      screen = SCREEN_WASTED;
      announce('Wasted. Press Enter to try again.');
    } else if (kind === EVENT_COMPLETE) {
      screen = SCREEN_COMPLETE;
      best = Math.max(best, world.state.player.cash);
      announce(`Job complete. You walked away with $${world.state.player.cash}.`);
    }
  }

  function handleActions() {
    const actions = input.takeActions();
    if (actions & ACT_MUTE) {
      audio.setMuted(!audio.isMuted());
      announce(audio.isMuted() ? 'Sound off.' : 'Sound on.');
    }
    if (actions & ACT_SAVE && screen === SCREEN_PLAY) {
      world.save();
      announce('Saved. Press L to load it later.');
    }
    if (actions & ACT_LOAD && (screen === SCREEN_PLAY || screen === SCREEN_TITLE)) {
      if (world.load()) {
        screen = SCREEN_PLAY;
        announce('Save loaded. Back on the street.');
      } else {
        announce('No save yet. Press G during a game to save.');
      }
    }
    if (actions & ACT_CONFIRM) {
      audio.unlock();
      if (screen === SCREEN_TITLE || screen === SCREEN_BUSTED || screen === SCREEN_WASTED || screen === SCREEN_COMPLETE) {
        startGame();
      } else if (screen === SCREEN_PAUSED) {
        screen = SCREEN_PLAY;
        announce('Playing.');
      }
    } else if (actions & ACT_PAUSE) {
      if (screen === SCREEN_PLAY) {
        screen = SCREEN_PAUSED;
        announce('Paused.');
      } else if (screen === SCREEN_PAUSED) {
        screen = SCREEN_PLAY;
        announce('Playing.');
      }
    }
    return actions;
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    const actions = handleActions();
    if (screen === SCREEN_TITLE) {
      while (accumulator >= STEP) {
        world.step(STEP, null, 0, true);
        accumulator -= STEP;
      }
    } else if (screen === SCREEN_PLAY) {
      const raw = input.read();
      // Mouse aim in world coordinates: the camera sits on the player, except
      // where it is clamped at the map edge.
      const cam = renderer.camera();
      const aimX = raw.mouseX + (cam.x - VIEW.width / 2);
      const aimY = raw.mouseY + (cam.y - VIEW.height / 2);
      const stepInput = { ...raw, aimX, aimY };
      while (accumulator >= STEP) {
        const event = world.step(STEP, stepInput, actions, false);
        accumulator -= STEP;
        if (event === EVENT_BUSTED || event === EVENT_WASTED || event === EVENT_COMPLETE) {
          endGame(event);
          accumulator = 0;
          break;
        }
      }
    } else {
      accumulator = 0;
    }
    renderer.draw(world.state, screen, best, world.state.time);
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });

  announce('Neon Harbor. Press Enter to start.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
