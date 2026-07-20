import { describe, expect, it } from "vitest";
import { crossTrafficInJunction, intersectionAt } from "./intersections";
import type { TrafficCar } from "../traffic/traffic";

describe("intersectionAt", () => {
  it("detects a point inside the origin junction box", () => {
    expect(intersectionAt(0, 0)).toEqual({ cx: 0, cz: 0 });
    expect(intersectionAt(2, -3)).toEqual({ cx: 0, cz: 0 });
  });

  it("returns null between intersections", () => {
    expect(intersectionAt(2.75, -30)).toBeNull(); // mid-block on the x=0 road
  });

  it("finds a non-origin junction", () => {
    expect(intersectionAt(60, 60)).toEqual({ cx: 60, cz: 60 });
  });
});

describe("crossTrafficInJunction", () => {
  const junction = { cx: 0, cz: 0 };
  const car = (over: Partial<TrafficCar>): TrafficCar => ({
    id: 0,
    x: 0,
    z: 0,
    heading: Math.PI / 2,
    speed: 9,
    ...over,
  });

  it("sees a moving perpendicular car in the box (player heading north)", () => {
    expect(crossTrafficInJunction([car({})], junction, 0)).toBe(true);
  });

  it("ignores a car moving the same direction as the player", () => {
    expect(crossTrafficInJunction([car({ heading: 0 })], junction, 0)).toBe(false);
  });

  it("ignores a stopped car", () => {
    expect(crossTrafficInJunction([car({ speed: 0 })], junction, 0)).toBe(false);
  });

  it("ignores a car outside the box", () => {
    expect(crossTrafficInJunction([car({ x: 40 })], junction, 0)).toBe(false);
  });
});
