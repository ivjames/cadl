import { describe, expect, it } from "vitest";
import { WORLD, wrapWorld } from "./roadGrid";

describe("wrapWorld", () => {
  const half = WORLD / 2;

  it("leaves in-bounds coordinates unchanged", () => {
    expect(wrapWorld(0)).toBe(0);
    expect(wrapWorld(half - 1)).toBe(half - 1);
    expect(wrapWorld(-half + 1)).toBe(-half + 1);
  });

  it("wraps past the +edge to the -side", () => {
    expect(wrapWorld(half + 5)).toBeCloseTo(-half + 5, 6);
  });

  it("wraps past the -edge to the +side", () => {
    expect(wrapWorld(-half - 5)).toBeCloseTo(half - 5, 6);
  });
});
