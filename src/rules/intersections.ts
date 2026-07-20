/**
 * Intersection geometry + queries — pure, no Babylon/DOM. Used to grade
 * intersection conduct: yielding to cross traffic and not blocking the box.
 */

import { ROAD_HALF, ROADS } from "./roadGrid";
import { angleDifference } from "./stopControls";
import type { TrafficCar } from "../traffic/traffic";

export interface Junction {
  cx: number;
  cz: number;
}

function nearestRoad(v: number): number {
  return ROADS.reduce((a, b) => (Math.abs(b - v) < Math.abs(a - v) ? b : a));
}

/** The intersection the point is inside (within the junction box), or null. */
export function intersectionAt(x: number, z: number): Junction | null {
  const cx = nearestRoad(x);
  const cz = nearestRoad(z);
  if (Math.abs(x - cx) <= ROAD_HALF && Math.abs(z - cz) <= ROAD_HALF) return { cx, cz };
  return null;
}

/**
 * Whether a moving traffic car occupies the junction on a path that crosses the
 * player's (perpendicular or oncoming) — i.e. traffic the player must yield to.
 */
export function crossTrafficInJunction(
  cars: readonly TrafficCar[],
  junction: Junction,
  playerHeading: number,
): boolean {
  return cars.some(
    (c) =>
      c.speed > 1 &&
      Math.abs(c.x - junction.cx) <= ROAD_HALF &&
      Math.abs(c.z - junction.cz) <= ROAD_HALF &&
      Math.abs(angleDifference(c.heading, playerHeading)) > 1,
  );
}
