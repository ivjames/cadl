/**
 * Road-grid layout — pure geometry shared by the scene builder and the stop
 * controls, so signs, painted lines, and stop detection all come from one
 * source and can never drift apart.
 *
 * Roads run along each value in {@link ROADS} on both axes; every (x, z) pair is
 * an intersection. Heading convention matches driving.ts: forward = (sin h, cos h).
 */

export const ROAD_HALF = 5.5;
/** Right-hand lane centre offset from a road's centreline. */
export const LANE = ROAD_HALF / 2;
/** Limit line / stop distance just outside the junction box. */
export const LINE_OFFSET = ROAD_HALF + 0.6;
/** Ground size (square, centred on the origin). */
export const WORLD = 620;
/** Road centrelines on each axis. Their cross products are the intersections. */
export const ROADS: readonly number[] = [-240, -180, -120, -60, 0, 60, 120, 180, 240];

export interface Intersection {
  cx: number;
  cz: number;
}

/** One approach into an intersection: the limit-line point + approach heading. */
export interface Approach {
  name: string;
  x: number;
  z: number;
  heading: number;
}

/** Wrap a world coordinate so driving off one edge reappears on the opposite
 *  side — the world is toroidal. Roads span the full extent, so a lane lines up
 *  with itself across the wrap. */
export function wrapWorld(v: number): number {
  const half = WORLD / 2;
  if (v > half) return v - WORLD;
  if (v < -half) return v + WORLD;
  return v;
}

export function intersections(): Intersection[] {
  const out: Intersection[] = [];
  for (const cx of ROADS) for (const cz of ROADS) out.push({ cx, cz });
  return out;
}

/** The four right-hand-lane approaches into the intersection at (cx, cz). */
export function approachesAt(cx: number, cz: number): Approach[] {
  return [
    { name: `${cx}:${cz}:S`, x: cx + LANE, z: cz - LINE_OFFSET, heading: 0 }, // northbound
    { name: `${cx}:${cz}:N`, x: cx - LANE, z: cz + LINE_OFFSET, heading: Math.PI }, // southbound
    { name: `${cx}:${cz}:W`, x: cx - LINE_OFFSET, z: cz - LANE, heading: Math.PI / 2 }, // eastbound
    { name: `${cx}:${cz}:E`, x: cx + LINE_OFFSET, z: cz + LANE, heading: -Math.PI / 2 }, // westbound
  ];
}

export function allApproaches(): Approach[] {
  return intersections().flatMap(({ cx, cz }) => approachesAt(cx, cz));
}
