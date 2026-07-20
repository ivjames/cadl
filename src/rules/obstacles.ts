/**
 * Static collision — pure, no Babylon/DOM. Obstacles are the block buildings,
 * generated from the same road grid the scene builds from, plus the world edge.
 * `resolveMovement` does axis-separated blocking so the car slides along walls
 * instead of sticking.
 */

import { ROADS, WORLD } from "./roadGrid";

/** Building footprint: an axis-aligned rectangle centred at (cx, cz). */
export interface Rect {
  cx: number;
  cz: number;
  halfW: number; // x half-extent
  halfD: number; // z half-extent
}

export const BUILDING_W = 22;
export const BUILDING_D = 20;
/** Forgiving collision radius for the car (it's ~1.8 × 4.2 m). */
export const CAR_RADIUS = 1.2;

/** Block-centre midpoints between adjacent roads on each axis. */
export function blockCentres(): number[] {
  return ROADS.slice(0, -1).map((v, i) => (v + ROADS[i + 1]!) / 2);
}

export function buildingRects(): Rect[] {
  const mids = blockCentres();
  const rects: Rect[] = [];
  for (const cx of mids) for (const cz of mids) {
    rects.push({ cx, cz, halfW: BUILDING_W / 2, halfD: BUILDING_D / 2 });
  }
  return rects;
}

/** Whether the car centre at (x, z) overlaps any obstacle (inflated by radius). */
export function isBlocked(x: number, z: number, rects: readonly Rect[], radius = CAR_RADIUS): boolean {
  return rects.some(
    (r) => Math.abs(x - r.cx) <= r.halfW + radius && Math.abs(z - r.cz) <= r.halfD + radius,
  );
}

export interface Move {
  x: number;
  z: number;
  hit: boolean;
}

/**
 * Move from (px, pz) toward (nx, nz), blocked by obstacles and the world edge.
 * X and Z are resolved independently so the car can slide along a wall.
 */
export function resolveMovement(
  px: number,
  pz: number,
  nx: number,
  nz: number,
  rects: readonly Rect[],
  radius = CAR_RADIUS,
): Move {
  let x = px;
  let z = pz;
  let hit = false;

  if (!isBlocked(nx, pz, rects, radius)) x = nx;
  else hit = true;
  if (!isBlocked(x, nz, rects, radius)) z = nz;
  else hit = true;

  const limit = WORLD / 2 - 2;
  const clampedX = Math.max(-limit, Math.min(limit, x));
  const clampedZ = Math.max(-limit, Math.min(limit, z));
  if (clampedX !== x || clampedZ !== z) hit = true;

  return { x: clampedX, z: clampedZ, hit };
}
