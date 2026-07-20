import { describe, expect, it } from "vitest";
import { DrivingInput } from "./DrivingInput";

describe("DrivingInput", () => {
  it("reads neutral input by default", () => {
    const input = new DrivingInput();
    expect(input.read()).toEqual({ gas: 0, brake: 0, steer: 0, reverse: false });
  });

  it("maps held touch controls to drive intent", () => {
    const input = new DrivingInput();
    input.press("gas", true);
    input.press("right", true);
    input.update(1); // one big tick eases the pedal fully in
    expect(input.read()).toEqual({ gas: 1, brake: 0, steer: 1, reverse: false });
  });

  it("supports simultaneous steering and pedal input", () => {
    const input = new DrivingInput();
    input.press("gas", true);
    input.press("left", true);
    input.update(1);
    expect(input.read()).toEqual({ gas: 1, brake: 0, steer: -1, reverse: false });
  });

  it("eases the throttle in progressively rather than snapping to full", () => {
    const input = new DrivingInput();
    input.press("gas", true);
    input.update(1 / 60);
    const first = input.read().gas;
    expect(first).toBeGreaterThan(0);
    expect(first).toBeLessThan(1); // not full after a single frame
    for (let i = 0; i < 60; i += 1) input.update(1 / 60);
    expect(input.read().gas).toBeCloseTo(1, 5); // reaches full when held
  });

  it("eases the throttle back toward zero when released", () => {
    const input = new DrivingInput();
    input.press("gas", true);
    input.update(1);
    input.press("gas", false);
    input.update(1 / 60);
    const g = input.read().gas;
    expect(g).toBeLessThan(1);
    expect(g).toBeGreaterThan(0); // still easing down, not instantly zero
  });

  it("holds a partial throttle from the analog pedal (proportional, not full)", () => {
    const input = new DrivingInput();
    input.setThrottle(0.4);
    for (let i = 0; i < 120; i += 1) input.update(1 / 60); // settle
    expect(input.read().gas).toBeCloseTo(0.4, 5); // stays at the demand, never ramps to 1
  });

  it("holds a partial brake from the analog pedal", () => {
    const input = new DrivingInput();
    input.setBrake(0.3);
    for (let i = 0; i < 120; i += 1) input.update(1 / 60);
    expect(input.read().brake).toBeCloseTo(0.3, 5);
  });

  it("follows the pedal down when the demand drops", () => {
    const input = new DrivingInput();
    input.setThrottle(0.8);
    input.update(1);
    input.setThrottle(0.2);
    for (let i = 0; i < 120; i += 1) input.update(1 / 60);
    expect(input.read().gas).toBeCloseTo(0.2, 5);
  });

  it("a keyboard key still demands full throttle over a light pedal", () => {
    const input = new DrivingInput();
    input.setThrottle(0.3);
    input.press("gas", true); // e.g. keyboard-equivalent held control
    for (let i = 0; i < 120; i += 1) input.update(1 / 60);
    expect(input.read().gas).toBeCloseTo(1, 5);
  });

  it("clear() releases the analog pedals", () => {
    const input = new DrivingInput();
    input.setThrottle(0.5);
    input.setBrake(0.5);
    input.update(1);
    input.clear();
    input.update(1);
    expect(input.read().gas).toBe(0);
    expect(input.read().brake).toBe(0);
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
    expect(input.read()).toEqual({ gas: 0, brake: 0, steer: 0, reverse: false });
  });

  it("releasing a touch control returns intent to neutral", () => {
    const input = new DrivingInput();
    input.press("gas", true);
    input.press("gas", false);
    expect(input.read().gas).toBe(0);
  });

  it("toggles the reverse gear and reports it in read()", () => {
    const input = new DrivingInput();
    expect(input.inReverse).toBe(false);
    expect(input.toggleReverse()).toBe(true);
    expect(input.inReverse).toBe(true);
    expect(input.read().reverse).toBe(true);
    input.toggleReverse();
    expect(input.read().reverse).toBe(false);
  });

  it("setReverse selects a gear directly", () => {
    const input = new DrivingInput();
    input.setReverse(true);
    expect(input.read().reverse).toBe(true);
    input.setReverse(false);
    expect(input.read().reverse).toBe(false);
  });

  it("clear() returns to Drive", () => {
    const input = new DrivingInput();
    input.setReverse(true);
    input.clear();
    expect(input.read().reverse).toBe(false);
  });
});
