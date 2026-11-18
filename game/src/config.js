// Every tuning number and colour in one place. Neon Harbor is a night port city:
// the playable land is the west, the harbour water the east, and the docks sit between them.
// The renderer works in world pixels; the camera scales the 1280x720 view onto it.

export const WORLD = { width: 2600, height: 1900, waterX: 2050 };

export const STEP = 1 / 60;

export const VIEW = { width: 1280, height: 720 };

export const PLAYER = {
  radius: 13,
  walkSpeed: 265,
  runSpeed: 340,
  health: 100,
  punchDamage: 25,
  punchRange: 34,
  punchCooldown: 0.45,
  pistolDamage: 34,
  pistolRange: 420,
  pistolCooldown: 0.28,
  ammoStart: 12,
  ammoMax: 36,
};

export const CAR = {
  accel: 620,
  brake: 900,
  reverseAccel: 320,
  maxForward: 520,
  maxReverse: 180,
  steer: 2.6,
  grip: 6.5,
  length: 52,
  width: 26,
  hp: 120,
};

export const BOAT = {
  accel: 420,
  maxForward: 380,
  maxReverse: 120,
  steer: 1.9,
  grip: 2.2,
  length: 64,
  width: 28,
  hp: 140,
};

export const TRAFFIC = {
  count: 14,
  speed: 150,
  speedJitter: 45,
  carHp: 80,
};

export const PEDESTRIAN = {
  count: 16,
  speed: 55,
  speedJitter: 25,
};

export const POLICE = {
  carSpeed: 470,
  boatSpeed: 400,
  officerSpeed: 250,
  ramDamage: 6,
  ramCooldown: 2.0,
  shootCooldown: 1.4,
  shootDamage: 8,
  shootRange: 380,
  shootSpread: 0.22,
  bustTime: 1.0,
  maxCars: 4,
  maxBoats: 2,
  maxOfficers: 3,
};

export const WANTED = {
  decayDelay: 12,
  decayPerSecond: 0.25,
  theft: 1,
  shootCop: 1,
  killPed: 2,
  killCop: 2,
};

export const MISSIONS = [
  { id: 1, name: 'Dock Smuggling Run', pay: 150, time: 100 },
  { id: 2, name: 'Container-Yard Heist', pay: 250, time: 120 },
  { id: 3, name: 'Harbor Boat Chase', pay: 300, time: 80 },
  { id: 4, name: 'The Lighthouse Delivery', pay: 500, time: 100 },
];

export const PICKUPS = {
  cashValue: 25,
  ammoValue: 12,
  medkitValue: 40,
};

export const PALETTE = {
  water: '#0a1c38',
  waterDeep: '#071426',
  waterLine: '#123a5e',
  land: '#141724',
  road: '#202636',
  roadEdge: '#2e3650',
  lane: '#3d4a6e',
  neonPink: '#ff2ea6',
  neonCyan: '#22e6ff',
  neonYellow: '#ffd319',
  neonGreen: '#3dff8e',
  building: '#1b2138',
  buildingEdge: '#2b3352',
  windowLit: '#ffd319',
  windowDim: '#2a3350',
  containerA: '#ff7a1a',
  containerB: '#19c2b8',
  containerC: '#e84a8a',
  containerD: '#f2c94c',
  pier: '#3a2f22',
  pierEdge: '#5a4632',
  player: '#22e6ff',
  playerDark: '#0b7d99',
  police: '#3b82f6',
  policeRed: '#ff2e4d',
  policeBlue: '#2e7bff',
  traffic: '#c8cdd8',
  ped: '#e8e4d8',
  text: '#eef2ff',
  muted: '#8b93b3',
  panel: 'rgba(10, 14, 28, 0.78)',
  panelEdge: '#2e3650',
  danger: '#ff2e4d',
  cash: '#3dff8e',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

export const SAVE_KEY = 'neon-harbor.save.v1';
export const BEST_KEY = 'neon-harbor.best';
