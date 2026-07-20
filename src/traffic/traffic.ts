/**
 * Ambient AI traffic — pure, no Babylon/DOM. Cars cruise along grid lanes,
 * slow for whatever is ahead of them (other cars, the player, cross traffic at
 * intersections), and wrap around at the world edge so the roads stay busy.
 *
 * Collision avoidance is a simple forward-cone gap: a car yields to same-lane
 * cars ahead always, to cross traffic only if that car has priority (lower id,
 * which breaks intersection ties and prevents deadlock), and always to the
 * player. Heading convention matches driving.ts: forward = (sin h, cos h).
 */

import { LANE, LINE_OFFSET, ROAD_HALF, ROADS, wrapWorld } from "../rules/roadGrid";
import { angleDifference } from "../rules/stopControls";

export interface TrafficCar {
  id: number;
  x: number;
  z: number;
  heading: number;
  speed: number;
  /** Key of the last intersection whose stop this car has cleared. */
  clearedKey?: string | null;
  /** Seconds waited at the current stop line. */
  waited?: number;
}

export interface Pose {
  x: number;
  z: number;
  heading: number;
}

export const TRAFFIC_SPEED = 9; // m/s cruise (~20 mph)
const ACCEL = 5;
const DECEL = 14;
const CONE_HALF = 3.2; // lateral tolerance for "ahead of me"
const SAFE_GAP = 8; // start slowing within this
const STOP_GAP = 3.5; // fully stopped by this
const LINE_DECEL = 13; // start braking for a stop line within this
const STOP_WAIT = 0.7; // seconds to sit at a stop line before proceeding

/** Deterministic starting fleet spread across several lanes and directions. */
export function createTraffic(): TrafficCar[] {
  const specs: Array<Omit<TrafficCar, "id" | "speed">> = [
    { x: LANE, z: -70, heading: 0 }, // northbound, x=0 road
    { x: LANE, z: 12, heading: 0 },
    { x: -LANE, z: 90, heading: Math.PI }, // southbound, x=0 road
    { x: 60 + LANE, z: -40, heading: 0 }, // northbound, x=60 road
    { x: -60 - LANE, z: 50, heading: Math.PI }, // southbound, x=-60 road
    { x: 120 + LANE, z: 30, heading: 0 }, // northbound, x=120 road
    { x: -120 - LANE, z: -80, heading: Math.PI }, // southbound, x=-120 road
    { x: 180 + LANE, z: -150, heading: 0 }, // northbound, x=180 road
    { x: -70, z: -LANE, heading: Math.PI / 2 }, // eastbound, z=0 road
    { x: 40, z: -LANE, heading: Math.PI / 2 },
    { x: 70, z: LANE, heading: -Math.PI / 2 }, // westbound, z=0 road
    { x: -140, z: 60 - LANE, heading: Math.PI / 2 }, // eastbound, z=60 road
    { x: 150, z: -120 + LANE, heading: -Math.PI / 2 }, // westbound, z=-120 road
    { x: -30, z: 120 - LANE, heading: Math.PI / 2 }, // eastbound, z=120 road
  ];
  return specs.map((s, id) => ({ id, speed: TRAFFIC_SPEED, clearedKey: null, waited: 0, ...s }));
}

const nearestRoad = (v: number): number =>
  ROADS.reduce((a, b) => (Math.abs(b - v) < Math.abs(a - v) ? b : a));

interface NextStop {
  key: string;
  distance: number;
  cx: number;
  cz: number;
}

/** The next stop line ahead of the car on its lane, or null (none in range). */
function nextStopAhead(car: TrafficCar): NextStop | null {
  const alongZ = Math.abs(Math.cos(car.heading)) > 0.5; // N/S travel
  let best: NextStop | null = null;
  if (alongZ) {
    const rx = nearestRoad(car.x);
    const dir = Math.cos(car.heading) > 0 ? 1 : -1;
    for (const cz of ROADS) {
      const dist = (cz - dir * LINE_OFFSET - car.z) * dir;
      if (dist > 0 && (best === null || dist < best.distance)) {
        best = { key: `${rx}:${cz}`, distance: dist, cx: rx, cz };
      }
    }
  } else {
    const rz = nearestRoad(car.z);
    const dir = Math.sin(car.heading) > 0 ? 1 : -1;
    for (const cx of ROADS) {
      const dist = (cx - dir * LINE_OFFSET - car.x) * dir;
      if (dist > 0 && (best === null || dist < best.distance)) {
        best = { key: `${cx}:${rz}`, distance: dist, cx, cz: rz };
      }
    }
  }
  return best;
}

