/**
 * California lesson definitions — pure data. A lesson is a set of objectives the
 * driver must complete (achievements) plus violations that fail it, evaluated by
 * {@link LessonRunner} over the driving-coach event stream.
 */

import type { ParkingBay } from "../rules/parking";
import type { AchievementKind, ViolationKind } from "./scoring";

export interface LessonDef {
  id: string;
  title: string;
  instruction: string;
  /** Achievement kinds that must each occur at least once to pass. */
  require: AchievementKind[];
  /** Violation kinds that immediately fail the lesson. */
  failOn: ViolationKind[];
  /** Minimum score required to pass. */
  passScore: number;
  /** A parking bay to render and grade against (parking lessons only). */
  bay?: ParkingBay;
}

/** Human-readable objective labels, shared by the HUD. */
export const ACHIEVEMENT_LABELS: Record<AchievementKind, string> = {
  cleanStop: "Come to a full stop at the line",
  signaledTurn: "Signal and complete a turn",
  parked: "Come to rest inside the marked bay",
};

/**
 * The bay for the parking lesson: just ahead and to the right of spawn, off the
 * travel lane (east of the kerb, so ambient traffic doesn't drive through it)
 * and aligned with the road. It sits in clear view down the chase camera, so
 * the driver can steer into it forward and use Reverse to straighten up.
 */
export const PARKING_BAY: ParkingBay = { cx: 8.5, cz: -12, halfW: 1.7, halfD: 3.2, axis: 0 };

export const LESSONS: readonly LessonDef[] = [
  {
    id: "free",
    title: "Free Drive",
    instruction: "Drive around. Your score tracks stops, speed, and signalling.",
    require: [],
    failOn: [],
    passScore: 0,
  },
  {
    id: "stop-go",
    title: "Stop & Go",
    instruction: "Come to a complete stop at the stop line, then continue.",
    require: ["cleanStop"],
    failOn: ["stop"],
    passScore: 80,
  },
  {
    id: "signal-turn",
    title: "Signal Your Turn",
    instruction: "Signal first, then complete a turn at the intersection.",
    require: ["signaledTurn"],
    failOn: ["signal"],
    passScore: 80,
  },
  {
    id: "intersection",
    title: "Full Intersection",
    instruction: "Stop at the line, then signal and complete your turn — no speeding.",
    require: ["cleanStop", "signaledTurn"],
    failOn: ["stop", "signal", "speed"],
    passScore: 80,
  },
  {
    id: "parking",
    title: "Pull In & Park",
    instruction: "Steer into the marked bay on your right and stop fully inside it — use Reverse (R) to straighten up.",
    require: ["parked"],
    failOn: [],
    passScore: 70,
    bay: PARKING_BAY,
  },
];
