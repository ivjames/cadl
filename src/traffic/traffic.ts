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
import { CAR_RADIUS } from "../rules/obstacles";

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
  /** Active turn through a junction: the axis heading to pivot toward. */
  turn?: TurnState | null;
  /** Turn-signal state: -1 = left, 1 = right, 0/undefined = off. */
  blinker?: -1 | 0 | 1;
  /** Key of the junction this car last turned at (so it turns once per pass). */
  turnedKey?: string | null;
}

/** A turn in progress: pivot the heading toward `toH` (an exact axis heading). */
export interface TurnState {
  toH: number;
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
const TURN_YAW_RATE = 1.7; // rad/s pivot rate through a turn
const TURN_SPEED = 4.5; // m/s while turning (slower than cruise)
const TURN_ENTRY_RADIUS = 1.6; // distance from junction centre to begin a turn
const HALF_PI = Math.PI / 2;

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

/** Wrap a heading into (-π, π]. */
function wrapAngle(a: number): number {
  let h = a % (Math.PI * 2);
  if (h > Math.PI) h -= Math.PI * 2;
  if (h <= -Math.PI) h += Math.PI * 2;
  return h;
}

/**
 * Deterministic turn choice at a junction (no RNG, so the world is repeatable):
 * -1 = left, 1 = right, 0 = straight. Most cars go straight; a fifth turn each
 * way. Hashed from the car id + junction key so a given car turns the same way
 * at a given junction every pass.
 */
export function turnDecisionFor(id: number, key: string): -1 | 0 | 1 {
  const s = `${id}#${key}`;
  let h = 2166136261;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const m = (h >>> 0) % 10;
  if (m < 2) return -1;
  if (m < 4) return 1;
  return 0;
}

/**
 * Snap a just-turned car onto the correct right-hand lane of its new road.
 * For N/S travel the lane is set by X; for E/W travel by Z. `heading` is the
 * exact post-turn axis heading.
 */
function snapToLane(x: number, z: number, heading: number): { x: number; z: number } {
  if (Math.abs(Math.cos(heading)) > 0.5) {
    // Travelling along Z (north/south): right lane offsets X by +LANE·cos h.
    return { x: nearestRoad(x) + LANE * Math.round(Math.cos(heading)), z };
  }
  // Travelling along X (east/west): right lane offsets Z by -LANE·sin h.
  return { x, z: nearestRoad(z) - LANE * Math.round(Math.sin(heading)) };
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
    // Mid-turn: pivot the heading toward the target axis, creeping through the
    // box. Normal lane/stop/gap logic (which assumes axis alignment) is paused
    // until the turn completes and the car snaps back onto a lane.
    if (car.turn) {
      const remaining = wrapAngle(car.turn.toH - car.heading);
      const stepYaw = Math.sign(remaining) * Math.min(Math.abs(remaining), TURN_YAW_RATE * dt);
      let heading = car.heading + stepYaw;
      const speed = approach(car.speed, TURN_SPEED, ACCEL * dt, DECEL * dt);
      let x = wrapWorld(car.x + Math.sin(heading) * speed * dt);
      let z = wrapWorld(car.z + Math.cos(heading) * speed * dt);
      if (Math.abs(wrapAngle(car.turn.toH - heading)) < 0.02) {
        // Turn complete: lock the exact heading and drop onto the new lane.
        heading = wrapAngle(car.turn.toH);
        ({ x, z } = snapToLane(x, z, heading));
        return { ...car, heading, speed, x, z, turn: null, blinker: 0 };
      }
      return { ...car, heading, speed, x, z };
    }

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

    // Begin a turn on reaching a junction centre (once per junction, while
    // moving). The signal lights for the chosen side and the pivot takes over
    // next frame via the branch above.
    const jcx = nearestRoad(x);
    const jcz = nearestRoad(z);
    const key = `${jcx}:${jcz}`;
    // Distance along the direction of travel to the junction centre (the lateral
    // lane offset is ignored — the car reaches the box when its along-axis
    // position lines up with the centre).
    const alongDist = Math.abs(Math.cos(car.heading)) > 0.5 ? Math.abs(z - jcz) : Math.abs(x - jcx);
    if (speed > 1 && car.turnedKey !== key && alongDist < TURN_ENTRY_RADIUS) {
      const side = turnDecisionFor(car.id, key);
      if (side !== 0) {
        // Left turn decreases heading; right increases it (driving.ts convention).
        const toH = wrapAngle(car.heading + side * HALF_PI);
        return { ...car, speed, x, z, clearedKey, waited, turn: { toH }, blinker: side, turnedKey: key };
      }
      return { ...car, speed, x, z, clearedKey, waited, turnedKey: key };
    }
    return { ...car, speed, x, z, clearedKey, waited };
  });
}

/** Half-extents of a traffic car's footprint (across × along), matching the
 *  collision rects the player is blocked by. */
export const CAR_HALF_W = 1.3;
export const CAR_HALF_D = 2.6;

/**
 * Whether the player (a circle of {@link CAR_RADIUS}) is in contact with any
 * traffic car's footprint — i.e. a fender-bender. `tol` adds a little slack so
 * the touch registers right at the collision boundary the physics stops at.
 */
export function hitsCar(
  px: number,
  pz: number,
  cars: readonly TrafficCar[],
  tol = 0.2,
): boolean {
  return cars.some((c) => {
    const dx = Math.max(Math.abs(px - c.x) - CAR_HALF_W, 0);
    const dz = Math.max(Math.abs(pz - c.z) - CAR_HALF_D, 0);
    return Math.hypot(dx, dz) <= CAR_RADIUS + tol;
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
