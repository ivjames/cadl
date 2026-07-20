import { describe, expect, it } from "vitest";
import { TRAFFIC_SPEED, createTraffic, leadGapFor, stepTraffic, type TrafficCar } from "./traffic";

describe("traffic sim", () => {
  it("creates a deterministic fleet", () => {
    const a = createTraffic();
    const b = createTraffic();
    expect(a.length).toBeGreaterThan(0);
    expect(a).toEqual(b);
  });

  it("a lone car cruises forward toward the target speed", () => {
    let cars: TrafficCar[] = [{ id: 0, x: 2.75, z: 0, heading: 0, speed: TRAFFIC_SPEED }];
    const z0 = cars[0]!.z;
    for (let i = 0; i < 60; i += 1) cars = stepTraffic(cars, 1 / 60);
    expect(cars[0]!.z).toBeGreaterThan(z0); // moved north
    expect(cars[0]!.speed).toBeCloseTo(TRAFFIC_SPEED, 1);
  });

  it("a car slows for a stopped car close ahead", () => {
    let cars: TrafficCar[] = [
      { id: 0, x: 2.75, z: 0, heading: 0, speed: 0 }, // stopped leader
      { id: 1, x: 2.75, z: -6, heading: 0, speed: TRAFFIC_SPEED }, // follower 6 m back
    ];
    for (let i = 0; i < 40; i += 1) cars = stepTraffic(cars, 1 / 60);
    const follower = cars.find((c) => c.id === 1)!;
    expect(follower.speed).toBeLessThan(TRAFFIC_SPEED);
    // It should not have driven through the leader.
    expect(follower.z).toBeLessThan(cars.find((c) => c.id === 0)!.z);
  });

  it("yields to the player ahead", () => {
    let cars: TrafficCar[] = [{ id: 0, x: 2.75, z: -6, heading: 0, speed: TRAFFIC_SPEED }];
    const player = { x: 2.75, z: 0, heading: 0 };
    for (let i = 0; i < 60; i += 1) cars = stepTraffic(cars, 1 / 60, player);
    expect(cars[0]!.speed).toBeLessThan(TRAFFIC_SPEED);
    expect(cars[0]!.z).toBeLessThan(0); // stayed behind the player
  });

  it("wraps around the world edge", () => {
    // Start near the +z edge and drive past it; it should reappear at -z.
    let cars: TrafficCar[] = [{ id: 0, x: 2.75, z: 305, heading: 0, speed: TRAFFIC_SPEED }];
    for (let i = 0; i < 180; i += 1) cars = stepTraffic(cars, 1 / 60);
    expect(cars[0]!.z).toBeLessThan(0); // wrapped to the far side
  });

  it("leadGapFor sees a car ahead in the same lane", () => {
    const cars: TrafficCar[] = [{ id: 0, x: 2.75, z: 20, heading: 0, speed: 0 }];
    const gap = leadGapFor({ x: 2.75, z: 5, heading: 0 }, cars);
    expect(gap).toBeCloseTo(15, 5);
  });

  it("leadGapFor ignores oncoming and other-lane cars", () => {
    const cars: TrafficCar[] = [
      { id: 0, x: 2.75, z: 20, heading: Math.PI, speed: 0 }, // oncoming
      { id: 1, x: -2.75, z: 20, heading: 0, speed: 0 }, // other lane
    ];
    expect(leadGapFor({ x: 2.75, z: 5, heading: 0 }, cars)).toBeNull();
  });
});
