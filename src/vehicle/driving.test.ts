import { describe, expect, it } from "vitest";
import {
  DRIVING,
  SPAWN,
  type CarState,
  type DriveInput,
  spawnState,
  speedToMph,
  stepCar,
} from "./driving";

const NEUTRAL: DriveInput = { gas: 0, brake: 0, steer: 0 };

/** Run `stepCar` repeatedly with a fixed dt to simulate holding input. */
function drive(start: CarState, input: DriveInput, steps: number, dt = 1 / 60): CarState {
  let state = start;
  for (let i = 0; i < steps; i += 1) state = stepCar(state, input, dt);
  return state;
}

describe("stepCar longitudinal behaviour", () => {
  it("accelerates forward under gas", () => {
    const next = stepCar(spawnState(), { ...NEUTRAL, gas: 1 }, 0.1);
    expect(next.speed).toBeCloseTo(DRIVING.forwardAccel * 0.1, 5);
    expect(next.speed).toBeGreaterThan(0);
  });

  it("coasts to a stop via drag when no pedal is held", () => {
    const rolling: CarState = { ...spawnState(), speed: 8 };
    const later = drive(rolling, NEUTRAL, 300);
    expect(later.speed).toBe(0);
  });

  it("drag never overshoots past zero", () => {
    const crawling: CarState = { ...spawnState(), speed: 0.01 };
    const next = stepCar(crawling, NEUTRAL, 1 / 60);
    expect(next.speed).toBe(0);
  });

  it("brakes toward zero when rolling forward without flipping to reverse", () => {
    const rolling: CarState = { ...spawnState(), speed: 6 };
    const next = stepCar(rolling, { ...NEUTRAL, brake: 1 }, 1 / 60);
    expect(next.speed).toBeLessThan(6);
    expect(next.speed).toBeGreaterThanOrEqual(0);
  });

  it("never jumps forward speed straight into reverse in a single step", () => {
    // Even with an absurdly long step, braking from forward clamps at zero.
    const rolling: CarState = { ...spawnState(), speed: 5 };
    const next = stepCar(rolling, { ...NEUTRAL, brake: 1 }, 10);
    expect(next.speed).toBe(0);
  });

  it("engages reverse once stopped and brake is still held", () => {
    const stopped = spawnState();
    const reversing = drive(stopped, { ...NEUTRAL, brake: 1 }, 30);
    expect(reversing.speed).toBeLessThan(0);
  });

  it("clamps to the reverse speed cap", () => {
    const reversing = drive(spawnState(), { ...NEUTRAL, brake: 1 }, 2000);
    expect(reversing.speed).toBeCloseTo(-DRIVING.maxReverse, 5);
  });

  it("clamps to the forward speed cap", () => {
    const flatOut = drive(spawnState(), { ...NEUTRAL, gas: 1 }, 2000);
    expect(flatOut.speed).toBeCloseTo(DRIVING.maxForward, 5);
  });
});

describe("stepCar steering", () => {
  it("cannot turn while stopped", () => {
    const next = stepCar(spawnState(), { ...NEUTRAL, steer: 1 }, 0.5);
    expect(next.heading).toBe(SPAWN.heading);
  });

  it("turns when moving forward", () => {
    const rolling: CarState = { ...spawnState(), speed: 8 };
    const next = stepCar(rolling, { ...NEUTRAL, steer: 1 }, 0.1);
    expect(next.heading).toBeGreaterThan(0);
  });

  it("inverts steer direction when reversing", () => {
    const reversing: CarState = { ...spawnState(), speed: -4 };
    const next = stepCar(reversing, { ...NEUTRAL, steer: 1 }, 0.1);
    expect(next.heading).toBeLessThan(0);
  });
});

describe("state helpers", () => {
  it("spawnState returns a fresh copy, not the shared constant", () => {
    const a = spawnState();
    a.speed = 99;
    expect(spawnState().speed).toBe(0);
    expect(SPAWN.speed).toBe(0);
  });

  it("stepCar does not mutate its input state", () => {
    const start = spawnState();
    stepCar(start, { ...NEUTRAL, gas: 1 }, 0.2);
    expect(start).toEqual(SPAWN);
  });

  it("reports mph as an absolute value for both directions", () => {
    expect(speedToMph(10)).toBeCloseTo(22.3694, 3);
    expect(speedToMph(-10)).toBeCloseTo(22.3694, 3);
  });
});
