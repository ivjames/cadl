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

import { LANE, WORLD } from "../rules/roadGrid";
import { angleDifference } from "../rules/stopControls";

export interface TrafficCar {
  id: number;
  x: number;
  z: number;
  heading: number;
  speed: number;
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

const half = WORLD / 2;

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
  return specs.map((s, id) => ({ id, speed: TRAFFIC_SPEED, ...s }));
}

const wrap = (v: number): number => (v > half ? v - WORLD : v < -half ? v + WORLD : v);

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
    const gap = gapAhead(car, cars, player);
    let target = TRAFFIC_SPEED;
    if (gap < STOP_GAP) target = 0;
    else if (gap < SAFE_GAP) target = TRAFFIC_SPEED * ((gap - STOP_GAP) / (SAFE_GAP - STOP_GAP));

    const speed = approach(car.speed, target, ACCEL * dt, DECEL * dt);
    const x = wrap(car.x + Math.sin(car.heading) * speed * dt);
    const z = wrap(car.z + Math.cos(car.heading) * speed * dt);
    return { ...car, speed, x, z };
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
