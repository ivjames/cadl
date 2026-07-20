import { describe, expect, it } from "vitest";
import {
  createPedestrians,
  pedestrianContact,
  pedestrianHazard,
  pedestrianPos,
  stepPedestrians,
  type Pedestrian,
} from "./pedestrians";

/** A pedestrian on a full-width X-crossing (walks along X, road runs N/S) at z = 8. */
function ped(over: Partial<Pedestrian>): Pedestrian {
  return { id: 0, ax: -7, az: 8, bx: 7, bz: 8, t: 0.5, dir: 1, wait: 0, striped: true, ...over };
}

/** Same crossing, but with the pedestrian placed at road coordinate `across` (x). */
function pedAt(across: number, striped: boolean): Pedestrian {
  return ped({ t: (across - -7) / (7 - -7), striped });
}

describe("pedestrians", () => {
  it("creates a deterministic set with both crosswalk types", () => {
    expect(createPedestrians()).toEqual(createPedestrians());
    const peds = createPedestrians();
    expect(peds.length).toBeGreaterThan(0);
    expect(peds.some((p) => p.striped)).toBe(true);
    expect(peds.some((p) => !p.striped)).toBe(true);
  });

  it("walks along its path and turns around at the end", () => {
    let peds: Pedestrian[] = [ped({ az: 0, bz: 0, t: 0.95 })];
    for (let i = 0; i < 120; i += 1) peds = stepPedestrians(peds, 1 / 60);
    // Reached b, paused, and reversed direction.
    expect(peds[0]!.dir).toBe(-1);
    expect(peds[0]!.t).toBeLessThanOrEqual(1);
  });

  it("pedestrianPos interpolates the path", () => {
    expect(pedestrianPos(ped({ ax: -10, az: 0, bx: 10, bz: 0, t: 0.5 }))).toEqual({ x: 0, z: 0 });
  });
});

describe("pedestrianHazard — marked (striped) crosswalk", () => {
  // Northbound car at (2.75, 0) approaching an X-crosswalk at z = 8.
  const car = { px: 2.75, pz: 0, heading: 0 };

  it("must yield while the pedestrian is anywhere on the roadway ahead", () => {
    // Pedestrian on the far side of the road (x = -3), not in the car's lane.
    expect(pedestrianHazard(car.px, car.pz, car.heading, [pedAt(-3, true)])).toBe(true);
  });

  it("still yields when the pedestrian is right in the lane", () => {
    expect(pedestrianHazard(car.px, car.pz, car.heading, [pedAt(2.75, true)])).toBe(true);
  });

  it("clears once the pedestrian is entirely off the road", () => {
    // At the far kerb (x = 7), beyond the roadway.
    expect(pedestrianHazard(car.px, car.pz, car.heading, [pedAt(7, true)])).toBe(false);
  });

  it("ignores a crosswalk behind the car", () => {
    const peds = [ped({ az: -8, bz: -8, striped: true })];
    expect(pedestrianHazard(car.px, car.pz, car.heading, peds)).toBe(false);
  });
});

describe("pedestrianContact", () => {
  it("flags the car running over a pedestrian", () => {
    const peds = [ped({ ax: 0, az: 0, bx: 0, bz: 0 })]; // at the origin
    expect(pedestrianContact(0.5, 0.5, peds)).toBe(true);
  });

  it("is clear when the car passes at a distance", () => {
    const peds = [ped({ ax: 0, az: 0, bx: 0, bz: 0 })];
    expect(pedestrianContact(3, 0, peds)).toBe(false);
  });
});

describe("pedestrianHazard — unmarked crosswalk", () => {
  const car = { px: 2.75, pz: 0, heading: 0 };

  it("must yield while the pedestrian is on the car's half of the road", () => {
    // Car is on the +X half (centre x = 0); pedestrian at x = +3 (same half).
    expect(pedestrianHazard(car.px, car.pz, car.heading, [pedAt(3, false)])).toBe(true);
  });

  it("may proceed once the pedestrian passes the road centre", () => {
    // Pedestrian on the far half (x = -3) — past centre from the car's side.
    expect(pedestrianHazard(car.px, car.pz, car.heading, [pedAt(-3, false)])).toBe(false);
  });
});
