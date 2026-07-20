import type { DrivingInput } from "../input/DrivingInput";

/** Max wheel rotation each way (radians) — maps to full lock. */
const MAX_ANGLE = (130 * Math.PI) / 180;

/**
 * Wire the on-screen steering wheel: drag to rotate it (grab anywhere on the
 * rim), and the rotation maps to the analog steering axis. Releasing lets it
 * spring back to centre. Uses pointer events + capture so a finger sliding off
 * still steers and releases cleanly.
 */
export function setupSteeringWheel(input: DrivingInput): void {
  const wheel = document.getElementById("steerWheel");
  if (!wheel) return;

  let dragging = false;
  let startPointerAngle = 0;
  let startRotation = 0;
  let rotation = 0;

  const centre = (): { x: number; y: number } => {
    const r = wheel.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  };
  const pointerAngle = (event: PointerEvent): number => {
    const c = centre();
    return Math.atan2(event.clientY - c.y, event.clientX - c.x);
  };
  const apply = (): void => {
    wheel.style.transform = `rotate(${rotation}rad)`;
    input.setSteerAxis(Math.max(-1, Math.min(1, rotation / MAX_ANGLE)));
  };

  wheel.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    dragging = true;
    try {
      wheel.setPointerCapture(event.pointerId);
    } catch {
      /* release listeners still cover us */
    }
    wheel.style.transition = "none";
    wheel.classList.add("is-pressed");
    startPointerAngle = pointerAngle(event);
    startRotation = rotation;
  });

  wheel.addEventListener("pointermove", (event) => {
    if (!dragging) return;
    let delta = pointerAngle(event) - startPointerAngle;
    while (delta > Math.PI) delta -= 2 * Math.PI;
    while (delta < -Math.PI) delta += 2 * Math.PI;
    rotation = Math.max(-MAX_ANGLE, Math.min(MAX_ANGLE, startRotation + delta));
    apply();
  });

  const release = (): void => {
    if (!dragging) return;
    dragging = false;
    wheel.classList.remove("is-pressed");
    // Spring back to centre; CSS transitions the transform, steering zeroes now.
    wheel.style.transition = "transform 0.25s ease";
    rotation = 0;
    apply();
  };
  wheel.addEventListener("pointerup", release);
  wheel.addEventListener("pointercancel", release);
  wheel.addEventListener("lostpointercapture", release);
  wheel.addEventListener("contextmenu", (event) => event.preventDefault());
}
