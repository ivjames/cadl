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
/** Positive things a lesson can require the driver to do. */
export type AchievementKind = "cleanStop" | "signaledTurn";

export interface Violation {
  type: "violation";
  kind: ViolationKind;
  message: string;
}

export interface Achievement {
  type: "achievement";
  kind: AchievementKind;
  message: string;
}

/** Anything the coach emits in a frame. */
export type CoachEvent = Violation | Achievement;

export const PENALTIES: Record<ViolationKind, number> = {
  stop: 15,
  speed: 10,
  signal: 10,
};

/** Speed (mph) below which the car counts as fully stopped. */
export const FULL_STOP_MPH = 1.5;
/** A stop control announced within this distance means we're in its stop zone. */
export const STOP_ZONE_M = 12;
/** Only grade a stop if the car got at least this close to the line — otherwise
 *  it left the zone by turning away, not by crossing the line. */
export const STOP_CROSS_M = 3;
/** Sustained seconds over the limit before a speeding violation registers. */
export const SPEEDING_GRACE_S = 0.75;
/** Heading swept (radians) before a manoeuvre counts as a turn. */
export const TURN_THRESHOLD = 0.7;
/** Per-frame heading change below which the car isn't turning this frame. */
export const STRAIGHT_EPSILON = 0.005;
/** Sustained straight time (s) before a manoeuvre is considered finished — so a
 *  single slow frame mid-turn doesn't reset it. */
export const STRAIGHT_HOLD_S = 0.35;

const STARTING_SCORE = 100;

export class DrivingCoach {
  private currentScore = STARTING_SCORE;
  private readonly log: CoachEvent[] = [];

  // Speeding hysteresis.
  private overLimitTime = 0;
  private speedingActive = false;

  // Stop tracking: min speed + closest distance seen while approaching a control.
  private approachName: string | null = null;
  private approachMinMph = Infinity;
  private approachLastDistance = Infinity;

  // Turn / signal tracking.
  private prevHeading: number | null = null;
  private turnAccum = 0;
  private turnFlagged = false;
  private straightTime = 0;
  private sawLeftSignal = false;
  private sawRightSignal = false;

  get score(): number {
    return this.currentScore;
  }

  get violations(): readonly Violation[] {
    return this.log.filter((e): e is Violation => e.type === "violation");
  }

  get achievements(): readonly Achievement[] {
    return this.log.filter((e): e is Achievement => e.type === "achievement");
  }

  /** Whether the coach has recorded a given achievement kind at least once. */
  hasAchievement(kind: AchievementKind): boolean {
    return this.log.some((e) => e.type === "achievement" && e.kind === kind);
  }

  /** Whether a given violation kind has occurred at least once. */
  hasViolation(kind: ViolationKind): boolean {
    return this.log.some((e) => e.type === "violation" && e.kind === kind);
  }

  reset(): void {
    this.currentScore = STARTING_SCORE;
    this.log.length = 0;
    this.overLimitTime = 0;
    this.speedingActive = false;
    this.approachName = null;
    this.approachMinMph = Infinity;
    this.approachLastDistance = Infinity;
    this.prevHeading = null;
    this.turnAccum = 0;
    this.turnFlagged = false;
    this.straightTime = 0;
    this.sawLeftSignal = false;
    this.sawRightSignal = false;
  }

  /**
   * Advance one frame. Returns the event emitted this frame (violation or
   * achievement), or null.
   */
  observe(sample: DrivingSample, dt: number): CoachEvent | null {
    const headingDelta = this.prevHeading === null ? 0 : sample.heading - this.prevHeading;
    this.prevHeading = sample.heading;

    return (
      this.checkSpeeding(sample, dt) ??
      this.checkStops(sample) ??
      this.checkSignals(sample, headingDelta, dt)
    );
  }

  private emit(kind: ViolationKind, message: string): Violation {
    const violation: Violation = { type: "violation", kind, message };
    this.log.push(violation);
    this.currentScore = Math.max(0, this.currentScore - PENALTIES[kind]);
    return violation;
  }

  private award(kind: AchievementKind, message: string): Achievement {
    const achievement: Achievement = { type: "achievement", kind, message };
    this.log.push(achievement);
    return achievement;
  }

  private checkSpeeding(sample: DrivingSample, dt: number): CoachEvent | null {
    if (sample.overLimit) {
      this.overLimitTime += dt;
      if (!this.speedingActive && this.overLimitTime >= SPEEDING_GRACE_S) {
        this.speedingActive = true;
        return this.emit("speed", "Over the speed limit");
      }
    } else {
      this.overLimitTime = 0;
      this.speedingActive = false;
    }
    return null;
  }

  private checkStops(sample: DrivingSample): CoachEvent | null {
    const inZone =
      sample.stopAhead !== null && sample.stopAhead.distance <= STOP_ZONE_M
        ? sample.stopAhead
        : null;

    if (inZone !== null) {
      // Approaching a stop line: track the slowest speed and closest distance.
      if (inZone.name !== this.approachName) {
        this.approachName = inZone.name;
        this.approachMinMph = Infinity;
        this.approachLastDistance = Infinity;
      }
      this.approachMinMph = Math.min(this.approachMinMph, sample.speedMph);
      this.approachLastDistance = inZone.distance;
      return null;
    }

    // Left a stop zone. Only grade it as rolling the stop if the car actually
    // reached the line (got within STOP_CROSS_M) — leaving by turning away
    // early is not a rolled stop.
    if (this.approachName !== null) {
      const crossedLine = this.approachLastDistance <= STOP_CROSS_M;
      const rolledThrough = this.approachMinMph > FULL_STOP_MPH;
      const minMph = this.approachMinMph;
      this.approachName = null;
      this.approachMinMph = Infinity;
      this.approachLastDistance = Infinity;
      if (crossedLine && rolledThrough) {
        return this.emit("stop", `Rolled the stop (${Math.round(minMph)} mph)`);
      }
      if (crossedLine) {
        return this.award("cleanStop", "Full stop at the line");
      }
    }
    return null;
  }

  private checkSignals(sample: DrivingSample, headingDelta: number, dt: number): CoachEvent | null {
    // A single slow frame isn't "straight" — only sustained straightness ends
    // the manoeuvre, so slow (low-speed) turns still accumulate and get graded.
    if (Math.abs(headingDelta) < STRAIGHT_EPSILON) {
      this.straightTime += dt;
      if (this.straightTime >= STRAIGHT_HOLD_S) {
        this.turnAccum = 0;
        this.turnFlagged = false;
        this.sawLeftSignal = false;
        this.sawRightSignal = false;
      }
      return null;
    }

    this.straightTime = 0;
    this.turnAccum += headingDelta;
    if (sample.signal === "left") this.sawLeftSignal = true;
    if (sample.signal === "right") this.sawRightSignal = true;

    if (!this.turnFlagged && Math.abs(this.turnAccum) >= TURN_THRESHOLD) {
      this.turnFlagged = true;
      const turningLeft = this.turnAccum < 0; // left turn decreases heading
      const signalled = turningLeft ? this.sawLeftSignal : this.sawRightSignal;
      const way = turningLeft ? "left" : "right";
      return signalled
        ? this.award("signaledTurn", `Signalled ${way} turn`)
        : this.emit("signal", `Turned ${way} without signalling`);
    }
    return null;
  }
}
