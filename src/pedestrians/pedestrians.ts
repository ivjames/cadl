/**
 * Pedestrians — pure, no Babylon/DOM. Each walks back and forth across a road
 * at a crosswalk, pausing at the kerb. The player must yield to one in its path.
 * Heading convention matches driving.ts: forward = (sin h, cos h).
 */

import { LINE_OFFSET, ROAD_HALF } from "../rules/roadGrid";

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
  /** True at a marked (zebra-striped) crosswalk, false at an unmarked one. */
  striped: boolean;
}

/** A pedestrian crossing: path endpoints, initial phase, and crosswalk type. */
export interface CrossingSpec {
  ax: number;
  az: number;
  bx: number;
  bz: number;
  /** Initial position along the path, 0..1. */
  t: number;
  /** Marked (zebra) crosswalk vs unmarked — drivers yield for different durations. */
  striped: boolean;
}

export const PED_SPEED = 1.4; // m/s
const PAUSE = 2.5;
const L = LINE_OFFSET; // crosswalks sit at the limit lines
/** How far ahead a car reacts to a crosswalk (m). */
export const PED_APPROACH_M = 10;

/** Crossing paths for each pedestrian (shared with the scene so crosswalk
 *  markings line up). Striped crossings get painted zebra stripes; unmarked
 *  ones do not, and the two carry different yield rules. */
export const CROSSINGS: readonly CrossingSpec[] = [
  // Marked (zebra) crosswalks — yield until the pedestrian is entirely across.
  { ax: -7, az: L, bx: 7, bz: L, t: 0.15, striped: true }, // north crosswalk of the origin (X)
  { ax: -7, az: -L, bx: 7, bz: -L, t: 0.55, striped: true }, // south crosswalk of the origin
  { ax: L, az: -7, bx: L, bz: 7, t: 0.8, striped: true }, // east crosswalk of the origin (Z)
  { ax: 60 - L, az: -7, bx: 60 - L, bz: 7, t: 0.35, striped: true }, // west of (60,0)
  { ax: -7, az: 60 - L, bx: 7, bz: 60 - L, t: 0.65, striped: true }, // south of (0,60)
  // Unmarked crosswalks — yield only until the pedestrian passes the road centre.
  { ax: -7, az: -60 + L, bx: 7, bz: -60 + L, t: 0.3, striped: false }, // north of (0,-60) (X)
  { ax: -60 + L, az: -7, bx: -60 + L, bz: 7, t: 0.5, striped: false }, // east of (-60,0) (Z)
  { ax: -7, az: 60 + L, bx: 7, bz: 60 + L, t: 0.7, striped: false }, // north of (0,60) (X)
];

/** Deterministic pedestrians crossing roads near the starting area. */
export function createPedestrians(): Pedestrian[] {
  return CROSSINGS.map((c, id) => ({
    id,
    ax: c.ax,
    az: c.az,
    bx: c.bx,
    bz: c.bz,
    t: c.t,
    dir: 1,
    wait: 0,
    striped: c.striped,
  }));
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
 * Whether a pedestrian in a crosswalk ahead is one the driver must still yield
 * to. The duty differs by crosswalk type (California rules):
 *
 *  - Marked (striped) crosswalk: yield until the pedestrian is *entirely out*
 *    of the crosswalk — i.e. anywhere on the roadway still counts.
 *  - Unmarked crosswalk: yield only until the pedestrian passes the centre of
 *    the road (mid-block); once they cross to the far half, the car may go.
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
    // The crosswalk must be ahead of the car, within reaction distance.
    const forward = (x - px) * fx + (z - pz) * fz;
    if (forward <= 0 || forward > PED_APPROACH_M) return false;

    // Coordinates measured across the road (the pedestrian's direction of travel).
    const axisIsX = Math.abs(ped.bz - ped.az) < 0.01; // pedestrian walks along X
    const carAcross = axisIsX ? px : pz;
    const pedAcross = axisIsX ? x : z;
    const lo = axisIsX ? Math.min(ped.ax, ped.bx) : Math.min(ped.az, ped.bz);
    const hi = axisIsX ? Math.max(ped.ax, ped.bx) : Math.max(ped.az, ped.bz);
    if (carAcross < lo - 1 || carAcross > hi + 1) return false; // car isn't on this road

    const centre = (lo + hi) / 2;
    const pedFromCentre = pedAcross - centre;
    if (Math.abs(pedFromCentre) > ROAD_HALF + 0.5) return false; // pedestrian off the road

    // Marked: still on the roadway → keep yielding until they are entirely out.
    if (ped.striped) return true;
    // Unmarked: only while the pedestrian is still on the car's half of the road.
    return Math.sign(pedFromCentre) === Math.sign(carAcross - centre);
  });
}
