import { describe, expect, it } from "vitest";
import { LANE, ROAD_HALF, WORLD, onRoad, wrapWorld } from "./roadGrid";

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

describe("onRoad", () => {
  it("is true in a lane on a road", () => {
    expect(onRoad(LANE, -30)).toBe(true); // x=0 road, mid-block
    expect(onRoad(-120, 40)).toBe(true); // z on the x=-120 road
  });

  it("is true inside an intersection box", () => {
    expect(onRoad(0, 0)).toBe(true);
    expect(onRoad(60, -60)).toBe(true);
  });

  it("is false out on the grass between roads", () => {
    expect(onRoad(30, 30)).toBe(false); // mid-block, off both axes
    expect(onRoad(ROAD_HALF + 4, ROAD_HALF + 4)).toBe(false);
  });

  it("is true right up to the road edge and false just past it", () => {
    expect(onRoad(ROAD_HALF - 0.1, 30)).toBe(true);
    expect(onRoad(ROAD_HALF + 0.1, 30)).toBe(false);
  });
});
