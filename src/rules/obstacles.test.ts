import { describe, expect, it } from "vitest";
import { CAR_RADIUS, buildingRects, isBlocked, resolveMovement, type Rect } from "./obstacles";

const wall: Rect[] = [{ cx: 0, cz: 0, halfW: 10, halfD: 10 }];

describe("obstacles", () => {
  it("generates one building rect per block", () => {
    // 9 roads → 8 gaps per axis → 64 blocks.
    expect(buildingRects()).toHaveLength(64);
  });

  it("blocks a point inside an obstacle", () => {
    expect(isBlocked(0, 0, wall)).toBe(true);
    expect(isBlocked(10 + CAR_RADIUS - 0.1, 0, wall)).toBe(true);
  });

  it("clears a point outside an obstacle", () => {
    expect(isBlocked(30, 30, wall)).toBe(false);
  });

  it("lets free movement through", () => {
    const m = resolveMovement(30, 30, 31, 31, wall);
    expect(m).toMatchObject({ x: 31, z: 31, hit: false });
  });

  it("blocks driving straight into a wall", () => {
    // Approaching the wall from the left along +x; x should stop, hit=true.
    const m = resolveMovement(-15, 0, -8, 0, wall);
    expect(m.x).toBe(-15); // blocked
    expect(m.hit).toBe(true);
  });

  it("slides along a wall (blocked axis stops, free axis moves)", () => {
    // Resting just outside the left face (11.2 = 10 + radius), moving up-and-into:
    // the x move into the wall is blocked, the z move along it is allowed.
    const m = resolveMovement(-11.3, 0, -8, 5, wall);
    expect(m.x).toBe(-11.3); // x into the wall is blocked
    expect(m.z).toBe(5); // z along the wall is allowed
    expect(m.hit).toBe(true);
  });

  it("lets the car drive out when already overlapping (no lock-up)", () => {
    // Centre sits inside the wall (a car drove onto us) — the move must go through.
    const m = resolveMovement(0, 0, 3, 0, wall);
    expect(m).toMatchObject({ x: 3, z: 0, hit: false });
  });

  it("does not constrain the world edge (the caller wraps)", () => {
    const m = resolveMovement(160, 0, 400, 0, []);
    expect(m).toMatchObject({ x: 400, z: 0, hit: false });
  });
});
