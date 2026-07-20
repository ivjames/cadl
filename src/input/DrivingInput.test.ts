import { describe, expect, it } from "vitest";
import { DrivingInput } from "./DrivingInput";

describe("DrivingInput", () => {
  it("reads neutral input by default", () => {
    const input = new DrivingInput();
    expect(input.read()).toEqual({ gas: 0, brake: 0, steer: 0 });
  });

  it("maps held touch controls to drive intent", () => {
    const input = new DrivingInput();
    input.press("gas", true);
    input.press("right", true);
    expect(input.read()).toEqual({ gas: 1, brake: 0, steer: 1 });
  });

  it("supports simultaneous steering and pedal input", () => {
    const input = new DrivingInput();
    input.press("gas", true);
    input.press("left", true);
    expect(input.read()).toEqual({ gas: 1, brake: 0, steer: -1 });
  });

  it("cancels opposing steer inputs to zero", () => {
    const input = new DrivingInput();
    input.press("left", true);
    input.press("right", true);
    expect(input.read().steer).toBe(0);
  });

  it("uses the analog steering axis from the wheel", () => {
    const input = new DrivingInput();
    input.setSteerAxis(0.5);
    expect(input.read().steer).toBeCloseTo(0.5, 5);
    input.setSteerAxis(-2); // clamps to -1
    expect(input.read().steer).toBe(-1);
  });

  it("combines wheel and button steering, clamped", () => {
    const input = new DrivingInput();
    input.press("right", true);
    input.setSteerAxis(0.5);
    expect(input.read().steer).toBe(1); // 1 + 0.5 clamped
  });

  it("clear() drops all active touch and analog state", () => {
    const input = new DrivingInput();
    input.press("gas", true);
    input.press("brake", true);
    input.press("left", true);
    input.setSteerAxis(0.8);
    input.clear();
    expect(input.read()).toEqual({ gas: 0, brake: 0, steer: 0 });
  });

  it("releasing a touch control returns intent to neutral", () => {
    const input = new DrivingInput();
    input.press("gas", true);
    input.press("gas", false);
    expect(input.read().gas).toBe(0);
  });
});
