/**
 * Speed-limit zones — pure data + lookup, no Babylon/DOM.
 *
 * The world default is a 25 mph residential limit; rectangular zones override
 * it (e.g. a 20 mph school zone, per the guide's 2026 school-zone note). Lessons
 * and the HUD read `speedLimitAt` to know the posted limit at the car's
 * position, and `isOverLimit` to flag violations.
 */

export interface SpeedZone {
  name: string;
  limitMph: number;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/** Posted limit when the car is not inside any specific zone. */
export const DEFAULT_LIMIT_MPH = 25;

/** A little slack before "over the limit" trips, so the HUD isn't twitchy. */
export const OVER_LIMIT_TOLERANCE_MPH = 2;

/**
 * Rectangular zones in world XZ. First match wins. The school zone covers the
 * east arm of the E–W road (z ≈ ±half-road), so a car driving east through it
 * actually enters the 20 mph zone.
 */
export const SPEED_ZONES: readonly SpeedZone[] = [
  { name: "School Zone", limitMph: 20, minX: 9, maxX: 42, minZ: -8, maxZ: 8 },
];

export interface SpeedLimit {
  limitMph: number;
  /** Zone name, or null when on the default residential limit. */
  zone: string | null;
}

/** The posted speed limit at a world position. */
export function speedLimitAt(x: number, z: number): SpeedLimit {
  for (const zone of SPEED_ZONES) {
    if (x >= zone.minX && x <= zone.maxX && z >= zone.minZ && z <= zone.maxZ) {
      return { limitMph: zone.limitMph, zone: zone.name };
    }
  }
  return { limitMph: DEFAULT_LIMIT_MPH, zone: null };
}

/** Whether a speed exceeds the limit by more than the tolerance. */
export function isOverLimit(
  speedMph: number,
  limitMph: number,
  tolerance = OVER_LIMIT_TOLERANCE_MPH,
): boolean {
  return speedMph > limitMph + tolerance;
}
