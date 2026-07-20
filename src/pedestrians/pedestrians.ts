/**
 * Pedestrians — pure, no Babylon/DOM. Each walks back and forth across a road
 * at a crosswalk, pausing at the kerb. The player must yield to one in its path.
 * Heading convention matches driving.ts: forward = (sin h, cos h).
 */

import { LINE_OFFSET } from "../rules/roadGrid";

export interface Pedestrian {
  id: number;
  /** Crossing path endpoints (world XZ). */
  ax: number;
  az: number;
  bx: number;
  bz: number;
  /** Position along the path, 0..1. */
  t: number;
  /** Direction of travel along the path (+1 toward b, -1 toward a). */
  dir: number;
  /** Seconds left pausing at a kerb. */
  wait: number;
}

export const PED_SPEED = 1.4; // m/s
const PAUSE = 2.5;
const L = LINE_OFFSET; // crosswalks sit at the limit lines

/** Crossing paths + initial phase for each pedestrian (shared with the scene so
 *  crosswalk markings line up). [ax, az, bx, bz, t0]. */
export const CROSSINGS: ReadonlyArray<readonly [number, number, number, number, number]> = [
  [-7, L, 7, L, 0.15], // north crosswalk of the origin, crossing in X
  [-7, -L, 7, -L, 0.55], // south crosswalk of the origin
  [L, -7, L, 7, 0.8], // east crosswalk of the origin, crossing in Z
  [60 - L, -7, 60 - L, 7, 0.35], // west crosswalk of the (60,0) intersection
  [-7, 60 - L, 7, 60 - L, 0.65], // south crosswalk of the (0,60) intersection
];

/** Deterministic pedestrians crossing roads near the starting area. */
export function createPedestrians(): Pedestrian[] {
  return CROSSINGS.map(([ax, az, bx, bz, t], id) => ({ id, ax, az, bx, bz, t, dir: 1, wait: 0 }));
}

/** World position of a pedestrian. */
export function pedestrianPos(ped: Pedestrian): { x: number; z: number } {
  return { x: ped.ax + (ped.bx - ped.ax) * ped.t, z: ped.az + (ped.bz - ped.az) * ped.t };
}

/** Heading a pedestrian faces (its direction of travel). */
export function pedestrianHeading(ped: Pedestrian): number {
  const dx = (ped.bx - ped.ax) * ped.dir;
  const dz = (ped.bz - ped.az) * ped.dir;
  return Math.atan2(dx, dz);
}

export function stepPedestrians(peds: readonly Pedestrian[], dt: number): Pedestrian[] {
  return peds.map((ped) => {
    if (ped.wait > 0) return { ...ped, wait: Math.max(0, ped.wait - dt) };
    const len = Math.hypot(ped.bx - ped.ax, ped.bz - ped.az) || 1;
    let t = ped.t + ped.dir * (PED_SPEED / len) * dt;
    let dir = ped.dir;
    let wait = 0;
    if (t >= 1) {
      t = 1;
      dir = -1;
      wait = PAUSE;
    } else if (t <= 0) {
      t = 0;
      dir = 1;
      wait = PAUSE;
    }
    return { ...ped, t, dir, wait };
  });
}

/**
 * Whether a pedestrian is in the car's path ahead (in-lane, close), i.e. one the
 * driver must yield to.
 */
export function pedestrianHazard(
  px: number,
  pz: number,
  heading: number,
  peds: readonly Pedestrian[],
): boolean {
  const fx = Math.sin(heading);
  const fz = Math.cos(heading);
  return peds.some((ped) => {
    const { x, z } = pedestrianPos(ped);
    const dx = x - px;
    const dz = z - pz;
    const forward = dx * fx + dz * fz;
    if (forward <= 0 || forward > 9) return false;
    return Math.abs(dx * fz - dz * fx) < 2.6;
  });
}
