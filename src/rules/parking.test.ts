import { describe, expect, it } from "vitest";
import {
  alignmentError,
  bayCorners,
  insideBay,
  isParked,
  type ParkingBay,
} from "./parking";

// A bay aligned with the +Z road axis, centred off to the east of the lane.
const BAY: ParkingBay = { cx: 8, cz: 30, halfW: 1.6, halfD: 2.6, axis: 0 };

describe("parking bay geometry", () => {
  it("flags a car centred and aligned inside the bay", () => {
    expect(isParked(BAY, 8, 30, 0, 0)).toBe(true);
  });

  it("accepts a car backed in (facing the opposite way)", () => {
    expect(isParked(BAY, 8, 30, Math.PI, 0)).toBe(true);
  });

  it("rejects a car outside the bay footprint", () => {
    expect(insideBay(BAY, 8, 40)).toBe(false);
    expect(isParked(BAY, 12, 30, 0, 0)).toBe(false);
  });

  it("rejects a car parked crooked", () => {
    expect(isParked(BAY, 8, 30, 0.6, 0)).toBe(false);
  });

  it("rejects a car still rolling", () => {
    expect(isParked(BAY, 8, 30, 0, 5)).toBe(false);
  });

  it("requires the whole car centre inside the shrunk rectangle", () => {
    // Just past the along-margin edge: halfD 2.6 − marginD 0.6 = 2.0.
    expect(insideBay(BAY, 8, 30 + 1.9)).toBe(true);
    expect(insideBay(BAY, 8, 30 + 2.1)).toBe(false);
  });

  it("alignmentError treats both axis directions as aligned", () => {
    expect(alignmentError(BAY, 0)).toBeCloseTo(0, 6);
    expect(alignmentError(BAY, Math.PI)).toBeCloseTo(0, 6);
    expect(alignmentError(BAY, Math.PI / 2)).toBeCloseTo(Math.PI / 2, 6);
  });

  it("handles a bay on the perpendicular (east-west) axis", () => {
    const eastBay: ParkingBay = { cx: 0, cz: 0, halfW: 1.6, halfD: 2.6, axis: Math.PI / 2 };
    // Aligned east-west, centred: parked.
    expect(isParked(eastBay, 0, 0, Math.PI / 2, 0)).toBe(true);
    // The long axis now runs along X (inner 2.0), the short across Z (inner 1.2).
    expect(insideBay(eastBay, 1.9, 0)).toBe(true);
    expect(insideBay(eastBay, 2.1, 0)).toBe(false);
    expect(insideBay(eastBay, 0, 1.0)).toBe(true);
    expect(insideBay(eastBay, 0, 1.3)).toBe(false);
  });

  it("bayCorners returns four points spanning the footprint", () => {
    const corners = bayCorners(BAY);
    expect(corners).toHaveLength(4);
    const xs = corners.map((c) => c.x);
    const zs = corners.map((c) => c.z);
    expect(Math.min(...xs)).toBeCloseTo(BAY.cx - BAY.halfW, 6);
    expect(Math.max(...xs)).toBeCloseTo(BAY.cx + BAY.halfW, 6);
    expect(Math.min(...zs)).toBeCloseTo(BAY.cz - BAY.halfD, 6);
    expect(Math.max(...zs)).toBeCloseTo(BAY.cz + BAY.halfD, 6);
  });
});
