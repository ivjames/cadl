import { describe, expect, it } from "vitest";
import {
  TURN_COUNTED_THRESHOLD,
  initialSignalState,
  setSignal,
  updateSignal,
} from "./signals";

describe("turn-signal state machine", () => {
  it("starts off", () => {
    expect(initialSignalState().active).toBeNull();
  });

  it("arms a direction", () => {
    expect(setSignal(initialSignalState(), "left").active).toBe("left");
    expect(setSignal(initialSignalState(), "right").active).toBe("right");
  });

  it("toggles off when re-armed in the same direction", () => {
    const on = setSignal(initialSignalState(), "left");
    expect(setSignal(on, "left").active).toBeNull();
  });

  it("switches directly to the other direction", () => {
    const left = setSignal(initialSignalState(), "left");
    expect(setSignal(left, "right").active).toBe("right");
  });

  it("does nothing while off", () => {
    const off = initialSignalState();
    expect(updateSignal(off, -1, -1)).toBe(off);
  });

  it("does not cancel mid-turn while the wheel is still turned", () => {
    let s = setSignal(initialSignalState(), "left");
    // Big left sweep (negative heading delta) but wheel still hard over.
    s = updateSignal(s, -(TURN_COUNTED_THRESHOLD + 0.1), -1);
    expect(s.active).toBe("left");
    expect(s.peaked).toBe(true);
  });

  it("auto-cancels after a completed left turn once the wheel straightens", () => {
    let s = setSignal(initialSignalState(), "left");
    s = updateSignal(s, -(TURN_COUNTED_THRESHOLD + 0.1), -1); // sweep left, wheel over
    s = updateSignal(s, -0.02, 0); // wheel back to centre
    expect(s.active).toBeNull();
  });

  it("auto-cancels after a completed right turn", () => {
    let s = setSignal(initialSignalState(), "right");
    s = updateSignal(s, TURN_COUNTED_THRESHOLD + 0.1, 1);
    s = updateSignal(s, 0.02, 0);
    expect(s.active).toBeNull();
  });

  it("does not auto-cancel for a small lane-change wiggle", () => {
    let s = setSignal(initialSignalState(), "left");
    // Small sweep well under the threshold, then straight — should stay on.
    s = updateSignal(s, -0.1, -0.2);
    s = updateSignal(s, 0, 0);
    expect(s.active).toBe("left");
  });
});
