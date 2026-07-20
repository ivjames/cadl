/**
 * California lesson definitions — pure data. A lesson is a set of objectives the
 * driver must complete (achievements) plus violations that fail it, evaluated by
 * {@link LessonRunner} over the driving-coach event stream.
 */

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
}

/** Human-readable objective labels, shared by the HUD. */
export const ACHIEVEMENT_LABELS: Record<AchievementKind, string> = {
  cleanStop: "Come to a full stop at the line",
  signaledTurn: "Signal and complete a turn",
};

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
];
