import { describe, expect, it } from "vitest";
import { angleDifference, stopSignAhead } from "./stopControls";

describe("angleDifference", () => {
  it("wraps around +/-PI", () => {
    expect(angleDifference(0.1, -0.1)).toBeCloseTo(0.2, 6);
    // 350° vs 10° apart is 340°, i.e. -20° the short way.
    expect(angleDifference((350 * Math.PI) / 180, (10 * Math.PI) / 180)).toBeCloseTo(
      (-20 * Math.PI) / 180,
      6,
    );
  });
});

describe("stopSignAhead", () => {
  it("sees the south limit line when driving north toward it", () => {
    // Northbound (heading 0) in the right lane, well south of the junction.
    const ahead = stopSignAhead(2.75, -20, 0);
    expect(ahead).not.toBeNull();
    expect(ahead!.name).toBe("0:0:S"); // origin intersection, south approach
    expect(ahead!.distance).toBeCloseTo(20 - 6.1, 1);
  });

  it("ignores a stop control behind the car", () => {
    // Already past the south line, still heading north — nothing ahead within range.
    expect(stopSignAhead(2.75, -5, 0)).toBeNull();
  });

  it("ignores stops beyond the lookahead distance", () => {
    expect(stopSignAhead(2.75, -50, 0)).toBeNull();
  });

  it("ignores a stop the car is not aligned with", () => {
    // Sitting south of the junction but heading east — the south line isn't its approach.
    expect(stopSignAhead(2.75, -20, Math.PI / 2)).toBeNull();
  });

  it("ignores a stop when the car is far off to the side of the lane", () => {
    // ~26 m from the south control and roughly aligned, but 22 m off the road.
    expect(stopSignAhead(-20, -20, 0)).toBeNull();
  });

  it("reports the forward distance to the limit line, not the euclidean offset", () => {
    // Slightly off lane centre (within tolerance) but the distance is longitudinal.
    const ahead = stopSignAhead(0, -20, 0); // spawn lane; control S is at z = -6.1
    expect(ahead).not.toBeNull();
    expect(ahead!.distance).toBeCloseTo(20 - 6.1, 1);
  });

  it("sees the west limit line when driving east toward it", () => {
    const ahead = stopSignAhead(-20, -2.75, Math.PI / 2);
    expect(ahead).not.toBeNull();
    expect(ahead!.name).toBe("0:0:W");
  });
});
