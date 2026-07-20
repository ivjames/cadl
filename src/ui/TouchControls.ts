import type { DrivingInput } from "../input/DrivingInput";

export interface TouchControlsOptions {
  onToggleCamera: () => void;
  onReset: () => void;
  onSignalLeft: () => void;
  onSignalRight: () => void;
  onGear: () => void;
}

/**
 * Wire an analog pedal: the throttle/brake demand is how far up the button the
 * finger presses (bottom edge ≈ 0, top edge = 1) — swipe up for more, down for
 * less. A fill level (`--pedal`) rises from the bottom to show how much is
 * applied, meeting the finger at the top on full.
 */
function bindPedal(id: string, set: (value: number) => void): void {
  const el = document.getElementById(id);
  if (!el) return;

  const level = (event: PointerEvent): number => {
    const r = el.getBoundingClientRect();
    // Inverted: top edge = full, bottom edge = 0.
    return Math.max(0, Math.min(1, 1 - (event.clientY - r.top) / r.height));
  };
  const apply = (value: number): void => {
    set(value);
    el.style.setProperty("--pedal", String(value));
  };

  const press = (event: PointerEvent): void => {
    event.preventDefault();
    try {
      el.setPointerCapture(event.pointerId);
    } catch {
      /* release listeners still cover us */
    }
    el.classList.add("is-pressed");
    apply(level(event));
  };
  const move = (event: PointerEvent): void => {
    if (!el.classList.contains("is-pressed")) return;
    apply(level(event));
  };
  const release = (): void => {
    el.classList.remove("is-pressed");
    apply(0);
  };

  el.addEventListener("pointerdown", press);
  el.addEventListener("pointermove", move);
  el.addEventListener("pointerup", release);
  el.addEventListener("pointercancel", release);
  el.addEventListener("lostpointercapture", release);
  el.addEventListener("contextmenu", (event) => event.preventDefault());
}

/** Wire a tap button (camera/reset) to a one-shot handler. */
function bindTap(id: string, handler: () => void): void {
  const el = document.getElementById(id);
  if (!el) return;

  const clearPressed = (): void => el.classList.remove("is-pressed");

  el.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    el.classList.add("is-pressed");
    handler();
  });
  el.addEventListener("pointerup", clearPressed);
  el.addEventListener("pointercancel", clearPressed);
  el.addEventListener("pointerleave", clearPressed);
}

/**
 * Connect the on-screen touch controls to the shared input + camera/reset
 * callbacks. Uses pointer events throughout so a single code path serves touch,
 * pen, and mouse. Also suppresses Safari pinch-zoom gesture events globally.
 */
export function setupTouchControls(input: DrivingInput, options: TouchControlsOptions): void {
  // Steering is the on-screen wheel (see SteeringWheel.ts) + keyboard.
  // Gas and brake are analog pedals — the demand tracks how far they're pressed.
  bindPedal("gasButton", (v) => input.setThrottle(v));
  bindPedal("brakeButton", (v) => input.setBrake(v));
  bindTap("cameraButton", options.onToggleCamera);
  bindTap("resetButton", options.onReset);
  bindTap("signalLeft", options.onSignalLeft);
  bindTap("signalRight", options.onSignalRight);
  bindTap("gearButton", options.onGear);

  // Block iOS Safari pinch-zoom / double-tap zoom over the controls & canvas.
  for (const type of ["gesturestart", "gesturechange", "gestureend"]) {
    document.addEventListener(type, (event) => event.preventDefault());
  }
}
