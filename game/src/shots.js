// Staging for screenshots: each shot puts Jax in a real situation and runs the
// simulation forward with scripted inputs, so the pictures are the game itself
// playing, not a posed mock-up.

import { STEP } from './config.js';

function blankInput(aimX, aimY) {
  return {
    steer: 0, throttle: 0, moveX: 0, moveY: 0,
    mouseX: 0, mouseY: 0, mouseDown: false, mousePressed: false,
    aimX, aimY,
  };
}

function driveInput(aimX, aimY, steer) {
  return { ...blankInput(aimX, aimY), throttle: 1, steer: steer || 0 };
}

export function stageShot(name, world, best) {
  const s = world.state;
  const p = s.player;

  if (name === 'start') {
    return { screen: 'title', best: best || 0 };
  }

  if (name === 'drive') {
    // Jax steals a car on the waterfront road and drives north past the containers,
    // mission one live on the HUD.
    const car = s.cars.find((c) => c.owner === 'parked' && !c.wrecked);
    if (car) {
      car.x = 1850;
      car.y = 1700;
      car.angle = -Math.PI / 2;
      car.speed = 0;
      car.owner = 'player';
      car.parked = false;
      p.vehicle = { kind: 'car', id: car.id };
      p.x = car.x;
      p.y = car.y;
      p.angle = car.angle;
    }
    // Two traffic cars on the same road so the shot has company.
    const traffic = s.cars.filter((c) => c.owner === 'traffic' && !c.wrecked).slice(0, 2);
    if (traffic[0]) { traffic[0].road = 'v'; traffic[0].roadIndex = 1850; traffic[0].x = 1850; traffic[0].y = 900; traffic[0].dir = 1; traffic[0].angle = Math.PI / 2; }
    if (traffic[1]) { traffic[1].road = 'v'; traffic[1].roadIndex = 1850; traffic[1].x = 1850; traffic[1].y = 1200; traffic[1].dir = -1; traffic[1].angle = -Math.PI / 2; }
    for (let i = 0; i < 200; i++) {
      const steer = i > 100 && i < 140 ? 0.4 : 0;
      world.step(STEP, driveInput(p.x + 200, p.y - 200, steer), 0, false);
      if (s.complete) break;
    }
    return { screen: 'play', best: best || 0 };
  }

  if (name === 'chase') {
    // Jax in a speedboat off the piers, five stars, harbor police boats closing in.
    const boat = s.boats.find((b) => b.owner === 'parked' && !b.wrecked);
    if (boat) {
      boat.x = 2300;
      boat.y = 1600;
      boat.angle = -Math.PI / 2;
      boat.speed = 0;
      boat.owner = 'player';
      boat.parked = false;
      p.vehicle = { kind: 'boat', id: boat.id };
      p.x = boat.x;
      p.y = boat.y;
      p.angle = boat.angle;
    }
    s.wanted = 5;
    s.lastCrime = s.time;
    s.missionIndex = 2;
    s.missionStage = 'go';
    s.missionTarget = { ...s.city.markers.buoy, label: 'the buoy' };
    s.missionTimer = 62;
    // Weave left then right so the boat stays in open water, heading north.
    // The run stops well south of the buoy, so the shot stays on job 3.
    for (let i = 0; i < 130; i++) {
      const steer = i > 70 && i < 95 ? -0.3 : i > 100 && i < 125 ? 0.3 : 0;
      world.step(STEP, driveInput(p.x, p.y - 300, steer), 0, false);
      if (s.complete) break;
    }
    return { screen: 'play', best: best || 0 };
  }

  if (name === 'end') {
    // All four jobs done: the completion screen with the haul.
    s.complete = true;
    p.cash = 1150;
    s.missionIndex = 3;
    return { screen: 'complete', best: best || 0 };
  }

  return { screen: 'play', best: best || 0 };
}
