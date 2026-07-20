/**
 * Stop controls at the intersection — pure geometry, no Babylon/DOM.
 *
 * One stop sign / limit line guards each of the four approaches. `stopSignAhead`
 * tells the HUD (and, later, the scoring layer) whether the car is approaching a
 * stop and how far the limit line is. Lane centres assume right-hand driving.
 *
 * Heading convention matches driving.ts: forward = (sin h, cos h).
 */

export interface StopControl {
  /** Approach label: S/N/E/W arm of the intersection. */
  name: string;
  /** Limit-line point at the lane centre (world XZ). */
  x: number;
  z: number;
  /** Heading a car has when driving toward this line. */
  approachHeading: number;
}

/** ~half road width + a little; limit lines sit just outside the junction box. */
const LINE_OFFSET = 6.1;
const LANE = 2.75; // right-lane centre offset from the road centreline

export const STOP_CONTROLS: readonly StopControl[] = [
  { name: "S", x: LANE, z: -LINE_OFFSET, approachHeading: 0 }, // northbound
  { name: "N", x: -LANE, z: LINE_OFFSET, approachHeading: Math.PI }, // southbound
  { name: "W", x: -LINE_OFFSET, z: -LANE, approachHeading: Math.PI / 2 }, // eastbound
  { name: "E", x: LINE_OFFSET, z: LANE, approachHeading: -Math.PI / 2 }, // westbound
];

/** How far ahead a stop control is announced. */
export const STOP_LOOKAHEAD_M = 30;
/** Heading must be within this of the approach direction to count. */
export const APPROACH_ANGLE_TOLERANCE = Math.PI / 4;

/** Smallest signed difference between two angles, in [-PI, PI]. */
export function angleDifference(a: number, b: number): number {
  let d = (a - b) % (2 * Math.PI);
  if (d > Math.PI) d -= 2 * Math.PI;
  if (d < -Math.PI) d += 2 * Math.PI;
  return d;
}

export interface StopAhead {
  name: string;
  /** Distance to the limit line (metres). */
  distance: number;
}

/**
 * The nearest stop control the car is approaching (ahead of it, within range,
 * roughly aligned with its heading), or null if none.
 */
export function stopSignAhead(
  x: number,
  z: number,
  heading: number,
  maxDistance = STOP_LOOKAHEAD_M,
): StopAhead | null {
  const fx = Math.sin(heading);
  const fz = Math.cos(heading);
  let best: StopAhead | null = null;

  for (const control of STOP_CONTROLS) {
    const dx = control.x - x;
    const dz = control.z - z;
    const distance = Math.hypot(dx, dz);
    if (distance > maxDistance) continue;
    if (dx * fx + dz * fz <= 0) continue; // behind the car
    if (Math.abs(angleDifference(heading, control.approachHeading)) > APPROACH_ANGLE_TOLERANCE) {
      continue; // not aligned with this approach
    }
    if (!best || distance < best.distance) best = { name: control.name, distance };
  }
  return best;
}
