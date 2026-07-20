/**
 * Driving coach — pure scoring engine, no Babylon/DOM.
 *
 * Fed one {@link DrivingSample} per frame, it watches for the study-guide
 * violations the current mechanics can detect — rolling a stop, exceeding the
 * posted limit, and turning without signalling — and maintains a running score.
 * This is the seam graded California lessons build on; it holds no rendering or
 * DOM state so it can be unit-tested without a renderer.
 */

import type { SignalDirection } from "../vehicle/signals";
import type { StopAhead } from "../rules/stopControls";

/** A per-frame snapshot of everything the coach needs. */
export interface DrivingSample {
  /** Heading in radians (same convention as driving.ts). */
  heading: number;
  /** Absolute speed for HUD-style checks. */
  speedMph: number;
  /** True when over the posted limit (beyond tolerance). */
  overLimit: boolean;
  /** Active turn signal, or null. */
  signal: SignalDirection | null;
  /** Nearest stop control ahead, or null (from stopSignAhead). */
  stopAhead: StopAhead | null;
}

export type ViolationKind = "stop" | "speed" | "signal";

export interface Violation {
  kind: ViolationKind;
  message: string;
}

export const PENALTIES: Record<ViolationKind, number> = {
  stop: 15,
  speed: 10,
  signal: 10,
};

/** Speed (mph) below which the car counts as fully stopped. */
export const FULL_STOP_MPH = 1.5;
/** A stop control announced within this distance means we're in its stop zone. */
export const STOP_ZONE_M = 12;
/** Sustained seconds over the limit before a speeding violation registers. */
export const SPEEDING_GRACE_S = 0.75;
/** Heading swept (radians) before a manoeuvre counts as a turn. */
export const TURN_THRESHOLD = 0.7;
/** Per-frame heading change below which the car is "going straight". */
export const STRAIGHT_EPSILON = 0.005;

const STARTING_SCORE = 100;

export class DrivingCoach {
  private currentScore = STARTING_SCORE;
  private readonly log: Violation[] = [];

  // Speeding hysteresis.
  private overLimitTime = 0;
  private speedingActive = false;

  // Stop tracking: min speed seen while approaching the current stop control.
  private approachName: string | null = null;
  private approachMinMph = Infinity;

  // Turn / signal tracking.
  private prevHeading: number | null = null;
  private turnAccum = 0;
  private turnFlagged = false;
  private sawLeftSignal = false;
  private sawRightSignal = false;

  get score(): number {
    return this.currentScore;
  }

  get violations(): readonly Violation[] {
    return this.log;
  }

  reset(): void {
    this.currentScore = STARTING_SCORE;
    this.log.length = 0;
    this.overLimitTime = 0;
    this.speedingActive = false;
    this.approachName = null;
    this.approachMinMph = Infinity;
    this.prevHeading = null;
    this.turnAccum = 0;
    this.turnFlagged = false;
    this.sawLeftSignal = false;
    this.sawRightSignal = false;
  }

  /**
   * Advance one frame. Returns the violation emitted this frame, or null.
   */
  observe(sample: DrivingSample, dt: number): Violation | null {
    const headingDelta = this.prevHeading === null ? 0 : sample.heading - this.prevHeading;
    this.prevHeading = sample.heading;

    return (
      this.checkSpeeding(sample, dt) ??
      this.checkStops(sample) ??
      this.checkSignals(sample, headingDelta)
    );
  }

  private emit(violation: Violation): Violation {
    this.log.push(violation);
    this.currentScore = Math.max(0, this.currentScore - PENALTIES[violation.kind]);
    return violation;
  }

  private checkSpeeding(sample: DrivingSample, dt: number): Violation | null {
    if (sample.overLimit) {
      this.overLimitTime += dt;
      if (!this.speedingActive && this.overLimitTime >= SPEEDING_GRACE_S) {
        this.speedingActive = true;
        return this.emit({ kind: "speed", message: "Over the speed limit" });
      }
    } else {
      this.overLimitTime = 0;
      this.speedingActive = false;
    }
    return null;
  }

  private checkStops(sample: DrivingSample): Violation | null {
    const inZone =
      sample.stopAhead !== null && sample.stopAhead.distance <= STOP_ZONE_M
        ? sample.stopAhead.name
        : null;

    if (inZone !== null) {
      // Approaching a stop line: remember the slowest speed reached before it.
      if (inZone !== this.approachName) {
        this.approachName = inZone;
        this.approachMinMph = Infinity;
      }
      this.approachMinMph = Math.min(this.approachMinMph, sample.speedMph);
      return null;
    }

    // Just left a stop zone — grade whether we actually stopped.
    if (this.approachName !== null) {
      const rolledThrough = this.approachMinMph > FULL_STOP_MPH;
      this.approachName = null;
      const minMph = this.approachMinMph;
      this.approachMinMph = Infinity;
      if (rolledThrough) {
        return this.emit({
          kind: "stop",
          message: `Rolled the stop (${Math.round(minMph)} mph)`,
        });
      }
    }
    return null;
  }

  private checkSignals(sample: DrivingSample, headingDelta: number): Violation | null {
    const straight = Math.abs(headingDelta) < STRAIGHT_EPSILON;
    if (straight) {
      this.turnAccum = 0;
      this.turnFlagged = false;
      this.sawLeftSignal = false;
      this.sawRightSignal = false;
      return null;
    }

    this.turnAccum += headingDelta;
    if (sample.signal === "left") this.sawLeftSignal = true;
    if (sample.signal === "right") this.sawRightSignal = true;

    if (!this.turnFlagged && Math.abs(this.turnAccum) >= TURN_THRESHOLD) {
      this.turnFlagged = true;
      const turningLeft = this.turnAccum < 0; // left turn decreases heading
      const signalled = turningLeft ? this.sawLeftSignal : this.sawRightSignal;
      if (!signalled) {
        return this.emit({
          kind: "signal",
          message: `Turned ${turningLeft ? "left" : "right"} without signalling`,
        });
      }
    }
    return null;
  }
}
