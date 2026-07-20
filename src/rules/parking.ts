/**
 * Parking bays — pure, no Babylon/DOM. A bay is an axis-aligned rectangle with
 * an orientation; a car is "parked" when it sits fully inside, aligned with the
 * bay's axis (facing either way, so backing in counts), and at rest.
 *
 * Heading convention matches driving.ts: forward = (sin h, cos h). The bay's
 * `axis` is the heading a car aligns to when parked (0 = pointing +Z).
 */

/** A marked parking space the driver must come to rest inside. */
export interface ParkingBay {
  /** Bay centre (world XZ). */
  cx: number;
  cz: number;
  /** Half-width across the bay's axis (m). */
  halfW: number;
  /** Half-length along the bay's axis (m). */
  halfD: number;
  /** Heading a parked car aligns to (radians). */
  axis: number;
}

/** Signed offsets of a point from the bay centre in bay-local (across, along). */
function localOffset(bay: ParkingBay, x: number, z: number): { across: number; along: number } {
  const ax = Math.sin(bay.axis);
  const az = Math.cos(bay.axis);
  const dx = x - bay.cx;
  const dz = z - bay.cz;
  // `along` projects onto the axis; `across` onto the perpendicular.
  return { across: dx * az - dz * ax, along: dx * ax + dz * az };
}

/** Smallest signed angle between two headings, in (-π, π]. */
function angleDelta(a: number, b: number): number {
  let d = (a - b) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d <= -Math.PI) d += Math.PI * 2;
  return d;
}

/** How far the heading is from the bay axis, treating both directions as aligned. */
export function alignmentError(bay: ParkingBay, heading: number): number {
  const d = Math.abs(angleDelta(heading, bay.axis));
  return Math.min(d, Math.PI - d); // π away (facing out) is just as aligned
}

/** Tolerances for judging a park. */
export const PARK = {
  /** The car centre must sit within (half − margin) of the bay in both axes. */
  marginW: 0.4,
  marginD: 0.6,
  /** Max heading error from the bay axis (radians ≈ 14°). */
  alignTol: 0.25,
  /** At or below this speed the car counts as at rest (mph). */
  restMph: 1.5,
} as const;

/** Whether the car centre lies within the bay's inner (margin-shrunk) rectangle. */
export function insideBay(bay: ParkingBay, x: number, z: number): boolean {
  const { across, along } = localOffset(bay, x, z);
  return (
    Math.abs(across) <= bay.halfW - PARK.marginW && Math.abs(along) <= bay.halfD - PARK.marginD
  );
}

/**
 * A full park: centred inside the bay, aligned with its axis, and at rest.
 */
export function isParked(
  bay: ParkingBay,
  x: number,
  z: number,
  heading: number,
  speedMph: number,
): boolean {
  return (
    insideBay(bay, x, z) &&
    alignmentError(bay, heading) <= PARK.alignTol &&
    speedMph <= PARK.restMph
  );
}

/** The bay's four corners (world XZ), for drawing its outline. Order: CCW. */
export function bayCorners(bay: ParkingBay): Array<{ x: number; z: number }> {
  const ax = Math.sin(bay.axis);
  const az = Math.cos(bay.axis);
  // Perpendicular (across) unit vector.
  const px = az;
  const pz = -ax;
  const w = bay.halfW;
  const d = bay.halfD;
  return [
    { x: bay.cx - px * w - ax * d, z: bay.cz - pz * w - az * d },
    { x: bay.cx + px * w - ax * d, z: bay.cz + pz * w - az * d },
    { x: bay.cx + px * w + ax * d, z: bay.cz + pz * w + az * d },
    { x: bay.cx - px * w + ax * d, z: bay.cz - pz * w + az * d },
  ];
}
