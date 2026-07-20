import { describe, expect, it } from "vitest";
import {
  DEFAULT_LIMIT_MPH,
  OVER_LIMIT_TOLERANCE_MPH,
  isOverLimit,
  speedLimitAt,
} from "./speedZones";

describe("speed-limit zones", () => {
  it("returns the residential default outside any zone", () => {
    const limit = speedLimitAt(-30, -30);
    expect(limit.limitMph).toBe(DEFAULT_LIMIT_MPH);
    expect(limit.zone).toBeNull();
  });

  it("returns the school-zone limit inside it", () => {
    const limit = speedLimitAt(25, 0); // on the east arm of the E–W road
    expect(limit.limitMph).toBe(20);
    expect(limit.zone).toBe("School Zone");
  });

  it("stays on the default off to the side of the school zone", () => {
    expect(speedLimitAt(25, 25).zone).toBeNull(); // off-road, outside the z-band
  });

  it("flags speeds over the limit beyond tolerance", () => {
    expect(isOverLimit(25 + OVER_LIMIT_TOLERANCE_MPH + 1, 25)).toBe(true);
  });

  it("does not flag speeds within tolerance", () => {
    expect(isOverLimit(25 + OVER_LIMIT_TOLERANCE_MPH, 25)).toBe(false);
    expect(isOverLimit(20, 25)).toBe(false);
  });
});
