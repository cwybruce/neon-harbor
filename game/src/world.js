// The simulation: one fixed 1/60 s step moves everything — Jax on foot, in a car or
// in a boat, traffic and pedestrians, police cars, boats and officers, the wanted
// level, four missions, combat and pickups. The renderer only paints this state.

import {
  BOAT, CAR, MISSIONS, PEDESTRIAN, PICKUPS, PLAYER, POLICE, SAVE_KEY, STEP, TRAFFIC, WANTED,
} from './config.js';
import { buildCity, isWaterAt, nearestRoadPoint, onPier, resolveBoat, resolveLand, resolveSolids } from './city.js';
import { pick, range } from './random.js';

export const EVENT_NONE = 0;
export const EVENT_BUSTED = 1;
export const EVENT_WASTED = 2;
export const EVENT_COMPLETE = 4;
export const EVENT_MISSION = 8;

const CAR_COLORS = ['#ff5a5a', '#ffd319', '#3dff8e', '#c8cdd8', '#ff8a3d', '#b678ff', '#7ab8ff'];
const BOAT_COLORS = ['#e8e4d8', '#ff8a3d', '#19c2b8'];

function angleLerp(a, b, t) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

function angleDiff(a, b) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

function dist(ax, ay, bx, by) {
  return Math.hypot(ax - bx, ay - by);
}

