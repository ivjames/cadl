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
/** Max sideways offset from the lane centre before the control is ignored (m). */
export const STOP_LATERAL_TOLERANCE = 4;

/** Smallest signed difference between two angles, in [-PI, PI]. */
export function angleDifference(a: number, b: number): number {
  let d = (a - b) % (2 * Math.PI);
  if (d > Math.PI) d -= 2 * Math.PI;
  if (d < -Math.PI) d += 2 * Math.PI;
  return d;
}

export interface StopAhead {
  name: string;
  /** Forward distance to the limit line along the car's heading (metres). */
  distance: number;
}

/**
 * The nearest stop control the car is approaching, or null if none. A control
 * counts only when it is ahead of the car (positive forward projection within
 * range), close to the car's lane (small lateral offset — so a car well off to
 * the side of the road isn't warned), and roughly aligned with the approach
 * heading.
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
    // Split the offset into along-heading (forward) and perpendicular (lateral).
    const forward = dx * fx + dz * fz;
    if (forward <= 0 || forward > maxDistance) continue; // behind, or too far ahead
    const lateral = Math.abs(dx * fz - dz * fx);
    if (lateral > STOP_LATERAL_TOLERANCE) continue; // off in another lane / off-road
    if (Math.abs(angleDifference(heading, control.approachHeading)) > APPROACH_ANGLE_TOLERANCE) {
      continue; // not aligned with this approach
    }
    if (!best || forward < best.distance) best = { name: control.name, distance: forward };
  }
  return best;
}
