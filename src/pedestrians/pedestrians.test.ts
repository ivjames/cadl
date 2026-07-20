import { describe, expect, it } from "vitest";
import {
  createPedestrians,
  pedestrianHazard,
  pedestrianPos,
  stepPedestrians,
  type Pedestrian,
} from "./pedestrians";

describe("pedestrians", () => {
  it("creates a deterministic set", () => {
    expect(createPedestrians()).toEqual(createPedestrians());
    expect(createPedestrians().length).toBeGreaterThan(0);
  });

  it("walks along its path and turns around at the end", () => {
    let peds: Pedestrian[] = [{ id: 0, ax: -7, az: 0, bx: 7, bz: 0, t: 0.95, dir: 1, wait: 0 }];
    for (let i = 0; i < 120; i += 1) peds = stepPedestrians(peds, 1 / 60);
    // Reached b, paused, and reversed direction.
    expect(peds[0]!.dir).toBe(-1);
    expect(peds[0]!.t).toBeLessThanOrEqual(1);
  });

  it("flags a pedestrian in the lane ahead", () => {
    // Ped at (0, 8) — 8 m directly ahead of a northbound car at origin.
    const peds: Pedestrian[] = [{ id: 0, ax: 0, az: 8, bx: 0, bz: 8, t: 0, dir: 1, wait: 0 }];
    expect(pedestrianHazard(0, 0, 0, peds)).toBe(true);
  });

  it("ignores a pedestrian off to the side or behind", () => {
    const side: Pedestrian[] = [{ id: 0, ax: 6, az: 8, bx: 6, bz: 8, t: 0, dir: 1, wait: 0 }];
    expect(pedestrianHazard(0, 0, 0, side)).toBe(false);
    const behind: Pedestrian[] = [{ id: 0, ax: 0, az: -8, bx: 0, bz: -8, t: 0, dir: 1, wait: 0 }];
    expect(pedestrianHazard(0, 0, 0, behind)).toBe(false);
  });

  it("pedestrianPos interpolates the path", () => {
    expect(pedestrianPos({ id: 0, ax: -10, az: 0, bx: 10, bz: 0, t: 0.5, dir: 1, wait: 0 })).toEqual({
      x: 0,
      z: 0,
    });
  });
});