export function createWorld(random, audio) {
  const city = buildCity(random);

  function makeCar(x, y, angle, kind, owner) {
    return {
      id: Math.floor(random() * 1e9),
      kind, owner,
      x, y, angle,
      speed: 0,
      hp: kind === 'truck' ? 160 : kind === 'police' ? 140 : CAR.hp,
      color: kind === 'police' ? '#3b82f6' : kind === 'truck' ? '#8a94a6' : pick(random, CAR_COLORS),
      parked: owner === 'parked',
      road: null, dir: 1, lane: 0,
      ramCd: 0,
      bumpCd: 0,
      wrecked: false,
    };
  }

  function makeBoat(x, y, angle, kind, owner) {
    return {
      id: Math.floor(random() * 1e9),
      kind, owner,
      x, y, angle,
      speed: 0,
      hp: BOAT.hp,
      color: kind === 'police' ? '#3b82f6' : pick(random, BOAT_COLORS),
      parked: owner === 'parked',
      ramCd: 0,
      wrecked: false,
    };
  }

  function makePed(x, y) {
    const road = nearestRoadPoint(city, x, y);
    return {
      x, y, angle: random() * Math.PI * 2,
      speed: range(random, PEDESTRIAN.speed - PEDESTRIAN.speedJitter, PEDESTRIAN.speed + PEDESTRIAN.speedJitter),
      targetX: road.x, targetY: road.y,
      hp: 50, dead: false, fade: 0,
    };
  }

  function makeOfficer(x, y) {
    return { x, y, angle: 0, hp: 100, shootCd: range(random, 0.5, 1.5), dead: false, fade: 0 };
  }

  function spawnTrafficCar() {
    const vertical = random() < 0.5;
    const road = vertical
      ? pick(random, city.roadsV)
      : pick(random, city.roadsH);
    const along = range(random, 100, (vertical ? city.height : city.width) - 100);
    const car = makeCar(vertical ? road : along, vertical ? along : road, 0, 'sedan', 'traffic');
    car.road = vertical ? 'v' : 'h';
    car.roadIndex = road;
    car.dir = random() < 0.5 ? 1 : -1;
    car.lane = (random() < 0.5 ? -1 : 1) * 15;
    car.angle = vertical ? (car.dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (car.dir > 0 ? 0 : Math.PI);
    car.speed = range(random, TRAFFIC.speed - TRAFFIC.speedJitter, TRAFFIC.speed + TRAFFIC.speedJitter);
    return car;
  }

  function spawnPickup(kind) {
    const road = nearestRoadPoint(city, range(random, 200, 1800), range(random, 200, 1700));
    return { x: road.x + range(random, -40, 40), y: road.y + range(random, -40, 40), kind, bob: random() * 6 };
  }

  const state = {
    city,
    time: 0,
    player: {
      x: city.markers.start.x, y: city.markers.start.y, angle: -Math.PI / 2,
      health: PLAYER.health, ammo: PLAYER.ammoStart, cash: 0,
      vehicle: null, punchCd: 0, shootCd: 0, bustTimer: 0, invulnerable: 0,
    },
    cars: [],
    boats: [],
    peds: [],
    officers: [],
    wanted: 0,
    lastCrime: -100,
    missionIndex: 0,
    missionStage: 'go',
    missionTimer: MISSIONS[0].time,
    missionTarget: { ...city.markers.yardCrate, label: 'the crate' },
    banner: null,
    effects: [],
    pickups: [],
    pickupTimer: 0,
    policeTimer: 0,
    stats: { stolen: 0, earned: 0, busted: 0 },
    complete: false,
    bestCash: 0,
  };

  function banner(text, seconds) {
    state.banner = { text, until: state.time + (seconds || 4) };
  }

  function addEffect(x, y, kind) {
    state.effects.push({ x, y, kind, t: 0, ttl: kind === 'boom' ? 0.7 : 0.35 });
    if (state.effects.length > 40) state.effects.shift();
  }

  function commitCrime(amount) {
    state.wanted = Math.min(5, state.wanted + amount);
    state.lastCrime = state.time;
  }

  function missionText() {
    const names = [
      'Mira: Grab the crate in the container yard, then run it to Pier 3.',
      'Mira: Steal the container truck in the yard. Take it to the North Gate.',
      'Mira: Get a boat. Reach the far buoy before the harbor police box you in.',
      'Mira: The getaway car is on Pier 1. Drive it to the lighthouse. No mistakes.',
    ];
    return names[state.missionIndex] || '';
  }

  function startMission(index) {
    state.missionIndex = index;
    state.missionStage = 'go';
    state.missionTimer = MISSIONS[index].time;
    if (index === 0) state.missionTarget = { ...city.markers.yardCrate, label: 'the crate' };
    if (index === 1) state.missionTarget = { ...city.markers.truck, label: 'the truck' };
    if (index === 2) state.missionTarget = { ...city.markers.buoy, label: 'the buoy' };
    if (index === 3) {
      state.missionTarget = { ...city.markers.lighthouse, label: 'the lighthouse' };
      // The getaway car waits on Pier 1.
      const car = makeCar(2100, 180, Math.PI / 2, 'sedan', 'parked');
      car.color = '#ffd319';
      car.getaway = true;
      state.cars.push(car);
    }
    banner(missionText(), 6);
  }

  function finishMission() {
    const m = MISSIONS[state.missionIndex];
    state.player.cash += m.pay;
    state.stats.earned += m.pay;
    audio.mission();
    if (state.missionIndex >= MISSIONS.length - 1) {
      state.complete = true;
      state.bestCash = Math.max(state.bestCash, state.player.cash);
      try { window.localStorage.setItem('neon-harbor.best', String(state.bestCash)); } catch { /* ignore */ }
      audio.complete();
      return EVENT_COMPLETE;
    }
    banner(`Job done. +$${m.pay} — Mira has another one for you.`, 5);
    startMission(state.missionIndex + 1);
    return EVENT_MISSION;
  }

  function failMission() {
    banner('Too slow. Mira gives you another shot — back to the start of this job.', 5);
    startMission(state.missionIndex);
  }

  function resetWorld() {
    state.cars.length = 0;
    state.boats.length = 0;
    state.peds.length = 0;
    state.officers.length = 0;
    state.pickups.length = 0;
    state.effects.length = 0;
    for (const s of city.carSpawns) state.cars.push(makeCar(s.x, s.y, s.angle, 'sedan', 'parked'));
    state.cars.push(makeCar(city.markers.truck.x, city.markers.truck.y, 0, 'truck', 'parked'));
    for (const s of city.boatSpawns) state.boats.push(makeBoat(s.x, s.y, s.angle, 'speedboat', 'parked'));
    for (let i = 0; i < TRAFFIC.count; i++) state.cars.push(spawnTrafficCar());
    for (let i = 0; i < PEDESTRIAN.count; i++) {
      state.peds.push(makePed(range(random, 200, 1800), range(random, 200, 1700)));
    }
    for (const kind of ['cash', 'ammo', 'medkit', 'cash', 'ammo', 'cash', 'medkit', 'cash']) {
      state.pickups.push(spawnPickup(kind));
    }
    const p = state.player;
    p.x = city.markers.start.x;
    p.y = city.markers.start.y;
    p.angle = -Math.PI / 2;
    p.health = PLAYER.health;
    p.ammo = PLAYER.ammoStart;
    p.cash = 0;
    p.vehicle = null;
    p.bustTimer = 0;
    p.invulnerable = 0;
    state.wanted = 0;
    state.lastCrime = -100;
    state.complete = false;
    state.time = 0;
    startMission(0);
  }

  function playerVehicle() {
    const v = state.player.vehicle;
    if (!v) return null;
    if (v.kind === 'boat') return state.boats.find((b) => b.id === v.id) || null;
    return state.cars.find((c) => c.id === v.id) || null;
  }

  function nearestStealable(maxDist) {
    const p = state.player;
    let best = null;
    let bestD = maxDist;
    for (const c of state.cars) {
      if (c.owner !== 'parked' || c.wrecked) continue;
      const d = dist(p.x, p.y, c.x, c.y);
      if (d < bestD) { bestD = d; best = { kind: 'car', id: c.id }; }
    }
    for (const b of state.boats) {
      if (b.owner !== 'parked' || b.wrecked) continue;
      const d = dist(p.x, p.y, b.x, b.y);
      if (d < bestD) { bestD = d; best = { kind: 'boat', id: b.id }; }
    }
    return best;
  }

  function enterVehicle(ref) {
    const p = state.player;
    if (ref.kind === 'car') {
      const car = state.cars.find((c) => c.id === ref.id);
      if (!car) return;
      car.owner = 'player';
      car.parked = false;
      p.vehicle = { kind: 'car', id: car.id };
      p.angle = car.angle;
      state.stats.stolen += 1;
      commitCrime(WANTED.theft);
      audio.steal();
      banner(car.kind === 'truck' ? 'Truck stolen. The yard guards called it in.' : 'Car stolen. Keep it moving.', 3);
    } else {
      const boat = state.boats.find((b) => b.id === ref.id);
      if (!boat) return;
      boat.owner = 'player';
      boat.parked = false;
      p.vehicle = { kind: 'boat', id: boat.id };
      p.angle = boat.angle;
      state.stats.stolen += 1;
      commitCrime(WANTED.theft);
      audio.steal();
      banner('Boat stolen. Harbor patrol is on its way.', 3);
    }
  }

  function exitVehicle() {
    const p = state.player;
    const v = playerVehicle();
    if (!v) { p.vehicle = null; return true; }
    if (v.kind === 'boat') {
      // Only step out where the water meets land or a pier.
      const nearShore = v.x < city.waterX + 90;
      const nearPier = city.piers.some((pi) => dist(v.x, v.y, Math.max(pi.x, Math.min(v.x, pi.x + pi.w)), Math.max(pi.y, Math.min(v.y, pi.y + pi.h))) < 80);
      if (!nearShore && !nearPier) {
        banner('Too deep to climb out here — pull up to a pier or the shore.', 3);
        return false;
      }
      p.x = v.x;
      p.y = v.y;
      resolveLand(city, p, PLAYER.radius);
    } else {
      // Step out beside the vehicle, on land for cars, in the water for boats.
      const side = { x: p.x + Math.cos(p.angle + Math.PI / 2) * 34, y: p.y + Math.sin(p.angle + Math.PI / 2) * 34 };
      p.x = side.x;
      p.y = side.y;
      resolveLand(city, p, PLAYER.radius);
    }
    v.owner = 'parked';
    v.parked = true;
    v.speed = 0;
    p.vehicle = null;
    return true;
  }

  function shootAt(aimX, aimY) {
    const p = state.player;
    if (p.shootCd > 0 || p.ammo <= 0) return;
    p.shootCd = PLAYER.pistolCooldown;
    p.ammo -= 1;
    const aimAngle = Math.atan2(aimY - p.y, aimX - p.x);
    p.angle = aimAngle;
    audio.shoot();
    addEffect(p.x + Math.cos(aimAngle) * 22, p.y + Math.sin(aimAngle) * 22, 'flash');
    // Hit-scan: the closest hostile within range and a narrow cone of the aim.
    let best = null;
    let bestD = PLAYER.pistolRange;
    const consider = (x, y, obj, kind) => {
      const d = dist(p.x, p.y, x, y);
      if (d > bestD) return;
      if (Math.abs(angleDiff(aimAngle, Math.atan2(y - p.y, x - p.x))) > 0.14) return;
      bestD = d;
      best = { obj, kind };
    };
    for (const o of state.officers) if (!o.dead) consider(o.x, o.y, o, 'officer');
    for (const pd of state.peds) if (!pd.dead) consider(pd.x, pd.y, pd, 'ped');
    for (const c of state.cars) {
      if (c.owner === 'police' && !c.wrecked) consider(c.x, c.y, c, 'car');
    }
    if (!best) return;
    if (best.kind === 'officer') {
      best.obj.hp -= PLAYER.pistolDamage;
      commitCrime(WANTED.shootCop);
      if (best.obj.hp <= 0) {
        best.obj.dead = true;
        commitCrime(WANTED.killCop);
        banner('Officer down. The whole harbor is looking for you now.', 4);
      }
    } else if (best.kind === 'ped') {
      best.obj.hp -= PLAYER.pistolDamage;
      if (best.obj.hp <= 0) {
        best.obj.dead = true;
        commitCrime(WANTED.killPed);
        banner('A bystander went down. Wanted level up.', 3);
      }
    } else if (best.kind === 'car') {
      best.obj.hp -= PLAYER.pistolDamage;
      addEffect(best.obj.x, best.obj.y, 'flash');
      if (best.obj.hp <= 0) {
        best.obj.wrecked = true;
        addEffect(best.obj.x, best.obj.y, 'boom');
        audio.crash();
      }
    }
  }

  function punch() {
    const p = state.player;
    if (p.punchCd > 0 || p.vehicle) return;
    p.punchCd = PLAYER.punchCooldown;
    audio.punch();
    const fx = p.x + Math.cos(p.angle) * 26;
    const fy = p.y + Math.sin(p.angle) * 26;
    addEffect(fx, fy, 'flash');
    for (const o of state.officers) {
      if (o.dead) continue;
      if (dist(p.x, p.y, o.x, o.y) < PLAYER.punchRange + 14) {
        o.hp -= PLAYER.punchDamage;
        if (o.hp <= 0) {
          o.dead = true;
          commitCrime(WANTED.killCop);
          banner('Officer down. The whole harbor is looking for you now.', 4);
        }
      }
    }
    for (const pd of state.peds) {
      if (pd.dead) continue;
      if (dist(p.x, p.y, pd.x, pd.y) < PLAYER.punchRange + 12) {
        pd.hp -= PLAYER.punchDamage;
        if (pd.hp <= 0) {
          pd.dead = true;
          commitCrime(WANTED.killPed);
        }
      }
    }
  }

  function stepTraffic(dt) {
    for (const c of state.cars) {
      if (c.owner !== 'traffic' || c.wrecked) continue;
      // Follow the road grid; turn at intersections sometimes.
      const onV = c.road === 'v';
      const pos = onV ? c.y : c.x;
      const roads = onV ? city.roadsH : city.roadsV;
      let nearest = null;
      let nearestD = Infinity;
      for (const r of roads) {
        const d = Math.abs(pos - r);
        if (d < nearestD) { nearestD = d; nearest = r; }
      }
      if (nearest !== null && nearestD < 8 && random() < 0.01) {
        // Turn onto the crossing road.
        c.road = onV ? 'h' : 'v';
        c.roadIndex = nearest;
        c.dir = random() < 0.5 ? 1 : -1;
        c.lane = (random() < 0.5 ? -1 : 1) * 15;
        c.angle = c.road === 'v' ? (c.dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (c.dir > 0 ? 0 : Math.PI);
      }
      const target = c.road === 'v'
        ? { x: c.roadIndex + c.lane, y: c.y + c.dir * c.speed * dt }
        : { x: c.x + c.dir * c.speed * dt, y: c.roadIndex + c.lane };
      c.x = target.x;
      c.y = target.y;
      // Out of the map: come back on the same road from the other side.
      if (c.x < 40 || c.x > city.width - 40 || c.y < 40 || c.y > city.height - 40) {
        c.dir *= -1;
        c.angle += Math.PI;
        c.x = Math.max(60, Math.min(city.width - 60, c.x));
        c.y = Math.max(60, Math.min(city.height - 60, c.y));
      }
    }
  }

  function stepPeds(dt) {
    for (const pd of state.peds) {
      if (pd.dead) { pd.fade += dt; continue; }
      const d = dist(pd.x, pd.y, pd.targetX, pd.targetY);
      if (d < 12) {
        const road = nearestRoadPoint(city, pd.x + range(random, -500, 500), pd.y + range(random, -500, 500));
        pd.targetX = road.x + range(random, -30, 30);
        pd.targetY = road.y + range(random, -30, 30);
      } else {
        const a = Math.atan2(pd.targetY - pd.y, pd.targetX - pd.x);
        pd.angle = angleLerp(pd.angle, a, Math.min(1, dt * 6));
        pd.x += Math.cos(a) * pd.speed * dt;
        pd.y += Math.sin(a) * pd.speed * dt;
        resolveSolids(city, pd, 10);
        if (isWaterAt(city, pd.x, pd.y)) {
          pd.x -= Math.cos(a) * pd.speed * dt * 2;
          pd.y -= Math.sin(a) * pd.speed * dt * 2;
        }
      }
    }
    state.peds = state.peds.filter((pd) => !pd.dead || pd.fade < 3);
  }

  function policeWanted() {
    const p = state.player;
    // Decay when quiet and no police close.
    const nearPolice = state.cars.some((c) => c.owner === 'police' && dist(p.x, p.y, c.x, c.y) < 450) ||
      state.officers.some((o) => !o.dead && dist(p.x, p.y, o.x, o.y) < 300);
    if (state.time - state.lastCrime > WANTED.decayDelay && !nearPolice) {
      state.wanted = Math.max(0, state.wanted - WANTED.decayPerSecond * STEP);
    }
  }

  function stepPolice(dt) {
    const p = state.player;
    const level = Math.floor(state.wanted);
    // Spawn police cars to match the wanted level.
    state.policeTimer -= dt;
    if (level >= 1 && state.policeTimer <= 0) {
      state.policeTimer = 1.5;
      const wantCars = Math.min(level, POLICE.maxCars);
      const haveCars = state.cars.filter((c) => c.owner === 'police' && !c.wrecked).length;
      if (haveCars < wantCars) {
        const road = nearestRoadPoint(city, p.x + range(random, -700, 700), p.y + range(random, -700, 700));
        const car = makeCar(road.x, road.y, 0, 'police', 'police');
        state.cars.push(car);
      }
      if (p.vehicle && p.vehicle.kind === 'boat' && level >= 2) {
        const haveBoats = state.boats.filter((b) => b.owner === 'police' && !b.wrecked).length;
        if (haveBoats < Math.min(level - 1, POLICE.maxBoats)) {
          const b = makeBoat(p.x + range(random, -500, 500), Math.max(city.waterX + 60, p.y + range(random, -400, 400)), 0, 'police', 'police');
          state.boats.push(b);
        }
      }
      if (level >= 3 && !p.vehicle) {
        const haveOfficers = state.officers.filter((o) => !o.dead).length;
        if (haveOfficers < POLICE.maxOfficers) {
          state.officers.push(makeOfficer(p.x + range(random, -260, 260), p.y + range(random, -260, 260)));
        }
      }
    }
    // Police cars chase.
    for (const c of state.cars) {
      if (c.owner !== 'police' || c.wrecked) continue;
      c.ramCd -= dt;
      const want = Math.atan2(p.y - c.y, p.x - c.x);
      c.angle = angleLerp(c.angle, want, Math.min(1, dt * 2.2));
      c.speed = Math.min(POLICE.carSpeed, c.speed + 500 * dt);
      c.x += Math.cos(c.angle) * c.speed * dt;
      c.y += Math.sin(c.angle) * c.speed * dt;
      resolveLand(city, c, 20);
      const d = dist(p.x, p.y, c.x, c.y);
      if (d < 58) {
        if (p.vehicle && p.vehicle.kind === 'car') {
          const v = playerVehicle();
          if (v && c.ramCd <= 0) {
            c.ramCd = POLICE.ramCooldown;
            v.hp -= POLICE.ramDamage;
            addEffect(c.x, c.y, 'flash');
            audio.crash();
            if (v.hp <= 0) {
              v.wrecked = true;
              addEffect(v.x, v.y, 'boom');
              p.health -= 20;
              exitVehicle();
            }
          }
        } else if (!p.vehicle) {
          p.bustTimer += dt;
          if (p.bustTimer >= POLICE.bustTime) return EVENT_BUSTED;
        }
      }
    }
    // Police boats chase on the water.
    for (const b of state.boats) {
      if (b.owner !== 'police' || b.wrecked) continue;
      b.ramCd -= dt;
      const want = Math.atan2(p.y - b.y, p.x - b.x);
      b.angle = angleLerp(b.angle, want, Math.min(1, dt * 1.8));
      b.speed = Math.min(POLICE.boatSpeed, b.speed + 400 * dt);
      b.x += Math.cos(b.angle) * b.speed * dt;
      b.y += Math.sin(b.angle) * b.speed * dt;
      resolveBoat(city, b, 22);
      const d = dist(p.x, p.y, b.x, b.y);
      if (d < 70 && p.vehicle && p.vehicle.kind === 'boat') {
        const v = playerVehicle();
        if (v && b.ramCd <= 0) {
          b.ramCd = POLICE.ramCooldown;
          v.hp -= POLICE.ramDamage;
          addEffect(b.x, b.y, 'flash');
          audio.crash();
          if (v.hp <= 0) {
            v.wrecked = true;
            addEffect(v.x, v.y, 'boom');
            p.health -= 20;
            exitVehicle();
          }
        }
      }
    }
    // Officers chase on foot and shoot.
    for (const o of state.officers) {
      if (o.dead) { o.fade += dt; continue; }
      o.shootCd -= dt;
      const d = dist(p.x, p.y, o.x, o.y);
      const want = Math.atan2(p.y - o.y, p.x - o.x);
      o.angle = angleLerp(o.angle, want, Math.min(1, dt * 5));
      if (d > 34) {
        o.x += Math.cos(want) * POLICE.officerSpeed * dt;
        o.y += Math.sin(want) * POLICE.officerSpeed * dt;
        resolveLand(city, o, 11);
      }
      if (d < 30 && !p.vehicle) {
        p.bustTimer += dt;
        if (p.bustTimer >= POLICE.bustTime) return EVENT_BUSTED;
      }
      if (d < POLICE.shootRange && d > 60 && o.shootCd <= 0 && p.invulnerable <= 0) {
        o.shootCd = POLICE.shootCooldown;
        addEffect(o.x + Math.cos(want) * 20, o.y + Math.sin(want) * 20, 'flash');
        if (random() < 0.45) {
          p.health -= POLICE.shootDamage;
          audio.shoot();
        }
      }
    }
    state.officers = state.officers.filter((o) => !o.dead || o.fade < 3);
    return EVENT_NONE;
  }

  function stepPlayer(dt, input, actions) {
    const p = state.player;
    p.punchCd -= dt;
    p.shootCd -= dt;
    p.invulnerable -= dt;
    if (p.bustTimer > 0) p.bustTimer = Math.max(0, p.bustTimer - dt * 0.5);

    if (actions & 4) { // ACT_ENTER
      if (p.vehicle) exitVehicle();
      else {
        const ref = nearestStealable(64);
        if (ref) enterVehicle(ref);
      }
    }
    if (actions & 8) punch(); // ACT_MELEE
    if (input.mousePressed) shootAt(input.aimX, input.aimY);

    const v = playerVehicle();
    // The reference kind ('car' or 'boat') decides the physics: the vehicle
    // object's own kind is its subtype ('sedan', 'truck', 'speedboat').
    if (v && state.player.vehicle.kind === 'car') {
      const accel = input.throttle > 0 ? CAR.accel : input.throttle < 0 ? -CAR.reverseAccel : 0;
      v.bumpCd = Math.max(0, (v.bumpCd || 0) - dt);
      v.speed += accel * dt;
      if (input.throttle === 0) v.speed *= Math.max(0, 1 - 1.6 * dt);
      const maxF = CAR.maxForward;
      const maxR = -CAR.maxReverse;
      v.speed = Math.max(maxR, Math.min(maxF, v.speed));
      const steerAuthority = Math.min(1, Math.abs(v.speed) / 120);
      v.angle += input.steer * CAR.steer * steerAuthority * dt * (v.speed >= 0 ? 1 : -1);
      const nx = v.x + Math.cos(v.angle) * v.speed * dt;
      const ny = v.y + Math.sin(v.angle) * v.speed * dt;
      const before = { x: v.x, y: v.y };
      v.x = nx;
      v.y = ny;
      const hitSolid = resolveSolids(city, v, 20);
      resolveLand(city, v, 20);
      if (hitSolid && Math.abs(v.speed) > 240) {
        v.hp -= 8;
        audio.crash();
        addEffect(v.x, v.y, 'flash');
        v.speed *= 0.4;
      }
      if (Math.abs(v.x - before.x) < 0.01 && Math.abs(v.y - before.y) < 0.01 && Math.abs(v.speed) > 60) {
        v.speed *= 0.5;
      }
      p.x = v.x;
      p.y = v.y;
      p.angle = v.angle;
      audio.engine(Math.abs(v.speed) / CAR.maxForward);
      // Running over pedestrians.
      for (const pd of state.peds) {
        if (pd.dead) continue;
        if (dist(v.x, v.y, pd.x, pd.y) < 30 && Math.abs(v.speed) > 120) {
          pd.dead = true;
          commitCrime(WANTED.killPed);
          banner('A bystander went down. Wanted level up.', 3);
        }
      }
      // Bumping traffic cars.
      for (const c of state.cars) {
        if (c === v || c.wrecked || c.owner === 'police') continue;
        if (dist(v.x, v.y, c.x, c.y) < 46) {
          const push = 46 - dist(v.x, v.y, c.x, c.y);
          const a = Math.atan2(c.y - v.y, c.x - v.x);
          c.x += Math.cos(a) * push;
          c.y += Math.sin(a) * push;
          // Damage is gated by a cooldown: contact lasts many steps, so
          // without it one scrape would drain the whole health bar.
          if (Math.abs(v.speed) > 200 && v.bumpCd <= 0) {
            c.hp -= 10;
            v.hp -= 6;
            audio.crash();
            v.bumpCd = 0.5;
            if (c.hp <= 0) {
              c.wrecked = true;
              addEffect(c.x, c.y, 'boom');
            }
          }
        }
      }
    } else if (v && state.player.vehicle.kind === 'boat') {
      const accel = input.throttle > 0 ? BOAT.accel : input.throttle < 0 ? -BOAT.accel * 0.5 : 0;
      v.speed += accel * dt;
      if (input.throttle === 0) v.speed *= Math.max(0, 1 - 0.8 * dt);
      v.speed = Math.max(-BOAT.maxReverse, Math.min(BOAT.maxForward, v.speed));
      const steerAuthority = Math.min(1, Math.abs(v.speed) / 100);
      v.angle += input.steer * BOAT.steer * steerAuthority * dt * (v.speed >= 0 ? 1 : -1);
      v.x += Math.cos(v.angle) * v.speed * dt;
      v.y += Math.sin(v.angle) * v.speed * dt;
      resolveBoat(city, v, 22);
      p.x = v.x;
      p.y = v.y;
      p.angle = v.angle;
      audio.engine(Math.abs(v.speed) / BOAT.maxForward);
    } else {
      // On foot.
      audio.stopEngine();
      const mx = input.moveX;
      const my = input.moveY;
      const len = Math.hypot(mx, my);
      if (len > 0) {
        const sp = PLAYER.walkSpeed;
        p.x += (mx / len) * sp * dt;
        p.y += (my / len) * sp * dt;
        p.angle = Math.atan2(my, mx);
        resolveLand(city, p, PLAYER.radius);
      }
      if (input.mouseDown || input.mousePressed) {
        p.angle = Math.atan2(input.aimY - p.y, input.aimX - p.x);
      }
    }
    return EVENT_NONE;
  }

  function stepMissions(dt) {
    if (state.complete) return EVENT_NONE;
    state.missionTimer -= dt;
    if (state.missionTimer <= 0) {
      failMission();
      return EVENT_NONE;
    }
    const p = state.player;
    const t = state.missionTarget;
    if (state.missionIndex === 0) {
      if (state.missionStage === 'go') {
        if (dist(p.x, p.y, t.x, t.y) < 46) {
          state.missionStage = 'return';
          state.missionTarget = { ...city.markers.pier3, label: 'Pier 3' };
          banner('Crate grabbed. Now run it to Pier 3.', 4);
          audio.pickup();
        }
      } else if (dist(p.x, p.y, t.x, t.y) < 56) {
        return finishMission();
      }
    } else if (state.missionIndex === 1) {
      if (state.missionStage === 'go') {
        const truck = state.cars.find((c) => c.kind === 'truck' && !c.wrecked);
        if (truck && p.vehicle && p.vehicle.kind === 'car' && p.vehicle.id === truck.id) {
          state.missionStage = 'return';
          state.missionTarget = { ...city.markers.northGate, label: 'the North Gate' };
          state.wanted = Math.max(state.wanted, 2);
          state.lastCrime = state.time;
          banner('Truck is yours. Lose the heat and take it to the North Gate.', 5);
        }
      } else if (dist(p.x, p.y, t.x, t.y) < 60 && p.vehicle) {
        return finishMission();
      }
    } else if (state.missionIndex === 2) {
      if (p.vehicle && p.vehicle.kind === 'boat' && dist(p.x, p.y, t.x, t.y) < 70) {
        return finishMission();
      }
    } else if (state.missionIndex === 3) {
      if (state.missionStage === 'go') {
        const car = state.cars.find((c) => c.getaway && !c.wrecked);
        if (car && p.vehicle && p.vehicle.kind === 'car' && p.vehicle.id === car.id) {
          state.missionStage = 'return';
          state.missionTarget = { ...city.markers.lighthouse, label: 'the lighthouse' };
          state.wanted = Math.max(state.wanted, 3);
          state.lastCrime = state.time;
          banner('That is the getaway car. The lighthouse, now. No mistakes.', 5);
        }
      } else if (dist(p.x, p.y, t.x, t.y) < 60 && p.vehicle) {
        return finishMission();
      }
    }
    return EVENT_NONE;
  }

  function stepPickups(dt) {
    const p = state.player;
    state.pickupTimer -= dt;
    if (state.pickupTimer <= 0) {
      state.pickupTimer = 20;
      if (state.pickups.length < 10) state.pickups.push(spawnPickup(pick(random, ['cash', 'ammo', 'medkit'])));
    }
    for (const pk of state.pickups) {
      pk.bob += dt;
      if (dist(p.x, p.y, pk.x, pk.y) < 30) {
        pk.taken = true;
        audio.pickup();
        if (pk.kind === 'cash') { p.cash += PICKUPS.cashValue; state.stats.earned += PICKUPS.cashValue; }
        if (pk.kind === 'ammo') p.ammo = Math.min(PLAYER.ammoMax, p.ammo + PICKUPS.ammoValue);
        if (pk.kind === 'medkit') p.health = Math.min(PLAYER.health, p.health + PICKUPS.medkitValue);
      }
    }
    state.pickups = state.pickups.filter((pk) => !pk.taken);
    for (const e of state.effects) e.t += dt;
    state.effects = state.effects.filter((e) => e.t < e.ttl);
  }

  function step(dt, input, actions, attract) {
    state.time += dt;
    if (attract) {
      stepTraffic(dt);
      stepPeds(dt);
      return EVENT_NONE;
    }
    let event = stepPlayer(dt, input, actions);
    if (event) return event;
    stepTraffic(dt);
    stepPeds(dt);
    policeWanted();
    event = stepPolice(dt);
    if (event) return event;
    event = stepMissions(dt);
    if (event) return event;
    stepPickups(dt);
    if (state.player.health <= 0) return EVENT_WASTED;
    if (state.banner && state.time > state.banner.until) state.banner = null;
    return EVENT_NONE;
  }

  function applyBusted() {
    const p = state.player;
    state.stats.busted += 1;
    p.cash = Math.max(0, p.cash - 50);
    p.health = PLAYER.health;
    p.ammo = PLAYER.ammoStart;
    if (p.vehicle) exitVehicle();
    p.x = city.markers.start.x;
    p.y = city.markers.start.y;
    p.bustTimer = 0;
    p.invulnerable = 3;
    state.wanted = 0;
    state.officers.length = 0;
    for (const c of state.cars) if (c.owner === 'police') c.wrecked = true;
    for (const b of state.boats) if (b.owner === 'police') b.wrecked = true;
    banner('Busted. Mira bailed you out — $50 lighter. Back on the street.', 5);
    audio.busted();
  }

  function applyWasted() {
    const p = state.player;
    p.cash = Math.max(0, p.cash - 100);
    p.health = PLAYER.health;
    p.ammo = PLAYER.ammoStart;
    if (p.vehicle) exitVehicle();
    p.x = city.markers.start.x;
    p.y = city.markers.start.y;
    p.bustTimer = 0;
    p.invulnerable = 3;
    state.wanted = 0;
    state.officers.length = 0;
    for (const c of state.cars) if (c.owner === 'police') c.wrecked = true;
    for (const b of state.boats) if (b.owner === 'police') b.wrecked = true;
    banner('Wasted. The harbor clinic patched you up — $100 lighter.', 5);
  }

  function save() {
    const p = state.player;
    const data = {
      cash: p.cash, missionIndex: state.missionIndex, health: p.health, ammo: p.ammo,
      x: p.x, y: p.y, wanted: 0, earned: state.stats.earned,
    };
    try { window.localStorage.setItem(SAVE_KEY, JSON.stringify(data)); } catch { /* ignore */ }
    return data;
  }

  function load() {
    try {
      const raw = window.localStorage.getItem(SAVE_KEY);
      if (!raw) return false;
      const data = JSON.parse(raw);
      const p = state.player;
      p.cash = data.cash || 0;
      p.health = data.health || PLAYER.health;
      p.ammo = data.ammo || PLAYER.ammoStart;
      p.x = data.x || city.markers.start.x;
      p.y = data.y || city.markers.start.y;
      state.stats.earned = data.earned || 0;
      state.wanted = 0;
      startMission(Math.min(data.missionIndex || 0, MISSIONS.length - 1));
      return true;
    } catch {
      return false;
    }
  }

  resetWorld();

  return {
    state,
    city,
    step,
    reset: resetWorld,
    applyBusted,
    applyWasted,
    save,
    load,
    playerVehicle,
    startMission,
    missionText,
    finishMission,
  };
}
