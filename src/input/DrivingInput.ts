import type { DriveInput } from "../vehicle/driving";

/** The four held controls shared by keyboard and touch. */
export type HeldControl = "gas" | "brake" | "left" | "right";

const KEY_MAP: Record<HeldControl, readonly string[]> = {
  gas: ["KeyW", "ArrowUp"],
  brake: ["KeyS", "ArrowDown"],
  left: ["KeyA", "ArrowLeft"],
  right: ["KeyD", "ArrowRight"],
};

/** Pedal easing rates (units of travel per second): press-in vs release. */
const PEDAL = {
  gasRise: 2.2, // ~0.45 s to full throttle
  gasFall: 4.5, // lifts off quickly when released
  brakeRise: 3.5, // firm but progressive application
  brakeFall: 6, // releases fast
} as const;

/** Move `value` toward `target` by at most `rate·dt`. */
function ease(value: number, target: number, rate: number, dt: number): number {
  const step = rate * dt;
  return value < target ? Math.min(target, value + step) : Math.max(target, value - step);
}

/**
 * Unifies keyboard and pointer/touch input into a single {@link DriveInput}.
 *
 * Touch (`press`) and keyboard (`onKeyDown`/`onKeyUp`) are tracked separately
 * and OR-ed together at `read()` time, so a control is "on" if it is held by
 * either source. Kept free of any direct `window`/DOM reference in its
 * constructor so it can be unit tested in a plain Node environment; the caller
 * wires DOM events via `attach`.
 */
export class DrivingInput {
  private readonly keys = new Set<string>();
  private touch: Record<HeldControl, boolean> = {
    gas: false,
    brake: false,
    left: false,
    right: false,
  };
  /** Analog steering from the on-screen wheel, -1 (left) .. 1 (right). */
  private steerAxis = 0;
  /** Transmission gear: false = Drive, true = Reverse. Toggled, not held. */
  private reverse = false;
  /** Analog pedal positions, 0..1, eased toward their held target each frame so
   *  the throttle and brake apply progressively rather than snapping on/off. */
  private gasValue = 0;
  private brakeValue = 0;

  /** Subscribe to keyboard + focus-loss events on the given window. */
  attach(target: Window): void {
    target.addEventListener("keydown", this.onKeyDown);
    target.addEventListener("keyup", this.onKeyUp);
    target.addEventListener("blur", this.onBlur);
  }

  /** Remove the listeners added by {@link attach}. */
  detach(target: Window): void {
    target.removeEventListener("keydown", this.onKeyDown);
    target.removeEventListener("keyup", this.onKeyUp);
    target.removeEventListener("blur", this.onBlur);
  }

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    // Gear toggle (G) is edge-triggered: fire once per physical press, ignoring
    // the OS key-repeat that would otherwise flip the gear every frame. (R is
    // reserved for reset, so the gear lives on its own key.)
    if (event.code === "KeyG" && !this.keys.has(event.code)) {
      this.toggleReverse();
    }
    this.keys.add(event.code);
  };

  private readonly onKeyUp = (event: KeyboardEvent): void => {
    this.keys.delete(event.code);
  };

  private readonly onBlur = (): void => {
    this.clear();
  };

  /** Set or release a touch/pointer control. */
  press(control: HeldControl, active: boolean): void {
    this.touch[control] = active;
  }

  /** Set the analog steering axis from the wheel (clamped to -1..1). */
  setSteerAxis(value: number): void {
    this.steerAxis = Math.max(-1, Math.min(1, value));
  }

  /** Select a transmission gear directly (false = Drive, true = Reverse). */
  setReverse(on: boolean): void {
    this.reverse = on;
  }

  /** Flip the gear between Drive and Reverse; returns the new state. */
  toggleReverse(): boolean {
    this.reverse = !this.reverse;
    return this.reverse;
  }

  /** Whether the transmission is currently in Reverse. */
  get inReverse(): boolean {
    return this.reverse;
  }

  private isHeld(control: HeldControl): boolean {
    if (this.touch[control]) return true;
    return KEY_MAP[control].some((code) => this.keys.has(code));
  }

  /**
   * Advance the analog pedals toward their held targets. Call once per frame
   * (before {@link read}) so gas and brake ramp in and out instead of snapping.
   */
  update(dt: number): void {
    this.gasValue = ease(this.gasValue, this.isHeld("gas") ? 1 : 0, this.isHeld("gas") ? PEDAL.gasRise : PEDAL.gasFall, dt);
    this.brakeValue = ease(this.brakeValue, this.isHeld("brake") ? 1 : 0, this.isHeld("brake") ? PEDAL.brakeRise : PEDAL.brakeFall, dt);
  }

  /** Snapshot the combined driver intent for this frame. */
  read(): DriveInput {
    const left = this.isHeld("left");
    const right = this.isHeld("right");
    const digital = (right ? 1 : 0) - (left ? 1 : 0);
    return {
      gas: this.gasValue,
      brake: this.brakeValue,
      // Combine keyboard/button steering with the analog wheel.
      steer: Math.max(-1, Math.min(1, digital + this.steerAxis)),
      reverse: this.reverse,
    };
  }

  /** Drop every held key and touch control (used on reset and focus loss). */
  clear(): void {
    this.keys.clear();
    this.touch = { gas: false, brake: false, left: false, right: false };
    this.steerAxis = 0;
    this.reverse = false;
    this.gasValue = 0;
    this.brakeValue = 0;
  }
}
