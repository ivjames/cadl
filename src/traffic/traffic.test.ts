import { describe, expect, it } from "vitest";
import {
  TRAFFIC_SPEED,
  createTraffic,
  leadGapFor,
  stepTraffic,
  turnDecisionFor,
  type TrafficCar,
} from "./traffic";
import { LANE, ROADS } from "../rules/roadGrid";

const nearestRoad = (v: number): number =>
  ROADS.reduce((a, b) => (Math.abs(b - v) < Math.abs(a - v) ? b : a));

describe("traffic sim", () => {
  it("creates a deterministic fleet", () => {
    const a = createTraffic();
    const b = createTraffic();
    expect(a.length).toBeGreaterThan(0);
    expect(a).toEqual(b);
  });

  it("a lone car cruises forward toward the target speed", () => {
    // Mid-block (away from any junction, where it would otherwise slow to turn).
    let cars: TrafficCar[] = [{ id: 0, x: 2.75, z: 20, heading: 0, speed: TRAFFIC_SPEED }];
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

  it("stops at a stop line and holds", () => {
    // Northbound on the x=0 road, approaching the z=60 intersection.
    let cars: TrafficCar[] = [{ id: 0, x: 2.75, z: 40, heading: 0, speed: TRAFFIC_SPEED }];
    for (let i = 0; i < 240; i += 1) cars = stepTraffic(cars, 1 / 60);
    const car = cars[0]!;
    // It should have braked to a near-stop just short of the line (z ≈ 60 − 6.1).
    expect(car.speed).toBeLessThan(2);
    expect(car.z).toBeLessThan(60 - 6.1 + 1);
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

describe("traffic turning", () => {
  it("turnDecisionFor is deterministic and returns a valid choice", () => {
    for (let id = 0; id < 20; id += 1) {
      const a = turnDecisionFor(id, "0:0");
      const b = turnDecisionFor(id, "0:0");
      expect(a).toBe(b);
      expect([-1, 0, 1]).toContain(a);
    }
  });

  it("executes an in-progress right turn and snaps onto the perpendicular lane", () => {
    // Northbound car mid-junction, told to turn right (toward eastbound, +X).
    let cars: TrafficCar[] = [
      { id: 0, x: LANE, z: 0, heading: 0, speed: 4, turn: { toH: Math.PI / 2 }, blinker: 1 },
    ];
    for (let i = 0; i < 120; i += 1) cars = stepTraffic(cars, 1 / 60);
    const car = cars[0]!;
    expect(car.turn ?? null).toBeNull(); // turn finished
    expect(car.blinker).toBe(0); // signal cancelled
    expect(Math.abs(car.heading - Math.PI / 2)).toBeLessThan(0.05); // now eastbound
    // Eastbound right lane sits at z = roadCentre − LANE.
    expect(car.z).toBeCloseTo(nearestRoad(car.z) - LANE, 5);
  });

  it("a cruising car turns at a junction when its decision says so", () => {
    // Find a car id that turns at the origin, then drive it up to the junction.
    let id = 0;
    while (id < 50 && turnDecisionFor(id, "0:0") === 0) id += 1;
    expect(turnDecisionFor(id, "0:0")).not.toBe(0);

    // Enough frames to brake for the stop line, wait, reach the box, and pivot.
    let cars: TrafficCar[] = [{ id, x: LANE, z: -12, heading: 0, speed: TRAFFIC_SPEED }];
    let turned = false;
    for (let i = 0; i < 480; i += 1) {
      cars = stepTraffic(cars, 1 / 60);
      if (Math.abs(Math.sin(cars[0]!.heading)) > 0.5) turned = true; // now heading E/W
    }
    expect(turned).toBe(true);
  });

  it("keeps every car on a valid lane (or mid-turn) over a long run", () => {
    let cars = createTraffic();
    for (let step = 0; step < 3600; step += 1) {
      cars = stepTraffic(cars, 1 / 60);
      if (step % 300 !== 0) continue; // spot-check periodically
      for (const c of cars) {
        expect(Number.isFinite(c.x) && Number.isFinite(c.z) && Number.isFinite(c.heading)).toBe(true);
        expect(c.speed).toBeGreaterThanOrEqual(-0.01);
        expect(c.speed).toBeLessThanOrEqual(TRAFFIC_SPEED + 0.01);
        if (c.turn) continue; // mid-turn cars are between lanes by design
        // Cruising cars ride a lane: the cross-axis offset from the road is ±LANE.
        const northSouth = Math.abs(Math.cos(c.heading)) > 0.5;
        const offset = northSouth
          ? Math.abs(c.x - nearestRoad(c.x))
          : Math.abs(c.z - nearestRoad(c.z));
        expect(Math.abs(offset - LANE)).toBeLessThan(0.5);
      }
    }
  });
});