/** Whether another car currently occupies the junction box (right-of-way). */
function occupied(cars: readonly TrafficCar[], cx: number, cz: number, selfId: number): boolean {
  return cars.some(
    (c) => c.id !== selfId && Math.abs(c.x - cx) <= ROAD_HALF && Math.abs(c.z - cz) <= ROAD_HALF,
  );
}

function speedFromGap(gap: number): number {
  if (gap < STOP_GAP) return 0;
  if (gap < SAFE_GAP) return TRAFFIC_SPEED * ((gap - STOP_GAP) / (SAFE_GAP - STOP_GAP));
  return TRAFFIC_SPEED;
}

function approach(current: number, target: number, up: number, down: number): number {
  return target > current ? Math.min(current + up, target) : Math.max(current - down, target);
}

/** Nearest forward-cone distance to something the car must yield to. */
function gapAhead(car: TrafficCar, cars: readonly TrafficCar[], player: Pose | null): number {
  const fx = Math.sin(car.heading);
  const fz = Math.cos(car.heading);
  let gap = Infinity;
  const consider = (bx: number, bz: number): void => {
    const dx = bx - car.x;
    const dz = bz - car.z;
    const forward = dx * fx + dz * fz;
    if (forward <= 0) return;
    if (Math.abs(dx * fz - dz * fx) > CONE_HALF) return;
    if (forward < gap) gap = forward;
  };
  for (const other of cars) {
    if (other.id === car.id) continue;
    const sameDir = Math.abs(angleDifference(car.heading, other.heading)) < 0.5;
    // Yield to same-lane leaders always; to cross traffic only if it has priority.
    if (sameDir || other.id < car.id) consider(other.x, other.z);
  }
  if (player) consider(player.x, player.z); // always yield to the player
  return gap;
}

/** Advance the whole fleet one step. Pure: returns new car states. */
export function stepTraffic(
  cars: readonly TrafficCar[],
  dt: number,
  player: Pose | null = null,
): TrafficCar[] {
  return cars.map((car) => {
    // Yield to whatever's ahead (leaders, cross traffic, the player).
    let target = speedFromGap(gapAhead(car, cars, player));

    // Obey stop signs: brake for the next uncleared line, wait, then proceed
    // once the intersection is clear (right-of-way for whoever's already in it).
    let clearedKey = car.clearedKey ?? null;
    let waited = car.waited ?? 0;
    const stop = nextStopAhead(car);
    if (stop && stop.key !== clearedKey) {
      const d = stop.distance;
      const stopTarget = d < 0.6 ? 0 : d < LINE_DECEL ? TRAFFIC_SPEED * (d / LINE_DECEL) : TRAFFIC_SPEED;
      target = Math.min(target, stopTarget);
      if (d < 1.5 && car.speed < 0.5) {
        waited += dt;
        if (waited >= STOP_WAIT && !occupied(cars, stop.cx, stop.cz, car.id)) {
          clearedKey = stop.key;
          waited = 0;
        }
      }
    } else {
      waited = 0;
    }

    const speed = approach(car.speed, target, ACCEL * dt, DECEL * dt);
    const x = wrapWorld(car.x + Math.sin(car.heading) * speed * dt);
    const z = wrapWorld(car.z + Math.cos(car.heading) * speed * dt);
    return { ...car, speed, x, z, clearedKey, waited };
  });
}

/**
 * Centre-to-centre distance to the nearest traffic car directly ahead of the
 * player in the same lane and direction, or null if the road ahead is clear.
 */
export function leadGapFor(player: Pose, cars: readonly TrafficCar[]): number | null {
  const fx = Math.sin(player.heading);
  const fz = Math.cos(player.heading);
  let best: number | null = null;
  for (const car of cars) {
    const dx = car.x - player.x;
    const dz = car.z - player.z;
    const forward = dx * fx + dz * fz;
    if (forward <= 0) continue;
    if (Math.abs(dx * fz - dz * fx) > 2.6) continue; // same lane
    if (Math.abs(angleDifference(player.heading, car.heading)) > 0.6) continue; // same direction
    if (best === null || forward < best) best = forward;
  }
  return best;
}
