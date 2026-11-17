// SOLMAR — every tuning number, colour and car model in one place. The world is
// a fixed 3600 x 2600 pixel city; the camera follows the player through it.

/** The simulation's fixed step, in seconds: 60 updates a second whatever the display's rate. */
export const STEP = 1 / 60;

export const WORLD = { width: 3600, height: 2600 };

/** Roads run on a grid: vertical roads at these x centres, horizontal at these y centres. */
export const ROAD_WIDTH = 110;
export const VERTICAL_ROADS = [300, 700, 1100, 1500, 1900, 2300, 2700, 3100];
export const HORIZONTAL_ROADS = [250, 650, 1050, 1450, 1850];
/** South of this y the ground is sand, then water. */
export const BEACH_Y = 2180;
export const WATER_Y = 2400;

/** Sun-soaked palette: warm sand, teal water, pastel rooftops, long soft shadows. */
export const PALETTE = {
  grass: '#79c25f',
  grassDark: '#73bf59',
  sand: '#f2d8a0',
  water: '#2fa8c9',
  waterDeep: '#1e87ad',
  road: '#3d4149',
  roadEdge: '#2f333b',
  sidewalk: '#b9b3a4',
  lane: '#ffd23f',
  crosswalk: '#e8e6df',
  shadow: 'rgba(60, 30, 0, 0.25)',
  buildingRoofs: ['#e8b4a0', '#a8d8c8', '#f2e3b3', '#c9b8e0', '#f0a8a8', '#a8c8e8', '#d8e8a8', '#e8c8a0'],
  buildingWalls: ['#d8a894', '#98c8b8', '#e0d0a0', '#b8a8d0', '#e09898', '#98b8d8', '#c8d898', '#d8b890'],
};

export const PLAYER = {
  radius: 13,
  walkSpeed: 165,
  sprintSpeed: 265,
  health: 100,
  fireInterval: 0.16,
  bulletRange: 460,
  bulletDamage: 34,
  enterCarRange: 70,
  interactRange: 64,
};

/** Car models: length/width in pixels, top speed px/s, acceleration, steering grip. */
export const CAR_MODELS = {
  sedan:   { length: 64, width: 30, topSpeed: 430, accel: 300, grip: 3.2, colors: ['#c0392b', '#2e86c1', '#e8e8e8', '#7d3c98', '#b7950b'] },
  taxi:    { length: 64, width: 30, topSpeed: 450, accel: 320, grip: 3.4, colors: ['#f1c40f'] },
  pickup:  { length: 70, width: 32, topSpeed: 400, accel: 260, grip: 2.8, colors: ['#5d6d7e', '#935116', '#1e8449'] },
  sports:  { length: 62, width: 30, topSpeed: 620, accel: 460, grip: 4.4, colors: ['#e74c3c', '#f39c12', '#8e44ad', '#00bcd4'] },
  van:     { length: 74, width: 32, topSpeed: 360, accel: 220, grip: 2.5, colors: ['#aeb6bf', '#6e7b8b', '#d5dbdb'] },
  cruiser: { length: 66, width: 30, topSpeed: 540, accel: 420, grip: 4.0, colors: ['#1a1a2e'] },
};

export const TRAFFIC = {
  count: 26,
  cruiseSpeed: 190,
  turnChance: 0.28,
  stopDistance: 78,
};

export const PEDS = { count: 34, walkSpeed: 55, fleeSpeed: 150 };

export const POLICE = {
  maxStars: 5,
  /** Seconds unseen before the heat starts to cool. */
  unseenGrace: 8,
  /** Seconds between losing one star while unseen. */
  coolDownPerStar: 6,
  /** Cops on foot per star, cruisers per star. */
  footPerStar: 1,
  cruiserPerStar: 1,
  bustedHoldSeconds: 2.5,
  bustedRange: 46,
  resprayCost: 150,
  wastedFine: 200,
  bustedFine: 150,
};

export const ENEMY = { health: 100, fireInterval: 0.95, bulletDamage: 9, range: 380, speed: 130 };

export const STASH_REWARD = 300;
export const SAVE_KEY = 'solmar-save-v1';

/** Named places the story and the HUD refer to. */
export const LANDMARKS = {
  hideout:   { x: 520,  y: 460,  name: 'Dice\u2019s Hideout' },
  bank:      { x: 1500, y: 880,  name: 'Solmar National Bank' },
  docks:     { x: 2730, y: 2260, name: 'Sunset Docks' },
  pier:      { x: 3050, y: 2320, name: 'Solmar Pier' },
  garage:    { x: 900,  y: 1620, name: 'Tiny\u2019s Garage' },
  diner:     { x: 2280, y: 480,  name: 'Mama Rosa\u2019s Diner' },
  hospital:  { x: 1120, y: 460,  name: 'Solmar General' },
  policeHq:  { x: 1900, y: 460,  name: 'SBPD Headquarters' },
  autoSpa:   { x: 2700, y: 1450, name: 'Sunset Auto Spa' },
  beach:     { x: 1500, y: 2280, name: 'Palma Beach' },
};

/** City districts, for the zone label on the HUD. */
export const DISTRICTS = [
  { x0: 0,    y0: 0,    x1: 1200, y1: 900,  name: 'OLD TOWN' },
  { x0: 1200, y0: 0,    x1: 2400, y1: 900,  name: 'DOWNTOWN' },
  { x0: 2400, y0: 0,    x1: 3600, y1: 900,  name: 'MARINA HEIGHTS' },
  { x0: 0,    y0: 900,  x1: 1200, y1: 1900, name: 'WESTSIDE' },
  { x0: 1200, y0: 900,  x1: 2400, y1: 1900, name: 'MIDTOWN' },
  { x0: 2400, y0: 900,  x1: 3600, y1: 1900, name: 'EAST HARBOUR' },
  { x0: 0,    y0: 1900, x1: 3600, y1: 2600, name: 'PALMA BEACH' },
];
